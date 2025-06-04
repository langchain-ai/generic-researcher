import { z } from "zod";

export const MinRequiredRowsSchema = z.object({
  minRequiredRows: z.number(),
});

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

export type ValidSchemaType = "string" | "number" | "boolean" | "array";
const TYPE_MAPPING: Record<ValidSchemaType, z.ZodTypeAny> = {
  string: z.string(),
  number: z.number(),
  boolean: z.boolean(),
  array: z.array(z.any()),
} as const;

export function buildDynamicTableSchema(
  primaryKey: Column,
  criteria: Column[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schemaFields: Record<string, z.ZodTypeAny> = {};
  schemaFields[primaryKey.name] = getZodType(primaryKey.type);
  for (const column of criteria) {
    schemaFields[column.name] = getZodType(column.type).nullable().optional();
  }
  return z.object(schemaFields);
}

function getZodType(type: string): z.ZodTypeAny {
  const normalizedType = type.toLowerCase() as ValidSchemaType;
  return TYPE_MAPPING[normalizedType] ?? z.any();
}

export const SearchQuerySchema = z.object({
  searchQuery: z.string(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchQueriesSchema = z.object({
  queries: z.array(SearchQuerySchema),
});
export type SearchQueries = z.infer<typeof SearchQueriesSchema>;

export function zodTypeToString(type: z.ZodTypeAny): string {
  if (type instanceof z.ZodString) return "string";
  if (type instanceof z.ZodNumber) return "number";
  if (type instanceof z.ZodBoolean) return "boolean";
  if (type instanceof z.ZodArray) return "array";
  if (type instanceof z.ZodNullable)
    return `${zodTypeToString(type.unwrap())} (nullable)`;
  if (type instanceof z.ZodOptional)
    return `${zodTypeToString(type.unwrap())} (optional)`;
  return "unknown";
}

export function zodSchemaToString(
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>,
): string {
  const fields = schema.shape;
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${zodTypeToString(value)}`)
    .join("\n");
}
