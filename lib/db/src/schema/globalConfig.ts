import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Pre-existing key/value settings table. Kept in the schema so `drizzle-kit
// push` doesn't propose dropping it — it predates the tracked schema files.
export const globalConfigTable = pgTable("global_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const insertGlobalConfigSchema = createInsertSchema(globalConfigTable);
export type InsertGlobalConfig = z.infer<typeof insertGlobalConfigSchema>;
export type GlobalConfig = typeof globalConfigTable.$inferSelect;
