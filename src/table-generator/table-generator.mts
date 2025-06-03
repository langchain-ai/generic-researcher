import { config } from "dotenv";
import { TableGeneratorState, RowResearcherState, RowResearcherOutputState } from "./state.mts";
import { extractTableSchema, generateInitialSearchQueries, searchForBaseRows, generateQueriesForEntity, updateEntityColumns, gatherRowUpdates, kickOffRowResearch } from "./nodes.mts";
import { START, END, StateGraph, MemorySaver } from "@langchain/langgraph";

config();

const rowResearcher = new StateGraph(
    {
        stateSchema: RowResearcherState,
        output: RowResearcherOutputState
    }
)
    .addNode("Generate Queries for Entity", generateQueriesForEntity)
    .addNode("Update Entity Columns", updateEntityColumns, {ends: ["Generate Queries for Entity", END]})
    .addEdge(START, "Generate Queries for Entity")
    .addEdge("Generate Queries for Entity", "Update Entity Columns")
const rowResearcherGraph = rowResearcher.compile();

const tableGenerator = new StateGraph(TableGeneratorState)
    .addNode("Extract Table Schema", extractTableSchema)
    .addNode("Generate Initial Search Queries", generateInitialSearchQueries)
    .addNode("Search for Base Rows", searchForBaseRows, {ends: ["Row Researcher"]})
    .addNode("Row Researcher", rowResearcherGraph)
    .addNode("Gather Row Updates", gatherRowUpdates)
    .addEdge(START, "Extract Table Schema")
    .addEdge("Extract Table Schema", "Generate Initial Search Queries")
    .addEdge("Generate Initial Search Queries", "Search for Base Rows")
    .addConditionalEdges("Search for Base Rows", kickOffRowResearch, {true: "Row Researcher"})
    .addEdge("Row Researcher", "Gather Row Updates")
    .addEdge("Gather Row Updates", END);

// const checkpointer = new MemorySaver();
export const tableGeneratorGraph = tableGenerator.compile();

// const question1 = "Who are the top tennis players in the world?";
// const result = await tableGeneratorGraph.invoke({ question: question1 });
// console.log(result);