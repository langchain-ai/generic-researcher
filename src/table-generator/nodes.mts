import { TableGeneratorState, RowResearcherState } from "./state.mts";
import { TableExtractionSchema, SearchQueriesSchema } from "./types.mts";
import { getExtractTableSchemaPrompt, getGenerateInitialSearchQueriesPrompt, getParseSearchResultsPrompt, getGenerateEntitySearchQueriesPrompt, getParseEntitySearchResultsPrompt } from "./prompts.mts";
import { llm, MAX_SEARCH_ITERATIONS_PER_ROW } from "./const.mts";
import { buildDynamicTableSchema, Column } from "./types.mts";
import { selectAndExecuteSearch } from "../search/search.mts";
import { z } from "zod";
import { Send, Command, END } from "@langchain/langgraph";

// Table Generator Nodes

export async function extractTableSchema(state: typeof TableGeneratorState.State) {
    const { question } = state;
    const extractionLlm = llm.withStructuredOutput(TableExtractionSchema);
    const extractionPrompt = getExtractTableSchemaPrompt(question);
    const extractionResponse = await extractionLlm.invoke(extractionPrompt);

    return {
        primaryKey: extractionResponse.primaryKey,
        criteria: extractionResponse.criteria,
        additionalColumns: extractionResponse.additionalColumns,
    }
}

export async function generateInitialSearchQueries(state: typeof TableGeneratorState.State) {
    const { question, primaryKey, criteria, additionalColumns } = state;

    const generatorLlm = llm.withStructuredOutput(SearchQueriesSchema)
    const generatorPrompt = getGenerateInitialSearchQueriesPrompt(question, primaryKey, criteria, additionalColumns)
    const generatorResponse = await generatorLlm.invoke(generatorPrompt)

    return {
        rowSearchQueries: generatorResponse.queries.map(q => q.searchQuery)
    }
}

export async function searchForBaseRows(state: typeof TableGeneratorState.State) {
    const { rowSearchQueries, primaryKey, criteria, additionalColumns } = state;
    const baseResearchResults = await selectAndExecuteSearch("tavily", rowSearchQueries);

    const entitySchema = buildDynamicTableSchema(primaryKey, criteria, additionalColumns)
    const parserLlm = llm.withStructuredOutput(z.object({
        results: z.array(entitySchema)
    })) 
    const parserPrompt = getParseSearchResultsPrompt(baseResearchResults, primaryKey, criteria, additionalColumns)
    const parserResponse = await parserLlm.invoke(parserPrompt)

    if (!parserResponse?.results?.length) {
        console.error('No valid results parsed from search');
        return { rows: {} };
    }

    return {
        rows: parserResponse.results.reduce((acc, row) => {
            if (row && row[primaryKey.name]) {
                acc[row[primaryKey.name]] = row;
            } else {
                console.error('Invalid row data:', row);
            }
            return acc;
        }, {} as { [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> })
    }
}

export function kickOffRowResearch(state: typeof TableGeneratorState.State) {
    const { rows, primaryKey, criteria, additionalColumns } = state;
    
    if (!rows || !Object.keys(rows).length) {
        console.error('No valid rows to research');
        return [];
    }

    return Object.values(rows)
        .filter(row => row && row[primaryKey.name])
        .map(row => new Send("Row Researcher", {
            row: row,
            primaryKey: primaryKey,
            criteria: criteria,
            additionalColumns: additionalColumns,
            attempts: 0
        }))
}

export async function gatherRowUpdates(state: typeof RowResearcherState.State) {
    // TODO: Add a potential filter loop to get rid of rows that are not valid according to the criteria outlined in the question.

    // TODO: Add a retry loop to look for more base rows, and then kick off more row researchers.

    return {}
}

// Row Researcher Nodes

export async function generateQueriesForEntity(state: typeof RowResearcherState.State) {
    const { row, criteria, additionalColumns } = state;
    
    const schemaFields = [...criteria, ...additionalColumns].map(col => col.name);
    const missingKeys = schemaFields.filter(key => !(key in row))
    const missingCriteria: Column[] = criteria.filter(c => missingKeys.includes(c.name))
    const missingAdditionalColumns: Column[] = additionalColumns.filter(c => missingKeys.includes(c.name))
    const missingCriteriaAndAdditionalColumns: Column[] = [...missingCriteria, ...missingAdditionalColumns]

    const generatorLlm = llm.withStructuredOutput(SearchQueriesSchema)
    const rowString = JSON.stringify(row, null, 2)
    const generatorPrompt = getGenerateEntitySearchQueriesPrompt(rowString, missingCriteriaAndAdditionalColumns)
    const generatorResponse = await generatorLlm.invoke(generatorPrompt)

    return {
        entitySearchQueries: generatorResponse.queries.map(q => q.searchQuery)
    }
}

export async function updateEntityColumns(state: typeof RowResearcherState.State) {
    const { row, entitySearchQueries, primaryKey, criteria, additionalColumns } = state;
    const searchResults = await selectAndExecuteSearch("tavily", entitySearchQueries);
    const entitySchema = buildDynamicTableSchema(primaryKey, criteria, additionalColumns)
    const parserLlm = llm.withStructuredOutput(z.object({
        result: entitySchema
    }));
    const parserPrompt = getParseEntitySearchResultsPrompt(JSON.stringify(row, null, 2), searchResults, primaryKey, criteria, additionalColumns)
    const parserResponse = await parserLlm.invoke(parserPrompt)

    const schemaFields = [...criteria, ...additionalColumns].map(col => col.name);
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