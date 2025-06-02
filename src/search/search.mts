import { TavilySearcher } from "./tavily-searcher.mts"

export async function selectAndExecuteSearch(searchApi: string, queryList: string[]) {
    switch (searchApi) {
        // TODO: Add other search engines
        case "tavily":
            return await new TavilySearcher().search(queryList)
        default:
            // Default to Tavily search too
            return await new TavilySearcher().search(queryList)
    }
}