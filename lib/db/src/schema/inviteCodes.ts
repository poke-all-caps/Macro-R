import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const inviteCodesTable = pgTable("invite_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("unused"), // unused | pending | resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InviteCode = typeof inviteCodesTable.$inferSelect;
