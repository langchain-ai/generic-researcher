import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { Column } from "../table-generator/types.mts";

export const ChatAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  table: Annotation<{
    [key: string]: z.ZodObject<Record<string, z.ZodTypeAny>>;
  }>,
  primaryKey: Annotation<Column>,
  criteria: Annotation<Column[]>,
});

