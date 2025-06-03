import { TableGeneratorState, RowResearcherState, BaseRowGeneratorState } from "./state.mts";
import { TableExtractionSchema, SearchQueriesSchema, MinRequiredRowsSchema } from "./types.mts";
import { getExtractTableSchemaPrompt, getGenerateInitialSearchQueriesPrompt, getParseSearchResultsPrompt, getGenerateEntitySearchQueriesPrompt, getParseEntitySearchResultsPrompt, getMinRequiredRowsPrompt, getGenerateAdditionalSearchQueriesPrompt, getParseAdditionalSearchResultsPrompt } from "./prompts.mts";
import { llm, MAX_SEARCH_ITERATIONS_PER_ROW, MAX_BASE_ROW_SEARCH_ITERATIONS, RETRY_CONFIG } from "./const.mts";
import { buildDynamicTableSchema, Column } from "./types.mts";
import { selectAndExecuteSearch } from "../search/search.mts";
import { z } from "zod";
import { Send, Command, END } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";

// Table Generator Nodes

export async function extractTableSchema(state: typeof TableGeneratorState.State, config?: RunnableConfig) {
    const { question } = state;
    const extractionLlm = llm.withStructuredOutput(TableExtractionSchema).withRetry(RETRY_CONFIG);
    const extractionPrompt = getExtractTableSchemaPrompt(question);
    const extractionResponse = await extractionLlm.invoke(extractionPrompt);

    return {
        primaryKey: extractionResponse.primaryKey,
        criteria: extractionResponse.criteria,
    }
}

export function kickOffRowResearch(state: typeof TableGeneratorState.State) {
    const { rows, primaryKey, criteria } = state;
    
    if (!rows || !Object.keys(rows).length) {
        console.error('No valid rows to research');
        return [];
    }

    const allKeys = [primaryKey.name, ...criteria.map(col => col.name)];

    return Object.values(rows)
        .filter(row => row && row[primaryKey.name] && !allKeys.every(key => key in row))
        .map(row => new Send("Row Researcher", {
            row: row,
            primaryKey: primaryKey,
            criteria: criteria,
            attempts: 0
        }))
}

export async function gatherRowUpdates(state: typeof RowResearcherState.State) {
    // TODO: Add a potential filter loop to get rid of rows that are not valid according to the criteria outlined in the question.

    // TODO: Add a retry loop to look for more base rows, and then kick off more row researchers.

    return {}
}

// Base Row Generator Nodes

export async function generateBaseRowSearchQueries(state: typeof BaseRowGeneratorState.State) {
    const { question, primaryKey, criteria, rows, historicalRowSearchQueries, researchAttempts = 0, minRequiredRows } = state;

    const stateUpdate = {
        researchAttempts: researchAttempts + 1
    }

    if (!minRequiredRows || minRequiredRows == 0) {
        const minRequiredRowsLlm = llm.withStructuredOutput(MinRequiredRowsSchema).withRetry(RETRY_CONFIG)
        const minRequiredRowsPrompt = getMinRequiredRowsPrompt(question)
        const minRequiredRowsResponse = await minRequiredRowsLlm.invoke(minRequiredRowsPrompt)
        stateUpdate["minRequiredRows"] = minRequiredRowsResponse.minRequiredRows;
    }

    const generatorPrompt = (!rows ||Object.keys(rows).length == 0) ? 
        getGenerateInitialSearchQueriesPrompt(question, primaryKey, criteria) :
        getGenerateAdditionalSearchQueriesPrompt(question, primaryKey, criteria, rows, historicalRowSearchQueries)

    const generatorLlm = llm.withStructuredOutput(SearchQueriesSchema).withRetry(RETRY_CONFIG)
    const generatorResponse = await generatorLlm.invoke(generatorPrompt)
    const rowSearchQueries = generatorResponse.queries.map(q => q.searchQuery)

    stateUpdate["currentRowSearchQueries"] = rowSearchQueries
    stateUpdate["historicalRowSearchQueries"] = rowSearchQueries

    return stateUpdate
}

export async function searchForBaseRows(state: typeof BaseRowGeneratorState.State) {
    const { question, currentRowSearchQueries, primaryKey, criteria, rows } = state;
    const baseResearchResults = await selectAndExecuteSearch("tavily", currentRowSearchQueries);

    const entitySchema = buildDynamicTableSchema(primaryKey, criteria)
    const parserLlm = llm.withStructuredOutput(z.object({
        results: z.array(entitySchema)
    })).withRetry(RETRY_CONFIG)

    const parserPrompt = (!rows ||Object.keys(rows).length == 0) ? 
        getParseSearchResultsPrompt(question, baseResearchResults, primaryKey, criteria) :
        getParseAdditionalSearchResultsPrompt(question, baseResearchResults, primaryKey, criteria, rows)
    const parserResponse = await parserLlm.invoke(parserPrompt)

    if (!parserResponse?.results?.length) {
        console.error('No valid results parsed from search');
        return { rows: {} };
    }

    const newParsedRows = parserResponse.results.reduce((acc, row) => {
        if (row && row[primaryKey.name]) {
            acc[row[primaryKey.name]] = row;
        } else {
            console.error('Invalid row data:', row);
        }
        return acc;
    }, {} as { [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> })

    console.log(`New parsed rows: ${Object.keys(newParsedRows).join(", ")}`)
    console.log(`New parsed rows length: ${Object.keys(newParsedRows).length}`)
    const totalRows = {
        ...rows,
        ...newParsedRows
    }
    console.log(`Total rows: ${Object.keys(totalRows || {}).length}`)

    return {
        rows: totalRows
    }
}

export function checkBaseRowSearchExitConditions(state: typeof BaseRowGeneratorState.State) {
    const { rows, minRequiredRows, researchAttempts } = state;
    if (!minRequiredRows || minRequiredRows == 0) {
        return "Generate Base Row Search Queries";
    }
    if (researchAttempts >= MAX_BASE_ROW_SEARCH_ITERATIONS || Object.keys(rows).length >= minRequiredRows) {
        console.log(`Base row search exit conditions met: ${Object.keys(rows).length} >= ${minRequiredRows} or ${researchAttempts} > ${MAX_BASE_ROW_SEARCH_ITERATIONS}`)
        return END;
    }
    console.log(`Base row search exit conditions not met: ${Object.keys(rows).length} < ${minRequiredRows} and ${researchAttempts} <= ${MAX_BASE_ROW_SEARCH_ITERATIONS}`)
    return "Generate Base Row Search Queries";
}

// Row Researcher Nodes

export async function generateQueriesForEntity(state: typeof RowResearcherState.State) {
    const { row, criteria } = state;
    
    const schemaFields = [...criteria].map(col => col.name);
    const missingKeys = schemaFields.filter(key => !(key in row))
    const missingCriteria: Column[] = criteria.filter(c => missingKeys.includes(c.name))

    const generatorLlm = llm.withStructuredOutput(SearchQueriesSchema).withRetry(RETRY_CONFIG)
    const rowString = JSON.stringify(row, null, 2)
    const generatorPrompt = getGenerateEntitySearchQueriesPrompt(rowString, missingCriteria)
    const generatorResponse = await generatorLlm.invoke(generatorPrompt)

    return {
        entitySearchQueries: generatorResponse ? generatorResponse.queries.map(q => q.searchQuery) : []
    }
}

export async function updateEntityColumns(state: typeof RowResearcherState.State) {
    const { row, entitySearchQueries, primaryKey, criteria } = state;
    const searchResults = await selectAndExecuteSearch("tavily", entitySearchQueries);
    const entitySchema = buildDynamicTableSchema(primaryKey, criteria)
    const parserLlm = llm.withStructuredOutput(z.object({
        result: entitySchema
    })).withRetry(RETRY_CONFIG);
    const parserPrompt = getParseEntitySearchResultsPrompt(JSON.stringify(row, null, 2), searchResults, primaryKey, criteria)
    const parserResponse = await parserLlm.invoke(parserPrompt)

    const schemaFields = criteria.map(col => col.name);
    const updatedRow = {
        ...row,
        ...parserResponse.result
    }
    const missingKeys = schemaFields.filter(key => !(key in updatedRow))
    if (missingKeys.length === 0 || state.attempts + 1 > MAX_SEARCH_ITERATIONS_PER_ROW) {
        return new Command({
            goto: END,
            update: {
                rows: {
                    [row[primaryKey.name]]: {
                        ...updatedRow
                    }
                },
                attempts: state.attempts + 1
            }
        })
    }
    return new Command({
        goto: "Generate Queries for Entity",
        update: {
            row: {
                ...updatedRow
            },
            attempts: state.attempts + 1,
            missingKeys: missingKeys
        }
    })
}
