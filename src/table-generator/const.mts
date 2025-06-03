import { initChatModel } from "langchain/chat_models/universal";

export const llm = await initChatModel("claude-3-5-sonnet-latest");
export const summarizerLlmOpenAI = await initChatModel("gpt-4.1-nano");
export const summarizerLlm = await initChatModel("claude-3-5-haiku-latest");


export const MAX_BASE_ROW_SEARCH_ITERATIONS = 100;
export const MAX_SEARCH_ITERATIONS_PER_ROW = 2;

export const RETRY_CONFIG = {
    stopAfterAttempt: 5,
}