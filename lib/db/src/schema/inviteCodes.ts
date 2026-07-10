import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const inviteCodesTable = pgTable("invite_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("unused"), // unused | pending | resolved
  // Set when this invite code was auto-generated alongside a Basic license key,
  // so the admin panel can show "which key handed out this code".
  licenseKeyId: uuid("license_key_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InviteCode = typeof inviteCodesTable.$inferSelect;
