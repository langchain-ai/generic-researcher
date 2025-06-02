import { Annotation } from "@langchain/langgraph";
import { Column } from "./types.mts";
import { z } from "zod";

export const TableGeneratorState = Annotation.Root({
    question: Annotation<string>,
    primaryKey: Annotation<Column>,
    criteria: Annotation<Column[]>,
    additionalColumns: Annotation<Column[]>,
    rowSearchQueries: Annotation<string[]>,
    rows: Annotation<{ [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>> }>({
        reducer: (state, update) => {
            return {
                ...state,
                ...update
            }
        }
    }),
})

export const RowResearcherState = Annotation.Root({
    row: Annotation<z.ZodObject<Record<string, z.ZodTypeAny>>>,
    primaryKey: Annotation<Column>,
    criteria: Annotation<Column[]>,
    additionalColumns: Annotation<Column[]>,
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