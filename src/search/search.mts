import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { TavilySearcher } from "./tavily-searcher.mts";

export async function selectAndExecuteSearch(
  searchApi: string,
  queryList: string[],
  summarizerModel: BaseChatModel,
  retries?: number
) {
  switch (searchApi) {
    // TODO: Add other search engines
    case "tavily":
      return await new TavilySearcher().search(queryList, summarizerModel, retries);
    default:
      return await new TavilySearcher().search(queryList, summarizerModel, retries);
  }
}
