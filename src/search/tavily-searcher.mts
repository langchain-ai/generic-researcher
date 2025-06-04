import { BaseSearcher } from "./base-searcher.mts";
import { summarizeSearchResult } from "./summarizer.mts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES } from "../table-generator/const.mts";

export class TavilySearcher extends BaseSearcher {
  private apiKey: string;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("Tavily API key is required");
    }
  }

  async search(
    queries: string[],
    summarizer: BaseChatModel,
    retries: number = DEFAULT_LLM_STRUCTURED_OUTPUT_RETRIES,
  ): Promise<string> {
    const max_results = 5;
    const topic = "general";
    const include_raw_content = true;

    const searchPromises = queries.map(async (query) => {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            query,
            max_results,
            topic,
            include_raw_content,
          }),
        });

        if (!response.ok) {
          throw new Error(`Tavily API error: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.error(`Error searching for query "${query}":`, error);
        return null;
      }
    });

    const searchResults = await Promise.all(searchPromises);
    let formattedOutput = "Search results: \n\n";

    type ResultEntry = { title: string; summary: string };

    const summarizedResults = new Map<string, ResultEntry>(
      await Promise.all(
        searchResults
          .flatMap((response) => response?.results || [])
          .filter(
            (result, index, array) =>
              array.findIndex((r) => r.url === result.url) === index,
          )
          .map(async (result) => {
            const contentToSummarize = result.raw_content || result.content;
            const summary = await summarizeSearchResult(
              contentToSummarize,
              summarizer,
              retries,
            );
            return [
              result.url,
              {
                title: result.title,
                summary,
              },
            ] as [string, ResultEntry];
          }),
      ),
    );

    let index = 1;
    for (const [url, result] of summarizedResults.entries()) {
      formattedOutput += `\n\n--- SOURCE ${index}: ${result.title} ---\n`;
      formattedOutput += `URL: ${url}\n\n`;
      formattedOutput += `${result.summary}\n`;
      formattedOutput += "\n\n" + "-".repeat(80) + "\n";
      index++;
    }

    if (summarizedResults.size > 0) {
      return formattedOutput;
    } else {
      return "No valid search results found. Please try different search queries or use a different search API.";
    }
  }
}
