import { z } from "zod";

export const SummarizedSearchResultSchema = z.object({
  summarized_content: z.string(),
  key_excerpts: z.array(z.string()),
});
export type SummarizedSearchResult = z.infer<
  typeof SummarizedSearchResultSchema
>;
