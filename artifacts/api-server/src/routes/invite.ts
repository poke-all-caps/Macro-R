import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { inviteCodesTable, kycSubmissionsTable, licenseKeysTable, featureConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { requireAdmin } from "../adminSession";
import { sendKycUnderReviewEmail, sendKycApprovedEmail, sendKycRejectedEmail } from "../email";

const router: IRouter = Router();

const TRIAL_KEY_TYPE = "trial";
const TRIAL_DURATION_DAYS = 7;

function generateLicenseKey(): string {
  const segments: string[] = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString("hex").toUpperCase());
  }
  return segments.join("-");
}

// ── Public: validate an invite code ──────────────────────────────────────────
// Returns: { valid, status, kycStatus? }
// inviteCode.status: "unused" | "pending" | "resolved"
// kycStatus:        "pending" | "verified" | "rejected"  (only when a submission exists)
router.post("/invite/validate", async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required" });
    }
    const normalised = code.trim().toUpperCase();
    const [found] = await db
      .select({ status: inviteCodesTable.status })
      .from(inviteCodesTable)
      .where(eq(inviteCodesTable.code, normalised));

    if (!found) {
      return res.json({ valid: false, error: "Invalid invite code" });
    }

    // Also fetch KYC submission status if one exists
    const [sub] = await db
      .select({ kycStatus: kycSubmissionsTable.kycStatus, adminNote: kycSubmissionsTable.adminNote })
      .from(kycSubmissionsTable)
      .where(eq(kycSubmissionsTable.inviteCode, normalised));

    return res.json({
      valid: true,
      status: found.status,
      kycStatus: sub?.kycStatus ?? null,
      adminNote: sub?.adminNote ?? null,
    });
  } catch (e: any) {
    console.error("POST /invite/validate error:", e);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ── Public: submit KYC form ───────────────────────────────────────────────────
router.post("/invite/kyc-submit", async (req: Request, res: Response) => {
  try {
    const { code, email, fullName, fatherName, motherName, grandfatherName, idFront, idBack } = req.body;

    if (!code || !email || !fullName || !fatherName || !motherName || !grandfatherName || !idFront || !idBack) {
      return res.status(400).json({ error: "All fields, an email address, and both ID images are required" });
    }

    const normalisedEmail = String(email).trim().toLowerCase();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(normalisedEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    const normalised = String(code).trim().toUpperCase();
    const [invite] = await db
      .select()
      .from(inviteCodesTable)
      .where(eq(inviteCodesTable.code, normalised));

    if (!invite) {
      return res.status(400).json({ error: "Invalid invite code" });
    }
    if (invite.status !== "unused") {
      return res.status(400).json({ error: "This invite code has already been used", status: invite.status });
    }

    // Enforce a size cap on the base64 images (~5 MB each after encoding)
    const MAX_B64 = 7 * 1024 * 1024;
    if (idFront.length > MAX_B64 || idBack.length > MAX_B64) {
      return res.status(400).json({ error: "ID images are too large. Please use a smaller image." });
    }

    await db.insert(kycSubmissionsTable).values({
      inviteCode: normalised,
      email: normalisedEmail,
      fullName: String(fullName).trim(),
      fatherName: String(fatherName).trim(),
      motherName: String(motherName).trim(),
      grandfatherName: String(grandfatherName).trim(),
      idFront: String(idFront),
      idBack: String(idBack),
    });

    await db
      .update(inviteCodesTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(inviteCodesTable.code, normalised));

    // Fire the "KYC Under Review" email. Failure here should never block the
    // submission itself — the user already has a valid pending application.
    sendKycUnderReviewEmail(normalisedEmail, String(fullName).trim())
      .then(() =>
        db
          .update(kycSubmissionsTable)
          .set({ reviewEmailSentAt: new Date() })
          .where(eq(kycSubmissionsTable.inviteCode, normalised)),
      )
      .catch((e) => console.error("sendKycUnderReviewEmail failed:", e));

    return res.json({ success: true });
  } catch (e: any) {
    console.error("POST /invite/kyc-submit error:", e);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ── Admin: list invite codes ──────────────────────────────────────────────────
router.get("/admin/invite-codes", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const codes = await db
      .select()
      .from(inviteCodesTable)
      .orderBy(inviteCodesTable.createdAt);
    return res.json({ codes });
  } catch (e: any) {
    console.error("GET /admin/invite-codes error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: create invite code ─────────────────────────────────────────────────
router.post("/admin/invite-codes", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rawCode: string | undefined = req.body.code;
    const code = rawCode
      ? rawCode.trim().toUpperCase()
      : generateInviteCode();

    const [created] = await db
      .insert(inviteCodesTable)
      .values({ code })
      .returning();
    return res.json({ code: created });
  } catch (e: any) {
    if (e?.message?.includes("unique")) {
      return res.status(409).json({ error: "That code already exists" });
    }
    console.error("POST /admin/invite-codes error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: delete invite code ─────────────────────────────────────────────────
router.delete("/admin/invite-codes/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const [deleted] = await db
      .delete(inviteCodesTable)
      .where(eq(inviteCodesTable.id, String(req.params.id)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /admin/invite-codes error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: list KYC submissions ───────────────────────────────────────────────
router.get("/admin/kyc", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const submissions = await db
      .select({
        id: kycSubmissionsTable.id,
        inviteCode: kycSubmissionsTable.inviteCode,
        email: kycSubmissionsTable.email,
        fullName: kycSubmissionsTable.fullName,
        fatherName: kycSubmissionsTable.fatherName,
        motherName: kycSubmissionsTable.motherName,
        grandfatherName: kycSubmissionsTable.grandfatherName,
        kycStatus: kycSubmissionsTable.kycStatus,
        adminNote: kycSubmissionsTable.adminNote,
        licenseKeyId: kycSubmissionsTable.licenseKeyId,
        createdAt: kycSubmissionsTable.createdAt,
        updatedAt: kycSubmissionsTable.updatedAt,
      })
      .from(kycSubmissionsTable)
      .orderBy(kycSubmissionsTable.createdAt);

    // Attach the generated license key string (if any) so the admin panel can
    // show it without a second round trip.
    const keyIds = submissions.map((s) => s.licenseKeyId).filter((id): id is string => !!id);
    const keyMap = new Map<string, string>();
    if (keyIds.length > 0) {
      const keys = await db.select({ id: licenseKeysTable.id, key: licenseKeysTable.key }).from(licenseKeysTable);
      for (const k of keys) keyMap.set(k.id, k.key);
    }
    const withKeys = submissions.map((s) => ({
      ...s,
      licenseKey: s.licenseKeyId ? keyMap.get(s.licenseKeyId) ?? null : null,
    }));

    return res.json({ submissions: withKeys });
  } catch (e: any) {
    console.error("GET /admin/kyc error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: get single KYC submission with images ──────────────────────────────
router.get("/admin/kyc/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const [sub] = await db
      .select()
      .from(kycSubmissionsTable)
      .where(eq(kycSubmissionsTable.id, String(req.params.id)));
    if (!sub) return res.status(404).json({ error: "Not found" });
    return res.json({ submission: sub });
  } catch (e: any) {
    console.error("GET /admin/kyc/:id error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: update KYC status ──────────────────────────────────────────────────
router.put("/admin/kyc/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { kycStatus, adminNote } = req.body;
    const validStatuses = ["pending", "verified", "rejected"];
    if (!validStatuses.includes(kycStatus)) {
      return res.status(400).json({ error: "Invalid kycStatus" });
    }

    const [before] = await db
      .select()
      .from(kycSubmissionsTable)
      .where(eq(kycSubmissionsTable.id, String(req.params.id)));
    if (!before) return res.status(404).json({ error: "Submission not found" });

    const [updated] = await db
      .update(kycSubmissionsTable)
      .set({ kycStatus, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(eq(kycSubmissionsTable.id, String(req.params.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Submission not found" });

    // Sync invite code status: verified/rejected → resolved; back to pending → pending
    const newInviteStatus = kycStatus === "pending" ? "pending" : "resolved";
    await db
      .update(inviteCodesTable)
      .set({ status: newInviteStatus, updatedAt: new Date() })
      .where(eq(inviteCodesTable.code, updated.inviteCode));

    console.log(`[KYC] ${updated.inviteCode} → ${kycStatus} at ${new Date().toISOString()}`);

    let finalSubmission = updated;

    // ── Approval trigger: turn a Pending user into an Active one ─────────────
    // Only runs the first time a submission transitions into "verified" —
    // re-approving (e.g. verified → verified) never regenerates the key.
    if (kycStatus === "verified" && before.kycStatus !== "verified" && !updated.licenseKeyId) {
      const [trialConfig] = await db
        .select()
        .from(featureConfigTable)
        .where(eq(featureConfigTable.keyType, TRIAL_KEY_TYPE));
      const maxAccounts = trialConfig?.maxAccounts ?? 3;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + TRIAL_DURATION_DAYS);

      const [createdKey] = await db
        .insert(licenseKeysTable)
        .values({
          key: generateLicenseKey(),
          label: `KYC: ${updated.fullName}`,
          keyType: TRIAL_KEY_TYPE,
          maxAccounts,
          expiresAt,
        })
        .returning();

      const [withKey] = await db
        .update(kycSubmissionsTable)
        .set({ licenseKeyId: createdKey.id, updatedAt: new Date() })
        .where(eq(kycSubmissionsTable.id, updated.id))
        .returning();
      finalSubmission = withKey;

      console.log(
        `[KYC APPROVAL] ${updated.inviteCode} approved → license key ${createdKey.key} ` +
          `(tier=${TRIAL_KEY_TYPE}, slots=${maxAccounts}, expires=${expiresAt.toISOString()})`,
      );

      sendKycApprovedEmail({
        to: updated.email,
        fullName: updated.fullName,
        licenseKey: createdKey.key,
        keyType: TRIAL_KEY_TYPE,
        maxAccounts,
        expiresAt,
      })
        .then(() =>
          db
            .update(kycSubmissionsTable)
            .set({ approvalEmailSentAt: new Date() })
            .where(eq(kycSubmissionsTable.id, updated.id)),
        )
        .catch((e) => console.error("sendKycApprovedEmail failed:", e));
    }

    if (kycStatus === "rejected" && before.kycStatus !== "rejected") {
      sendKycRejectedEmail({
        to: updated.email,
        fullName: updated.fullName,
        adminNote: updated.adminNote,
      }).catch((e) => console.error("sendKycRejectedEmail failed:", e));
    }

    return res.json({ submission: finalSubmission });
  } catch (e: any) {
    console.error("PUT /admin/kyc/:id error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Middleware: requireVerifiedKYC ────────────────────────────────────────────
// Apply to any route that requires a fully verified user.
// Expects the invite code in the X-Invite-Code request header.
export async function requireVerifiedKYC(req: Request, res: Response, next: NextFunction) {
  const code = (req.headers["x-invite-code"] as string | undefined)?.trim().toUpperCase();
  if (!code) {
    return res.status(403).json({ error: "KYC verification required. Provide X-Invite-Code header." });
  }
  try {
    const [sub] = await db
      .select({ kycStatus: kycSubmissionsTable.kycStatus })
      .from(kycSubmissionsTable)
      .where(eq(kycSubmissionsTable.inviteCode, code));

    if (!sub || sub.kycStatus !== "verified") {
      return res.status(403).json({ error: "KYC not verified" });
    }
    return next();
  } catch (e: any) {
    console.error("requireVerifiedKYC error:", e);
    return res.status(500).json({ error: "Server error during KYC check" });
  }
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default router;
