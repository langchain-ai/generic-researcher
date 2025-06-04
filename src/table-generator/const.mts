export const DEFAULT_SEARCH_API = "tavily";
export const DEFAULT_SUMMARIZER_MODEL = "gpt-4.1-nano";
export const DEFAULT_WRITER_MODEL = "claude-3-5-sonnet-latest";
export const DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES = 5;
export const DEFAULT_MAX_BASE_ROW_SEARCH_ITERATIONS = 100;
export const DEFAULT_MAX_SEARCH_ITERATIONS_PER_ROW = 2;
export const DEFAULT_MAX_ENTITY_SEARCH_ITERATIONS = 100;
export const DEFAULT_MAX_CONCURRENCY = 20;
export const DEFAULT_RECURSION_LIMIT = 1000;

export const DEFAULT_CONFIG = {
    configurable: {
        llmStructuredOutputRetries: DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
        writerModel: DEFAULT_WRITER_MODEL,
        summarizerModel: DEFAULT_SUMMARIZER_MODEL,
        searchApi: DEFAULT_SEARCH_API,
        maxBaseRowSearchIterations: DEFAULT_MAX_BASE_ROW_SEARCH_ITERATIONS,
        maxSearchIterationsPerRow: DEFAULT_MAX_SEARCH_ITERATIONS_PER_ROW,
        maxEntitySearchIterations: DEFAULT_MAX_ENTITY_SEARCH_ITERATIONS,
    },
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    recursionLimit: DEFAULT_RECURSION_LIMIT,
}