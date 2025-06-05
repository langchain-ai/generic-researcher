import {
  TableGeneratorState,
  RowResearcherState,
  BaseRowGeneratorState,
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
  getGenerateInitialSearchQueriesPrompt,
  getParseSearchResultsPrompt,
  getGenerateEntitySearchQueriesPrompt,
  getParseEntitySearchResultsPrompt,
  getMinRequiredRowsPrompt,
  getGenerateAdditionalSearchQueriesPrompt,
  getParseAdditionalSearchResultsPrompt,
} from "./prompts.mts";
import { buildDynamicTableSchema, Column } from "./types.mts";
import { selectAndExecuteSearch } from "../search/search.mts";
import { z } from "zod";
import { Send, Command, END } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { initChatModel } from "langchain/chat_models/universal";

/* Table Generator Nodes */
export async function extractTableSchema(
  state: typeof TableGeneratorState.State,
  config: RunnableConfig<typeof ConfigurableAnnotation.State>,
) {
  const { question } = state;
  const {
    llmStructuredOutputRetries = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
    writerModel = DEFAULT_WRITER_MODEL,
  } = config.configurable || {};

  const { primaryKey, criteria } = await (await initChatModel(writerModel))
    .withStructuredOutput(TableExtractionSchema)
    .withRetry({ stopAfterAttempt: llmStructuredOutputRetries })
    .invoke(getExtractTableSchemaPrompt(question));

  return { primaryKey, criteria };
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

export async function gatherRowUpdates(state: typeof RowResearcherState.State) {
  // TODO: Add a potential filter loop to get rid of rows that are not valid according to the criteria outlined in the question.
  // TODO: Add a retry loop to look for more base rows, and then kick off more row researchers.
  return {};
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
