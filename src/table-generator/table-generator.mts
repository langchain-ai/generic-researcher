import { config } from "dotenv";
import {
  TableGeneratorState,
  RowResearcherState,
  RowResearcherOutputState,
  BaseRowGeneratorState,
  BaseRowGeneratorOutputState,
  ConfigurableAnnotation,
} from "./state.mts";
import {
  extractTableSchema,
  generateBaseRowSearchQueries,
  searchForBaseRows,
  generateQueriesForEntity,
  updateEntityColumns,
  postProcessTable,
  kickOffRowResearch,
  checkBaseRowSearchExitConditions,
  getUserFeedback,
  checkSchemaFeedbackExitConditions,
} from "./nodes.mts";
import { START, END, StateGraph, MemorySaver } from "@langchain/langgraph";

config();

const baseRowGenerator = new StateGraph(
  {
    stateSchema: BaseRowGeneratorState,
    output: BaseRowGeneratorOutputState,
  },
  ConfigurableAnnotation,
)
  .addNode("Generate Base Row Search Queries", generateBaseRowSearchQueries)
  .addNode("Search for Base Rows", searchForBaseRows)
  .addEdge(START, "Generate Base Row Search Queries")
  .addEdge("Generate Base Row Search Queries", "Search for Base Rows")
  .addConditionalEdges(
    "Search for Base Rows",
    checkBaseRowSearchExitConditions,
  );
const baseRowGeneratorGraph = baseRowGenerator.compile();

const rowResearcher = new StateGraph(
  {
    stateSchema: RowResearcherState,
    output: RowResearcherOutputState,
  },
  ConfigurableAnnotation,
)
  .addNode("Generate Queries for Entity", generateQueriesForEntity)
  .addNode("Update Entity Columns", updateEntityColumns, {
    ends: ["Generate Queries for Entity", END],
  })
  .addEdge(START, "Generate Queries for Entity")
  .addEdge("Generate Queries for Entity", "Update Entity Columns");
const rowResearcherGraph = rowResearcher.compile();

const tableGenerator = new StateGraph(
  TableGeneratorState,
  ConfigurableAnnotation,
)
  .addNode("Extract Table Schema", extractTableSchema)
  .addNode("Get User Feedback", getUserFeedback)
  .addNode("Base Row Generator", baseRowGeneratorGraph)
  .addNode("Row Researcher", rowResearcherGraph)
  .addNode("Post Process Table", postProcessTable)
  .addEdge(START, "Extract Table Schema")
  .addEdge("Extract Table Schema", "Get User Feedback")
  .addConditionalEdges("Get User Feedback", checkSchemaFeedbackExitConditions, {
    "Base Row Generator": "Base Row Generator",
    "Extract Table Schema": "Extract Table Schema",
  })
  .addConditionalEdges("Base Row Generator", kickOffRowResearch, {
    true: "Row Researcher",
  })
  .addEdge("Row Researcher", "Post Process Table")
  .addEdge("Post Process Table", END);

// const checkpointer = new MemorySaver();
export const tableGeneratorGraph = tableGenerator.compile();

// const question1 = "Who are the top tennis players in the world?";
// const result = await tableGeneratorGraph.invoke({ question: question1 });
// console.log(result);
