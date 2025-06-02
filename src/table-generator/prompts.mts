import { Column } from "./types.mts";

export function getExtractTableSchemaPrompt(question: string) {
    return `You are in charge of interpreting a user's question and creating the schema for a table that will be provided to the user to answer their question.
The question from the user is: ${question}

The table schema consists of column names from three categories: primary key, criteria and additional columns. 
For each column name that you specify, you should provide a short description of that column. You should also provide the type of the column, as a string. You can use "string", "number", "boolean", "date" or "array" as the type.

The primary key is the column that uniquely identifies each row in the table. It should be a string, and the most important column in the whole table.
The criteria are the columns that are required to be present in the table, these should be explicit from the users question, or inferred to important to present the ordering of items in the table.
The additional columns are the columns that are not required to be present in the table, but might potentially be useful to the user.

Make sure that in total, there are fewer than 10 total columns in the table`
}

export function getGenerateInitialSearchQueriesPrompt(question: string, primaryKey: Column, criteria: Column[], additionalColumns: Column[]) {
    return `You are in charge of generating a list of search queries that will be used fill the rows in a table.
    The question from the user is: ${question}

    We've decided that the response (which is a table) will have the following columns:
    The Primary Key:
    ${primaryKey.name} - ${primaryKey.description}
    Required Columns:
    ${criteria.map(c => `${c.name} - ${c.description}`).join("\n")}
    Additional Optional Columns:
    ${additionalColumns.map(c => `${c.name} - ${c.description}`).join("\n")}

    You should generate a list of search queries that will be used to fill the rows in the table. You don't need to capture all additional columns right now. 
    Focus on getting a good list of the primary key values.
    Each search query should be a string that will be used to search for a row in the table. The search query should be a single question that will be used to search for a row in the table.`
}

export function getParseSearchResultsPrompt(searchResults: string, primaryKey: Column, criteria: Column[], additionalColumns: Column[]) {
    return `You are in charge of parsing the search results from a search engine.
    The search results are: ${searchResults}

    The schema of the table is:
    ${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
    ${criteria.map(c => `${c.name} (${c.type}) - ${c.description}`).join("\n")}
    ${additionalColumns.map(c => `${c.name} (${c.type}) - ${c.description} (optional)`).join("\n")}

    You should parse the search results and return the base rows.
    The base rows should be a list of objects, where each object is a row in the table.
    Each object should have the same keys as the schema, but it's okay for some of the fields to be missing or null.

    Make sure that the base rows are valid according to the schema.

    And really make sure that there are no duplicate rows in the base rows. There will likely be many duplicates in the seaarch results, but each should only get a single row entry.`
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

export function getParseEntitySearchResultsPrompt(rowString: string, searchResults: string, primaryKey: Column, criteria: Column[], additionalColumns: Column[]) {
    return `You are in charge of extractinga single entity out of the search results.
    The search results are: ${searchResults}

    The existing entity is:
    ${rowString}

    The full schema of the entity is:
    ${primaryKey.name} (${primaryKey.type}) - ${primaryKey.description}
    ${criteria.map(c => `${c.name} (${c.type}) - ${c.description}`).join("\n")}
    ${additionalColumns.map(c => `${c.name} (${c.type}) - ${c.description} (optional)`).join("\n")}

    Try not to overwrite any existing information in the entity unless there is an explicit conflict and you are very confident in the new information.
    Your job is mostly to fill in the missing information, and then return the full object as an update.`
}