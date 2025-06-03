import { initChatModel } from "langchain/chat_models/universal";

export const llm = await initChatModel("claude-3-5-sonnet-latest");
// export const llm = await initChatModel("gpt-4o");
export const summarizerLlm = await initChatModel("claude-3-5-haiku-latest");


export const MAX_SEARCH_ITERATIONS_PER_ROW = 2;

export const RETRY_CONFIG = {
    stopAfterAttempt: 3,
}