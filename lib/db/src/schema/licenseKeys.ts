import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const licenseKeysTable = pgTable("license_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label"),
  keyType: text("key_type").notNull().default("basic"),
  maxAccounts: integer("max_accounts").notNull().default(3),
  customMaxAccounts: integer("custom_max_accounts"),
  customMinDelaySeconds: integer("custom_min_delay_seconds"),
  pin: text("pin"),
  isActive: boolean("is_active").notNull().default(true),
  boundDeviceId: text("bound_device_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLicenseKeySchema = createInsertSchema(licenseKeysTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLicenseKey = z.infer<typeof insertLicenseKeySchema>;
export type LicenseKey = typeof licenseKeysTable.$inferSelect;
