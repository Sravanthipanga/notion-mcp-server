import { z } from "zod";

/**
 * Zod schemas for every tool input. These are used BOTH as the MCP
 * inputSchema (raw shapes) and for runtime validation inside handlers.
 */

export const searchNotionShape = {
  query: z.string().min(1, "query must not be empty").max(200),
  limit: z.number().int().positive().optional(),
};

export const getPageShape = {
  pageId: z.string().min(1, "pageId must not be empty").max(200),
};

export const listDatabasesShape = {};

export const queryDatabaseShape = {
  databaseId: z.string().min(1, "databaseId must not be empty").max(200),
  filterText: z.string().max(200).optional(),
  pageSize: z.number().int().positive().optional(),
};

export const searchNotionSchema = z.object(searchNotionShape);
export const getPageSchema = z.object(getPageShape);
export const listDatabasesSchema = z.object(listDatabasesShape);
export const queryDatabaseSchema = z.object(queryDatabaseShape);
