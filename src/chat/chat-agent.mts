import { StateGraph, Command, START, END } from "@langchain/langgraph";
import { config } from "dotenv";
import { ChatAgentState } from "./state.mts";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { initChatModel } from "langchain/chat_models/universal";
import { tableGeneratorGraph } from "../table-generator/table-generator.mts";
import { DEFAULT_CONFIG } from "../table-generator/const.mts";
import { z } from "zod";
import { ToolMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";

config();

/* Tool Definitions */
const createTableTool = tool(
  async (input, config) => {
    const { question } = input;
    const result = await tableGeneratorGraph.invoke(
      { question },
      {
        ...DEFAULT_CONFIG,
        configurable: {
          ...DEFAULT_CONFIG.configurable,
          threadId: config.configurable.threadId,
        },
      },
    );
    return new Command({
      update: {
        table: result["rows"],
        messages: [
          new ToolMessage({
            content: `Successfully generated this table: ${JSON.stringify(result["rows"])}`,
            tool_call_id: config.toolCall.id,
          }),
        ],
      },
    });
  },
  {
    name: "createTable",
    description: "Generate a table from a question",
    schema: z.object({
      question: z.string(),
    }),
  },
);
const toolNode = new ToolNode([createTableTool]);

/* Chat Agent */
async function chatAgent(
  state: typeof ChatAgentState.State,
  config: RunnableConfig,
) {
  const { messages, table } = state;
  const toolsAvailableToModel: any[] = [];
  if (!table) {
    toolsAvailableToModel.push(createTableTool);
  }

  const chatModel = (await initChatModel("claude-3-5-sonnet-latest")).bindTools(
    toolsAvailableToModel,
  );
  const response = await chatModel.invoke(messages);
  return {
    messages: response,
  };
}
async function shouldContinue(state: typeof ChatAgentState.State) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  if (
    "tool_calls" in lastMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls?.length
  ) {
    return "Tool Node";
  }
  return END;
}

const reactChatAgent = new StateGraph(ChatAgentState)
  .addNode("Chat Agent", chatAgent)
  .addNode("Tool Node", toolNode)
  .addEdge(START, "Chat Agent")
  .addEdge("Tool Node", "Chat Agent")
  .addConditionalEdges("Chat Agent", shouldContinue, ["Tool Node", END]);

export const chatAgentGraph = reactChatAgent.compile();
