import { chatAgentGraph } from "./chat-agent.mts";
import { config } from "dotenv";
import { HumanMessage } from "@langchain/core/messages";

config();

// const result = await chatAgentGraph.invoke(
//   {
//     messages: [
//         new HumanMessage("I want to know the best 5 restaurants in Chelsea, Manhattan"),
//     ],
//   }
// );
// console.log("Final State: ", result);
