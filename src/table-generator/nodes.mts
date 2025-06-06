import {
  TableGeneratorState,
  RowResearcherState,
  BaseRowGeneratorState,
  TablePostProcessingState,
  ConfigurableAnnotation,
} from "./state.mts";
import {
  DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
  DEFAULT_WRITER_MODEL,
  DEFAULT_SUMMARIZER_MODEL,
  DEFAULT_SEARCH_API,
  DEFAULT_MAX_BASE_ROW_SEARCH_ITERATIONS,
  DEFAULT_MAX_SEARCH_ITERATIONS_PER_ROW,
} from "./const.mts";
import {
  TableExtractionSchema,
  SearchQueriesSchema,
  MinRequiredRowsSchema,
} from "./types.mts";
import {
  getExtractTableSchemaPrompt,
  getExtractTableSchemaPromptIteration,
  getGenerateInitialSearchQueriesPrompt,
  getParseSearchResultsPrompt,
  getGenerateEntitySearchQueriesPrompt,
  getParseEntitySearchResultsPrompt,
  getMinRequiredRowsPrompt,
  getGenerateAdditionalSearchQueriesPrompt,
  getParseAdditionalSearchResultsPrompt,
  getTablePostProcessingPrompt,
} from "./prompts.mts";
import { buildDynamicTableSchema } from "./types.mts";
import { selectAndExecuteSearch } from "../search/search.mts";
import { z } from "zod";
import { Send, Command, END, getCurrentTaskInput, interrupt } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { initChatModel } from "langchain/chat_models/universal";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";


/* Table Generator Nodes */
export async function extractTableSchema(
  state: typeof TableGeneratorState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1].content as string;
  const {
    llmStructuredOutputRetries = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
    writerModel = DEFAULT_WRITER_MODEL,
  } = config.configurable || {};

  let prompt = getExtractTableSchemaPrompt(lastMessage);
  while (true) {
    const { primaryKey, criteria } = await (await initChatModel(writerModel))
      .withStructuredOutput(TableExtractionSchema)
      .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
      .invoke(prompt);

    const interruptMessage = `Please provide feedback on the table schema. If you are happy with it, say 'yes'. If you are not happy with it, say 'no' and provide feedback on what you would like to change.
    The current schema is:
    Primary Key:
    ${primaryKey.name} - ${primaryKey.description}
    Additional Columns:
    ${criteria.map((c) => `${c.name} - ${c.description}`).join("\n")}
    `;
    const response = interrupt(interruptMessage);
    console.log(response);
    if (response === "yes") {
      return { primaryKey, criteria, question: lastMessage };
    } else {
      prompt = getExtractTableSchemaPromptIteration(lastMessage, response, primaryKey, criteria);
    }
  }
}

export function kickOffRowResearch(state: typeof TableGeneratorState.State) {
  const { rows, primaryKey, criteria } = state;

  if (!rows || Object.keys(rows).length === 0) {
    console.error("No valid rows to research");
    return [];
  }

  const requiredKeys = [primaryKey.name, ...criteria.map(({ name }) => name)];

  return Object.values(rows)
    .filter(
      (row) =>
        row?.[primaryKey.name] &&
        !requiredKeys.every((key) => key in row && row[key] != null),
    )
    .map(
      (row) =>
        new Send("Row Researcher", {
          row,
          primaryKey,
          criteria,
          attempts: 0,
        }),
    );
}

export async function postProcessTable(state: typeof TableGeneratorState.State) {
  const { question, rows } = state;
  const { rows: updatedRows } = await tablePostProcessingAgent.invoke({
    messages: [
      new HumanMessage(`The current table is: ${JSON.stringify(rows)}, and the original user's question is: ${question}. Please post-process the table to answer the question specifically and get this table into the right format.`),
    ],
    rows,
  });
  return { finalTable: updatedRows };
}

/* Base Row Generator Nodes */
export async function generateBaseRowSearchQueries(
  state: typeof BaseRowGeneratorState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const {
    question,
    primaryKey,
    criteria,
    rows,
    historicalRowSearchQueries,
    researchAttempts = 0,
  } = state;
  const {
    llmStructuredOutputRetries = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
    writerModel = DEFAULT_WRITER_MODEL,
  } = config.configurable || {};

  const stateUpdate: Partial<typeof BaseRowGeneratorState.State> = {
    researchAttempts: researchAttempts + 1,
  };

  if (!state.requiredRowsForSearch || !state.targetRows) {
    try {
      const { requiredRowsForSearch, targetRows } = await (
        await initChatModel(writerModel)
      )
        .withStructuredOutput(MinRequiredRowsSchema)
        .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
        .invoke(getMinRequiredRowsPrompt(question));
      stateUpdate.requiredRowsForSearch = requiredRowsForSearch;
      stateUpdate.targetRows = targetRows;
    } catch (error) {
      console.error("Error generating minimum required rows:", error);
    }
  }

  const generatorPrompt = !rows?.length
    ? getGenerateInitialSearchQueriesPrompt(
        question,
        primaryKey,
        criteria,
        stateUpdate.requiredRowsForSearch || state.requiredRowsForSearch!,
      )
    : getGenerateAdditionalSearchQueriesPrompt(
        question,
        primaryKey,
        criteria,
        rows,
        historicalRowSearchQueries,
        stateUpdate.requiredRowsForSearch || state.requiredRowsForSearch!,
      );
  try {
    const { queries } = await (await initChatModel(writerModel))
      .withStructuredOutput(SearchQueriesSchema)
      .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
      .invoke(generatorPrompt);
    const rowSearchQueries = queries.map((q) => q.searchQuery);
    return {
      ...stateUpdate,
      currentRowSearchQueries: rowSearchQueries,
      historicalRowSearchQueries: rowSearchQueries,
    };
  } catch (error) {
    console.error("Error generating search queries:", error);
    return {
      ...stateUpdate,
    };
  }
}

export async function searchForBaseRows(
  state: typeof BaseRowGeneratorState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const { question, currentRowSearchQueries, primaryKey, criteria, rows } =
    state;
  const {
    llmStructuredOutputRetries = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
    writerModel = DEFAULT_WRITER_MODEL,
    summarizerModel = DEFAULT_SUMMARIZER_MODEL,
    searchApi = DEFAULT_SEARCH_API,
  } = config.configurable || {};

  const baseResearchResults = await selectAndExecuteSearch(
    searchApi,
    currentRowSearchQueries,
    await initChatModel(summarizerModel),
    llmStructuredOutputRetries,
  );

  const entitySchema = buildDynamicTableSchema(primaryKey, criteria);

  try {
    const parserPrompt = !rows?.length
      ? getParseSearchResultsPrompt(
          question,
          baseResearchResults,
          primaryKey,
          criteria,
        )
      : getParseAdditionalSearchResultsPrompt(
          question,
          baseResearchResults,
          primaryKey,
          criteria,
          rows,
        );

    const { results } = await (
      await initChatModel(writerModel)
    )
      .withStructuredOutput(z.object({ results: z.array(entitySchema) }))
      .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
      .invoke(parserPrompt);

    if (!results?.length) {
      console.error("No valid results parsed from search");
      return { rows: {} };
    }

    const newParsedRows = results.reduce(
      (acc, row) => {
        if (row?.[primaryKey.name]) {
          acc[row[primaryKey.name]] = row;
        }
        return acc;
      },
      {} as Record<string, z.ZodObject<Record<string, z.ZodTypeAny>>>,
    );

    console.log(`Parsed rows: ${Object.keys(newParsedRows).join(", ")}`);
    console.log(
      `Total rows: ${Object.keys({ ...rows, ...newParsedRows }).length}`,
    );

    return {
      rows: { ...rows, ...newParsedRows },
    };
  } catch (error) {
    console.error("Error parsing search results:", error);
    return { rows: {} };
  }
}

export function checkBaseRowSearchExitConditions(
  state: typeof BaseRowGeneratorState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const { rows, requiredRowsForSearch, researchAttempts } = state;
  const {
    maxBaseRowSearchIterations = DEFAULT_MAX_BASE_ROW_SEARCH_ITERATIONS,
  } = config.configurable || {};

  if (!requiredRowsForSearch) {
    return "Generate Base Row Search Queries";
  }

  const currentRowCount = Object.keys(rows).length;
  const hasReachedMaxAttempts = researchAttempts >= maxBaseRowSearchIterations;
  const hasMetRowRequirement = currentRowCount >= requiredRowsForSearch;

  if (hasReachedMaxAttempts || hasMetRowRequirement) {
    console.log(
      `Base row search exit conditions met: ${currentRowCount} >= ${requiredRowsForSearch} or ` +
        `${researchAttempts} > ${maxBaseRowSearchIterations}`,
    );
    return END;
  }

  console.log(
    `Base row search exit conditions not met: ${currentRowCount} < ${requiredRowsForSearch} and ` +
      `${researchAttempts} <= ${maxBaseRowSearchIterations}`,
  );
  return "Generate Base Row Search Queries";
}

/* Row Researcher Nodes */
export async function generateQueriesForEntity(
  state: typeof RowResearcherState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const { row, criteria } = state;
  const {
    llmStructuredOutputRetries = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
    writerModel = DEFAULT_WRITER_MODEL,
  } = config.configurable || {};

  const missingCriteria = criteria.filter(({ name }) => !(name in row));

  try {
    const { queries } = await (
      await initChatModel(writerModel)
    )
      .withStructuredOutput(SearchQueriesSchema)
      .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
      .invoke(
        getGenerateEntitySearchQueriesPrompt(
          JSON.stringify(row, null, 2),
          missingCriteria,
        ),
      );

    return {
      entitySearchQueries: queries.map((q) => q.searchQuery),
    };
  } catch (error) {
    console.error("Error generating entity search queries:", error);
    return {
      entitySearchQueries: [],
    };
  }
}

export async function updateEntityColumns(
  state: typeof RowResearcherState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const { row, entitySearchQueries, primaryKey, criteria, attempts } = state;
  const {
    llmStructuredOutputRetries = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
    writerModel = DEFAULT_WRITER_MODEL,
    summarizerModel = DEFAULT_SUMMARIZER_MODEL,
    searchApi = DEFAULT_SEARCH_API,
    maxSearchIterationsPerRow = DEFAULT_MAX_SEARCH_ITERATIONS_PER_ROW,
  } = config.configurable || {};

  if (!entitySearchQueries?.length) {
    return {
      attempts: attempts + 1,
    };
  }

  try {
    const searchResults = await selectAndExecuteSearch(
      searchApi,
      entitySearchQueries,
      await initChatModel(summarizerModel),
      llmStructuredOutputRetries,
    );

    const entitySchema = buildDynamicTableSchema(primaryKey, criteria);
    const { result: updatedRow } = await (
      await initChatModel(writerModel)
    )
      .withStructuredOutput(z.object({ result: entitySchema }))
      .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
      .invoke(
        getParseEntitySearchResultsPrompt(
          JSON.stringify(row, null, 2),
          searchResults,
          primaryKey,
          criteria,
        ),
      );

    const missingKeys = criteria
      .map(({ name }) => name)
      .filter((key) => !(key in updatedRow && updatedRow[key] != null));

    if (missingKeys.length === 0 || attempts + 1 > maxSearchIterationsPerRow) {
      return new Command({
        goto: END,
        update: {
          rows: { [row[primaryKey.name]]: { ...row, ...updatedRow } },
          attempts: attempts + 1,
        },
      });
    } else {
      return new Command({
        goto: "Generate Queries for Entity",
        update: {
          row: { ...row, ...updatedRow },
          attempts: attempts + 1,
        },
      });
    }
  } catch (error) {
    console.error("Error updating entity columns:", error);
    return new Command({
      goto: "Generate Queries for Entity",
      update: {
        attempts: attempts + 1,
      },
    });
  }
}

/* Table Processing Nodes */
import { tool } from "@langchain/core/tools";
import { ToolMessage } from "@langchain/core/messages";


const sortTableTool = tool(
  async (input, config) => {
    const { columnToSortBy, sortDirection } = input;
    const currentState = getCurrentTaskInput() as typeof TableGeneratorState.State;
    const sortedTable = Object.values(currentState.rows).sort((a, b) => {
      return sortDirection === "asc" ? a[columnToSortBy] - b[columnToSortBy] : b[columnToSortBy] - a[columnToSortBy];
    });
    return new Command({
      update: {
        rows: sortedTable,
        messages: [
          new ToolMessage({
            content: `Successfully sorted this table: ${JSON.stringify(sortedTable)}`,
            tool_call_id: config.toolCall.id,
          }),
        ],
      },
    });
  },
  {
    name: "sortTable",
    description: "Sort a table by a given criteria",
    schema: z.object({
      columnToSortBy: z.string(),
      sortDirection: z.enum(["asc", "desc"]),
    }),
  },
);

const filterTableTool = tool(
  async (input, config) => {
    const { columnToFilter, filterValue, filterType } = input;
    const currentState = getCurrentTaskInput() as typeof TableGeneratorState.State;
    const filteredTable = Object.values(currentState.rows).filter((row) => {
      return filterType === "equals" ? row[columnToFilter] === filterValue : filterType === "notEquals" ? row[columnToFilter] !== filterValue : filterType === "greaterThan" ? row[columnToFilter] > filterValue : filterType === "lessThan" ? row[columnToFilter] < filterValue : filterType === "greaterThanOrEqual" ? row[columnToFilter] >= filterValue : row[columnToFilter] <= filterValue;
    });
    return new Command({
      update: {
        rows: filteredTable,
        messages: [
          new ToolMessage({
            content: `Successfully filtered this table: ${JSON.stringify(filteredTable)}`,
            tool_call_id: config.toolCall.id,
          }),
        ],
      },
    });
  },
  {
    name: "filterTable",
    description: "Filter a table by a given criteria. Make sure the type is right that you pass in to the filterValue!",
    schema: z.object({
      columnToFilter: z.string(),
      filterValue: z.any(),
      filterType: z.enum(["equals", "notEquals", "greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual"]),
    }),
  },
);

const truncateTableTool = tool(
  async (input, config) => {
    const { numRowsToKeep } = input;
    const currentState = getCurrentTaskInput() as typeof TableGeneratorState.State;
    const truncatedTable = Object.values(currentState.rows).slice(0, numRowsToKeep);
    return new Command({
      update: {
        rows: truncatedTable,
        messages: [
          new ToolMessage({
            content: `Successfully truncated this table: ${JSON.stringify(truncatedTable)}`,
            tool_call_id: config.toolCall.id,
          }),
        ],
      },
    });
  },
  {
    name: "truncateTable",
    description: "Truncate a table to a given number of rows",
    schema: z.object({
      numRowsToKeep: z.number(),
    }),
  },
);

const tablePostProcessingAgent = createReactAgent({
  llm: await initChatModel(DEFAULT_WRITER_MODEL),
  tools: [sortTableTool, filterTableTool, truncateTableTool],
  prompt: getTablePostProcessingPrompt(),
  stateSchema: TablePostProcessingState,
});