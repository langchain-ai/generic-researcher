import { Column } from "./types.mts";

export function getExtractTableSchemaPrompt(question: string) {
    return `You are in charge of interpreting a user's question and creating the schema for a table that will be provided to the user to answer their question.
The question from the user is: ${question}

The table schema consists of column names from three categories: primary key, criteria and additional columns. 
For each column name that you specify, you should provide a short description of that column. You should also provide the type of the column, as a string. You can use "string", "number", "boolean", "date" or "array" as the type.

The primary key is the column that uniquely identifies each row in the table. It should be a string, and the most important column in the whole table.
The criteria are the columns that are required to be present in the table, these should be explicit from the users question, or inferred to important to present the ordering of items in the table.
The additional columns are the columns that are not required to be present in the table, but might potentially be useful to the user.

Make sure that in total, there are fewer than 7 total columns in the table`
}

export function getMinRequiredRowsPrompt(question: string) {
    return `You are in charge of determining the minimum number of rows that are required to answer the question.
    The question from the user is: ${question}

    If the user specifically asks for a number of rows, you should return that number.
    If the user does not specifically ask for a number of rows, use your best judgement to determine that number. Generally err on returning more rows than necessary, to make sure that the user has all of the information that they need.`
}

export function getGenerateInitialSearchQueriesPrompt(question: string, primaryKey: Column, criteria: Column[]) {
    return `You are in charge of generating a list of search queries that will be used fill the rows in a table. These search queries will be passed to a search engine.
    The question from the user is: ${question}

    We've decided that the response (which is a table) will have the following columns:
    The Primary Key:
    ${primaryKey.name} - ${primaryKey.description}
    Required Columns:
    ${criteria.map(c => `${c.name} - ${c.description}`).join("\n")}

    You should generate a list of search queries that will be used to fill the rows in the table. You should not capture all of the columns right now, focus on searching for the primary key column.
    Each of these queries should be broad, and should aim to give you back a LONG list of results. Ask for lists, not about specific records. You are building the list right now, you will search for the list properties later.
    You should focus on getting a good list of unique primary key values. Don't output more than 3 queries. Only write queries if they are meaningfully different from each other. Don't rewrite the same query multiple ways.`
}

export function getGenerateAdditionalSearchQueriesPrompt(question: string, primaryKey: Column, criteria: Column[], rows: Record<string, any>, historicalRowSearchQueries: string[]) {
    return `You are in charge of generating a list of search queries that will be used fill the rows in a table. These queries will be passed to a search engine.
    The question from the user is: ${question}

    We've decided that the response (which is a table) will have the following columns:
    The Primary Key:
    ${primaryKey.name} - ${primaryKey.description}
    Required Columns:
    ${criteria.map(c => `${c.name} - ${c.description}`).join("\n")}

    We have already been searching for these rows, the previous search queries that we have tried are: 
    ${historicalRowSearchQueries.join("\n")}
    Make sure any new queries that you generate are different and will yield different results.

    The current rows in the table from previous searches are:
    ${Object.values(rows).map(r => JSON.stringify(r, null, 2)).join("\n")}
    You want to avoid searching for these same primary key values, try generating queries that will yield different results from what is in this table right now.

    You should generate a list of search queries that will be used to fill the rows in the table. You should not capture all of the columns right now, focus on searching for the primary key column. 
    Each of these queries should be broad, and should aim to give you back a LONG list of results. Ask for lists, not about specific records. You are building the list right now, you will search for the list properties later.
    You should focus on getting a good list of unique primary key values. Don't output more than 3 queries.
    Again, really focus on queries that will give you back a long list of additional results that don't encompass those already in the table.`
}

export function getParseSearchResultsPrompt(question: string, searchResults: string, primaryKey: Column, criteria: Column[]) {
    return `You are in charge of parsing the search results from a search engine.
    The original question was: ${question}
    The search results are: ${searchResults}

    The schema of the table is:
    ${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
    ${criteria.map(c => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

    You should parse the search results and return the base rows.
    The base rows should be a list of objects, where each object is a row in the table.
    Each object should have the same keys as the schema, but right now it's okay for most of the fields to be missing.
    You should try to add as many rows with a unique primary key as possible, don't worry about filling out columns right now.

    Make sure that the base rows are valid according to the schema.
    Really make sure that there are no duplicate rows in the base rows. There will likely be many duplicates in the search results, but each should only get a single row entry.
    Again, extract as many rows as possible! Don't worry about filling out all of the columns, you will do that later. All you need right now is a unique primary key.
    We are trying to get a long list of unique primary key values that we can conduct more thorough searches on later.`
}

export function getParseAdditionalSearchResultsPrompt(question: string, searchResults: string, primaryKey: Column, criteria: Column[], rows: Record<string, any>) {
    return `You are in charge of parsing the search results from a search engine.
    The original question was: ${question}
    The search results are: ${searchResults}

    The schema of the table is:
    ${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
    ${criteria.map(c => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

    The current rows in the table from previous searches are:
    ${Object.values(rows).map(r => JSON.stringify(r, null, 2)).join("\n")}

    You should parse the search results and ONLY return the base rows that are not already in the table.
    The base rows should be a list of objects, where each object is a row in the table.
    Each object should have the same keys as the schema, but right now it's okay for some of the fields to be missing.

    Make sure that the base rows are valid according to the schema.
    Really make sure that there are no duplicate rows in the base rows. There will likely be many duplicates in the search results, but each should only get a single row entry.
    Once again, make sure that you do not return any rows that are already in the table.
    `
}

export function getGenerateEntitySearchQueriesPrompt(rowString: string, missingColumns: Column[]) {
    return `You are in charge of generating search queries to find missing information for a row in our table.
    
    The current row has the following information:
    ${rowString}
    
    We are missing the following fields that we need to find:
    ${missingColumns.map(c => `${c.name} (${c.type}) - ${c.description}`).join('\n')}
    
    Generate search queries that will help us find the missing information for this row.
    Each search query should be specific and targeted to find one or more of the missing fields.
    Make sure to include enough context from the existing row data to get accurate results.`
}

export function getParseEntitySearchResultsPrompt(rowString: string, searchResults: string, primaryKey: Column, criteria: Column[]) {
    return `You are in charge of extractinga single entity out of the search results.
    The search results are: ${searchResults}

    The existing entity is:
    ${rowString}

    The full schema of the entity is:
    ${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
    ${criteria.map(c => `${c.name} (${c.type}) - ${c.description}`).join("\n")}

    Try not to overwrite any existing information in the entity unless there is an explicit conflict and you are very confident in the new information.
    Your job is mostly to fill in the missing information, and then return the full object as an update.
    
    It's okay if you don't know what all the fields are, the criteria fields are all optional, if you don't know the answer, just don't return the field. DO NOT return the field with a "filler" value in it. Just don't return the field if you don't know the value!`
}