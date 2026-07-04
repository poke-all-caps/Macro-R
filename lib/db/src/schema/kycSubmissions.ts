import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const kycSubmissionsTable = pgTable("kyc_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  inviteCode: text("invite_code").notNull().unique(),
  email: text("email").notNull().default(""),
  fullName: text("full_name").notNull(),
  fatherName: text("father_name").notNull(),
  motherName: text("mother_name").notNull(),
  grandfatherName: text("grandfather_name").notNull(),
  idFront: text("id_front").notNull(),
  idBack: text("id_back").notNull(),
  kycStatus: text("kyc_status").notNull().default("pending"), // pending | verified | rejected
  adminNote: text("admin_note"),
  licenseKeyId: uuid("license_key_id"),
  reviewEmailSentAt: timestamp("review_email_sent_at"),
  approvalEmailSentAt: timestamp("approval_email_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KycSubmission = typeof kycSubmissionsTable.$inferSelect;
