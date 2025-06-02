import { BaseSearcher } from "./base-searcher.mts";

export class TavilySearcher extends BaseSearcher {
    private apiKey: string;
    
    constructor(apiKey?: string) {
      super();
      this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
      if (!this.apiKey) {
        throw new Error('Tavily API key is required');
      }
    }
    
    async search(queries: string[]): Promise<string> {
      const max_results = 5;
      const topic = 'general';
      const include_raw_content = true;
      
      const searchPromises = queries.map(async (query) => {
        try {
          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
              query,
              max_results,
              topic,
              include_raw_content
            })
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
      
      const uniqueResults = new Map();
      for (const response of searchResults) {
        if (!response || !response.results) continue;
        
        for (const result of response.results) {
          if (!uniqueResults.has(result.url)) {
            uniqueResults.set(result.url, result);
          }
        }
      }
      
      let index = 1;
      for (const [url, result] of uniqueResults.entries()) {
        formattedOutput += `\n\n--- SOURCE ${index}: ${result.title} ---\n`;
        formattedOutput += `URL: ${url}\n\n`;
        formattedOutput += `SUMMARY:\n${result.content}\n\n`;
        if (result.raw_content) {
          formattedOutput += `FULL CONTENT:\n${result.raw_content.slice(0, 30000)}`; // Limit content size
        }
        formattedOutput += "\n\n" + "-".repeat(80) + "\n";
        index++;
      }
      
      if (uniqueResults.size > 0) {
        return formattedOutput;
      } else {
        return "No valid search results found. Please try different search queries or use a different search API.";
      }
    }
}