import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// A user-submitted request to upgrade their license key to a paid tier.
// requestedTier: "basic" | "premium" | "unlimited"
// status: "pending" | "approved" | "rejected"
export const upgradeRequestsTable = pgTable("upgrade_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  licenseKeyId: uuid("license_key_id").notNull(),
  requestedTier: text("requested_tier").notNull(),
  transactionId: text("transaction_id"),
  receiptLink: text("receipt_link"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UpgradeRequest = typeof upgradeRequestsTable.$inferSelect;
