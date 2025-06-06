import { chatAgentGraph } from "./chat-agent.mts";
import { config } from "dotenv";
import { HumanMessage } from "@langchain/core/messages";

config();

const result = await chatAgentGraph.invoke(
  {
    messages: [
        new HumanMessage("What are the 5 best sushi restaurants in Chelsea, Manhattan that offer omakase, ranked in order of how cheap they are"),
    ],
  }
);
console.log("Final State: ", result);
