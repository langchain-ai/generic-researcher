import { llm, summarizerLlm } from "../src/table-generator/const.mts";
import {testInput} from "./test_const.mts";
import { buildDynamicTableSchema } from "../src/table-generator/types.mts";
import { config } from "dotenv";
import { z } from "zod";

config();

const state = {
    "row": {
      "player_id": "z355",
      "ranking": 3,
      "player_name": "Alexander Zverev",
      "ranking_points": 7285,
      "age": 28
    },
    "primaryKey": {
      "name": "player_id",
      "description": "Unique identifier for each tennis player",
      "type": "string"
    },
    "criteria": [
      {
        "name": "ranking",
        "description": "Current world ranking position",
        "type": "number"
      },
      {
        "name": "player_name",
        "description": "Full name of the tennis player",
        "type": "string"
      },
      {
        "name": "ranking_points",
        "description": "Total ranking points accumulated",
        "type": "number"
      }
    ],
    "additionalColumns": [
      {
        "name": "country",
        "description": "Country the player represents",
        "type": "string"
      },
      {
        "name": "age",
        "description": "Player's age",
        "type": "number"
      },
      {
        "name": "grand_slams_won",
        "description": "Number of grand slam titles won",
        "type": "number"
      },
      {
        "name": "playing_hand",
        "description": "Player's dominant playing hand",
        "type": "string"
      }
    ],
    "entitySearchQueries": [
      "Alexander Zverev tennis player nationality country represents",
      "Alexander Zverev tennis player how many grand slam titles championships won career",
      "Alexander Zverev tennis player playing hand right or left handed"
    ],
    "attempts": 0
  }

const dynamicSchema = buildDynamicTableSchema(state.primaryKey, state.criteria, state.additionalColumns)
const structuredLlm = summarizerLlm.withStructuredOutput(z.object({
    result: dynamicSchema
}))

const structuredResponse = await structuredLlm.invoke(testInput)
console.log(structuredResponse)

// const row ={
//     "player_id": "z355",
//     "ranking": 3,
//     "player_name": "Alexander Zverev",
//     "ranking_points": 7285,
//     "age": 28,
//     "country": "Germany",
//     "grand_slams_won": 0,
//     "playing_hand": "Right-handed (two-handed backhand)"
//   }


// const schemaFields = [...state.criteria, ...state.additionalColumns].map(col => col.name);
// console.log(schemaFields)
// const missingKeys = schemaFields.filter(key => !(key in row))
// console.log(missingKeys)