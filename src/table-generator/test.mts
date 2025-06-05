import { tableGeneratorGraph } from "./table-generator.mts";
import { config } from "dotenv";
import { DEFAULT_CONFIG } from "./const.mts";

config();

// TODO: Define a config object to pass in to the graph. I'm just going to use a default config.
const result = await tableGeneratorGraph.invoke(
  {
    question: "Give me 20 restaurants in Canton, Michigan and their best dish",
  },
  DEFAULT_CONFIG,
);
console.log("Final State: ", result);
