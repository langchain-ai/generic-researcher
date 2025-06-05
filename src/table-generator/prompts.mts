import { Column } from "./types.mts";

function getTodayString() {
  const today = new Date();
  return `For temporal context, today is ${today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;
}

export function getExtractTableSchemaPrompt(question: string) {
  return `You are in charge of interpreting a user's question and creating the schema for a table that will be provided to the user to answer their question.
The question from the user is: ${question}

The table schema consists of column names from two categories: primary key and criteria.
For each column name that you specify, you should provide a short description of that column. You should also provide the type of the column, as a string. You can use "string", "number", "boolean", or "array" as the type.

The primary key is the column that uniquely identifies each row in the table. It should be a string, and the most important column in the whole table.
The criteria are columns that will be helpful to the user to answer their question, and filter and sort the table. These should be explicit from the users question, or inferred to be important. Use your best reasoning and judgement to come up with these criteria.

You should aim to have fewer than 7 total columns in the table, unless the user explicitly asks for more than 7.
${getTodayString()}`;
}

export function getMinRequiredRowsPrompt(question: string) {
  return `You are in charge of determining the minimum number of rows that you should search for in order to effectively answer the user's question. Along with the actual target number of rows you should return to the user.
The question from the user is: ${question}

This is nuanced. If the user asks for "the best 50 ___", you probably need to search for more than 50 entities to find the best 50. In this case, you should return 50 as the target number of rows, but the minimum number of rows you should search for should be more than 50.
If the user does not specifically ask for a number of rows, use your best judgement to determine these numbers. Generally err on returning more rows than necessary, to make sure that the user has all of the information that they need.
The minimum number of rows you should search for should always be greater than the target number of rows.`;
}

export function getGenerateInitialSearchQueriesPrompt(
  question: string,
  primaryKey: Column,
  criteria: Column[],
  requiredRowsForSearch: number,
) {
  return `You are in charge of generating a list of search queries that will be used fill the rows in a table. These search queries will be passed to a search engine.
The question from the user is: ${question}

We have decided with the user that the final agent output table will have the following columns:
The Primary Key:
${primaryKey.name} - ${primaryKey.description}
Additional Columns:
${criteria.map((c) => `${c.name} - ${c.description}`).join("\n")}

You should generate a list of search queries that will be used to fill the rows in the table. You should not capture all of the columns right now, focus on searching for unique primary key entries.
The target number of rows is ${requiredRowsForSearch}, so make sure the queries you write are broad enough to give you back a sufficiently long list of results.
You are building the total list of primary key values right now, you will search for the list properties later, so don't worry about capturing those. 
Only write queries that are meaningfully different from each other. Don't rewrite the same query multiple ways, each query should search for different things.
${getTodayString()}`;
}

export function getGenerateAdditionalSearchQueriesPrompt(
  question: string,
  primaryKey: Column,
  criteria: Column[],
  rows: Record<string, any>,
  historicalRowSearchQueries: string[],
  requiredRowsForSearch: number,
) {
  return `You are in charge of generating a list of search queries that will be used fill the rows in a table. These queries will be passed to a search engine.
The question from the user is: ${question}

We have decided with the user that the final agent output table will have the following columns:
The Primary Key:
${primaryKey.name} - ${primaryKey.description}
Additional Columns:
${criteria.map((c) => `${c.name} - ${c.description}`).join("\n")}

We have already been searching for these rows, the previous search queries that we have tried are: 
${historicalRowSearchQueries.join("\n")}
Make sure any new queries that you generate are different and will yield different results. Don't rewrite the same query multiple ways, each query should search for different things.

The current rows in the table from those previous search queries are:
${Object.values(rows)
  .map((r) => JSON.stringify(r, null, 2))
  .join("\n")}
You want to avoid searching for these same primary key values, try generating queries that will yield different results from what is in this table right now.

You should generate a list of search queries that will be used to fill the rows in the table. You should not capture all of the columns right now, focus on searching for unique primary key entries.
So far, we have only found ${Object.keys(rows).length} rows, we need to find ${requiredRowsForSearch} rows, so make sure the queries you write are broad enough to give you back a sufficiently long list of results.
You are building the total list of primary key values right now, you will search for the list properties later, so don't worry about capturing those. 
Only write queries that are meaningfully different from each other. Don't rewrite the same query multiple ways, each query should search for different things.
${getTodayString()}`;
}

export function getParseSearchResultsPrompt(
  question: string,
  searchResults: string,
  primaryKey: Column,
  criteria: Column[],
) {
  return `You are in charge of parsing the search results from a search engine into a list of rows.
The original question was: ${question}
The search results are: ${searchResults}

The schema of the table is:
${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
${criteria.map((c) => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

You should parse the search results and return the base rows.
The base rows should be a list of objects, where each object is a row in the table.
Each object will eventually have the same keys as the schema, but right now it's okay for most of the fields to be missing.
You should try to add as many rows with a unique primary key as possible, don't worry about filling out columns right now.

Make sure that the base rows are valid according to the schema.
Really make sure that there are no duplicate rows in the base rows. There will likely be many duplicates in the search results, but each should only get a single row entry.
Again, extract as many rows as possible! Don't worry about filling out all of the columns, you will do that later. All you need right now is a unique primary key.
We are trying to get a long list of unique primary key values that we can conduct more thorough searches on later.
${getTodayString()}`;
}

export function getParseAdditionalSearchResultsPrompt(
  question: string,
  searchResults: string,
  primaryKey: Column,
  criteria: Column[],
  rows: Record<string, any>,
) {
  return `You are in charge of parsing the search results from a search engine into a list of rows.
The original question was: ${question}
The search results are: ${searchResults}

The schema of the table is:
${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
${criteria.map((c) => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

The current rows in the table from previous searches are:
${Object.values(rows)
  .map((r) => JSON.stringify(r, null, 2))
  .join("\n")}

You should parse the search results and ONLY return the base rows that are not already in the table.
The base rows should be a list of objects, where each object is a row in the table.
Each object will eventually have the same keys as the schema, but right now it's okay for most of the fields to be missing.
You should try to add as many rows with a unique primary key as possible, don't worry about filling out columns right now.

Make sure that the base rows are valid according to the schema.
Really make sure that there are no duplicate rows in the base rows. There will likely be many duplicates in the search results, but each should only get a single row entry.
Again, extract as many rows as possible! Don't worry about filling out all of the columns, you will do that later. All you need right now is a unique primary key.
We are trying to get a long list of unique primary key values that we can conduct more thorough searches on later. Again, only return base rows that are NOT already in the table.
${getTodayString()}`;
}

export function getGenerateEntitySearchQueriesPrompt(
  rowString: string,
  missingColumns: Column[],
) {
  return `You are in charge of generating search queries to find missing information for a row in our table.
    
The current row has the following information:
${rowString}

We are missing the following fields that we need to find:
${missingColumns.map((c) => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

Generate search queries that will help us find the missing information for this row.
Each search query should be specific and targeted to find one or more of the missing fields.
Make sure to include enough context from the existing row data to get accurate results.
${getTodayString()}`;
}

export function getParseEntitySearchResultsPrompt(
  rowString: string,
  searchResults: string,
  primaryKey: Column,
  criteria: Column[],
) {
  return `You are in charge of extracting a single entity out of the search results.
${getTodayString()}
The search results are: ${searchResults}

The existing entity is:
${rowString}

The full schema of the entity is:
${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
${criteria.map((c) => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

Don't overwrite any existing information in the entity unless there is an explicit conflict and you are very confident in the new information.
Your job is to fill in the missing information, and then return the full object as an update.
Make sure that the types are correct for the fields that you are returning!
It's okay if you don't know what all the fields are, the criteria fields are all optional, if you don't know the answer, just don't return the field.
DO NOT return the field with a "filler" value in it. Just don't return the field if you don't know the value!`;
}

export function getTablePostProcessingPrompt() {
  return `You are in charge of post-processing a table to answer a user's question. We will provide the question to you later.
We rigorously searched the internet to populate this table, but it may contain extra or irrelevant rows to the user's question. Use your filtering tools to remove unnecessary rows until the table is ready to be shown to the user.
You should use as many tools as you need to help you with the post-processing. When possible, try to return the right number of rows to the user. When you are done processing, stop calling tools.`;
}