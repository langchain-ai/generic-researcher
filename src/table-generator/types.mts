import { z } from "zod";

export const MinRequiredRowsSchema = z.object({
    minRequiredRows: z.number()
});
export type MinRequiredRows = z.infer<typeof MinRequiredRowsSchema>;

export const ColumnSchema = z.object({
    name: z.string(),
    description: z.string(),
    type: z.string(),
});
export type Column = z.infer<typeof ColumnSchema>;

export const TableExtractionSchema = z.object({
    primaryKey: ColumnSchema,
    criteria: z.array(ColumnSchema),
});

export type TableExtraction = z.infer<typeof TableExtractionSchema>;

export function buildDynamicTableSchema(
    primaryKey: Column,
    criteria: Column[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const schemaFields: Record<string, z.ZodTypeAny> = {};
    schemaFields[primaryKey.name] = getZodType(primaryKey.type);
    for (const column of criteria) {
        schemaFields[column.name] = getZodType(column.type).optional();
    }
    return z.object(schemaFields);
}

function getZodType(type: string): z.ZodTypeAny {
    switch (type.toLowerCase()) {
        case 'string':
            return z.string();
        case 'number':
            return z.number();
        case 'boolean':
            return z.boolean();
        case 'date':
            return z.date();
        case 'array':
            return z.array(z.any());
        default:
            return z.any();
    }
}

export const SearchQuerySchema = z.object({
    searchQuery: z.string(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
  
export const SearchQueriesSchema = z.object({
    queries: z.array(SearchQuerySchema),
});
  
export type SearchQueries = z.infer<typeof SearchQueriesSchema>;

export function zodSchemaToString(schema: z.ZodObject<Record<string, z.ZodTypeAny>>): string {
    const fields = schema.shape;
    const entries = Object.entries(fields);
    
    return entries.map(([key, value]) => {
        let type = 'unknown';
        if (value instanceof z.ZodString) type = 'string';
        if (value instanceof z.ZodNumber) type = 'number';
        if (value instanceof z.ZodBoolean) type = 'boolean';
        if (value instanceof z.ZodDate) type = 'date';
        if (value instanceof z.ZodArray) type = 'array';
        if (value instanceof z.ZodOptional) {
            const innerType = value._def.innerType;
            type = `${zodTypeToString(innerType)} (optional)`;
        }
        
        return `${key}: ${type}`;
    }).join('\n');
}

function zodTypeToString(type: z.ZodTypeAny): string {
    if (type instanceof z.ZodString) return 'string';
    if (type instanceof z.ZodNumber) return 'number';
    if (type instanceof z.ZodBoolean) return 'boolean';
    if (type instanceof z.ZodDate) return 'date';
    if (type instanceof z.ZodArray) return 'array';
    return 'unknown';
}