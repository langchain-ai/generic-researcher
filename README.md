# Deep Research to Generate Tables

This is a Deep Research agent that aims to generate helpful tables of information, as opposed to the classic Report generation.

To visualize the graph in Studio, run the following command.
`npx @langchain/langgraph-cli@latest dev`

[**Github Repo**](https://github.com/langchain-ai/generic-researcher/)

[**Sample Questions**](https://smith.langchain.com/o/ebbaf2eb-769b-4505-aca2-d11de10372a4/datasets/64958c62-8bd5-4559-b649-414af72d280a?tab=2)

---

## Methodology

### One-Shot Base Row Generation

![Image](/imgs/iter1.png)

**Limitations**

- Not generating enough rows in 1-shot, only generated ~20 rows even when I asked for 100

### Iterative Base Row Generation

![Image](/imgs/iter2.png)

**Improvements**

- We can now generate hundreds of rows easily

**Limitations**

- Generated rows do not necessarily answer the prompt. Ex. What are the 10 best restaurants in NYC. We return information about at least 10 restaurants, but we don't really *think* about which ones are the best, or cheapest, etc. We also might not answer with exactly 10 restaurants

### Increase Search Space and add Post Processing

![Image](/imgs/iter3.png)

**Improvements**

- The quality of the final returned table is better, the LLM reasons about how to best answer a user's question

**Limitations**

- The LLMs filtering and tool calling isn't perfect - need to iterate on the prompt and set of tools in Post Processing
- The schema might be wrong, need to add a HITL there to make sure it is correct before proceeding

### Add HITL in the Schema building process

![Image](/imgs/iter4.png)

**Improvements**

- The human now can give natural language feedback on the schema before the approving the LLM to continue with the table generation

**Limitations**

- In the future, we might want to create a UI experience where a user can directly edit the schema (out of scope)

---

## Ideas

- Do more thinking and reasoning up front in the schema generation and
    - Iterate with user to pull out a primary key, criteria columns used to directly answer the question (if any), and additionally interesting columns to the user.
- More search tools
    - Right now I only added Tavily
    - Going to integrate with MCP and Arcade to allow other search tools (google search, GitHub search, etc.)

---

## Features

- All web search is through Tavily
- All results returned from web search are first summarized with a cheap LLM before being provided as context for row generation
- We generate a zod schema during the "Extract Schema" step, and this is used as a structured output guide for the row generators in the "Base Row Generator" and "Row Researcher"
- Flexibility given to the user to configure how many iterations to search, max concurrency, which models to use, etc.
- Our Deep Research table generator can be exposed as a Tool beneath a higher level Chat interface
    - We can add other tools to this higher level interface, like a true deep research report generation one specific row!

---

## Next Steps

- [ ]  Improve response quality
    - [ ]  After n iterations of search without new base rows, you can stop searching
    - [ ]  Do a better "cardinality" analysis up front to determine the search method


