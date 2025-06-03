import { Annotation } from "@langchain/langgraph";
import { Column } from "./types.mts";
import { z } from "zod";

export const TableGeneratorState = Annotation.Root({
    question: Annotation<string>,
    primaryKey: Annotation<Column>,
    criteria: Annotation<Column[]>,
    rows: Annotation<{ [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> }>({
        reducer: (state, update) => {
            return {
                ...state,
                ...update
            }
        }
    }),
})

export const BaseRowGeneratorState = Annotation.Root({
    question: Annotation<string>,
    primaryKey: Annotation<Column>,
    criteria: Annotation<Column[]>,
    currentRowSearchQueries: Annotation<string[]>,
    historicalRowSearchQueries: Annotation<string[]>({
        reducer: (state, update) => {
            return [...state, ...update]
        }
    }),
    rows: Annotation<{ [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> }>({
        reducer: (state, update) => {
            return {
                ...state,
                ...update
            }
        }
    }),
    researchAttempts: Annotation<number>,
    minRequiredRows: Annotation<number | undefined>
})

export const BaseRowGeneratorOutputState = Annotation.Root({
    rows: Annotation<{ [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> }>
})

export const RowResearcherState = Annotation.Root({
    row: Annotation<z.ZodObject<Record<string, z.ZodTypeAny>>>,
    primaryKey: Annotation<Column>,
    criteria: Annotation<Column[]>,
    entitySearchQueries: Annotation<string[]>,
    attempts: Annotation<number>,
    rows: Annotation<{ [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> }>({
        reducer: (state, update) => {
            return {
                ...state,
                ...update
            }
        }
    }),
    missingKeys: Annotation<string[]>
})

export const RowResearcherOutputState = Annotation.Root({
    rows: Annotation<{ [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> }>
})