import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export abstract class BaseSearcher {
  abstract search(
    queries: string[],
    summarizer: BaseChatModel,
    retries?: number,
  ): Promise<string>;
}
