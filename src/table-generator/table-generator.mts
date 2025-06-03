import { config } from "dotenv";
import { TableGeneratorState, RowResearcherState, RowResearcherOutputState, BaseRowGeneratorState, BaseRowGeneratorOutputState } from "./state.mts";
import { extractTableSchema, generateBaseRowSearchQueries, searchForBaseRows, generateQueriesForEntity, updateEntityColumns, gatherRowUpdates, kickOffRowResearch, checkBaseRowSearchExitConditions } from "./nodes.mts";
import { START, END, StateGraph, MemorySaver } from "@langchain/langgraph";

config();

const baseRowGenerator = new StateGraph({
    stateSchema: BaseRowGeneratorState,
    output: BaseRowGeneratorOutputState
})
    .addNode("Generate Base Row Search Queries", generateBaseRowSearchQueries)
    .addNode("Search for Base Rows", searchForBaseRows)
    .addEdge(START, "Generate Base Row Search Queries")
    .addEdge("Generate Base Row Search Queries", "Search for Base Rows")
    .addConditionalEdges("Search for Base Rows", checkBaseRowSearchExitConditions)
const baseRowGeneratorGraph = baseRowGenerator.compile();

const rowResearcher = new StateGraph({
    stateSchema: RowResearcherState,
    output: RowResearcherOutputState
})
    .addNode("Generate Queries for Entity", generateQueriesForEntity)
    .addNode("Update Entity Columns", updateEntityColumns, {ends: ["Generate Queries for Entity", END]})
    .addEdge(START, "Generate Queries for Entity")
    .addEdge("Generate Queries for Entity", "Update Entity Columns")
const rowResearcherGraph = rowResearcher.compile();

const tableGenerator = new StateGraph(TableGeneratorState)
    .addNode("Extract Table Schema", extractTableSchema)
    .addNode("Base Row Generator", baseRowGeneratorGraph)
    .addNode("Row Researcher", rowResearcherGraph)
    .addNode("Gather Row Updates", gatherRowUpdates)
    .addEdge(START, "Extract Table Schema")
    .addEdge("Extract Table Schema", "Base Row Generator")
    .addConditionalEdges("Base Row Generator", kickOffRowResearch, {true: "Row Researcher"})
    .addEdge("Row Researcher", "Gather Row Updates")
    .addEdge("Gather Row Updates", END);

// const checkpointer = new MemorySaver();
export const tableGeneratorGraph = tableGenerator.compile();

// const question1 = "Who are the top tennis players in the world?";
// const result = await tableGeneratorGraph.invoke({ question: question1 });
// console.log(result);