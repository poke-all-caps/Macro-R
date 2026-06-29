import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const deletedAccountsTable = pgTable("deleted_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  licenseKeyId: uuid("license_key_id").notNull(),
  licenseKey: text("license_key").notNull(),
  accountEmail: text("account_email").notNull(),
  accountName: text("account_name"),
  cookies: text("cookies"),
  deviceId: text("device_id"),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
  originalCreatedAt: timestamp("original_created_at"),
});
