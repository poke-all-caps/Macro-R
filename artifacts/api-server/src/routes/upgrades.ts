import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { licenseKeysTable, upgradeRequestsTable, featureConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../adminSession";

const router: IRouter = Router();

const VALID_TIERS = ["basic", "premium", "unlimited"];
const UPGRADE_DURATION_DAYS = 30;

function sanitizeDbError(e: any): string {
  const msg = e?.message || "Unknown error";
  if (msg.includes("Failed query") || msg.includes("getaddrinfo") || msg.includes("ECONNREFUSED") || msg.includes("EAI_AGAIN")) {
    return "Database temporarily unavailable. Please try again in a moment.";
  }
  return "An unexpected error occurred. Please try again.";
}

// ── Public: user submits an upgrade request against their license key ────────
router.post("/upgrade/request", async (req: Request, res: Response) => {
  try {
    const { key, requestedTier, transactionId, receiptLink } = req.body;
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "key is required" });
    }
    if (!VALID_TIERS.includes(requestedTier)) {
      return res.status(400).json({ error: `requestedTier must be one of: ${VALID_TIERS.join(", ")}` });
    }
    if (!transactionId && !receiptLink) {
      return res.status(400).json({ error: "Provide a Transaction ID or a Receipt Link" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));
    if (!found) {
      return res.status(404).json({ error: "License key not found" });
    }
    if (!found.isActive) {
      return res.status(403).json({ error: "Key has been deactivated" });
    }

    const [created] = await db.insert(upgradeRequestsTable).values({
      licenseKeyId: found.id,
      requestedTier,
      transactionId: transactionId ? String(transactionId).trim() : null,
      receiptLink: receiptLink ? String(receiptLink).trim() : null,
    }).returning();

    console.log(`[UPGRADE REQUEST] Key ${found.key} requested tier=${requestedTier} at ${new Date().toISOString()}`);
    res.json({ success: true, request: created });
  } catch (e: any) {
    console.error("POST /upgrade/request error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

// ── Public: user checks the status of their own upgrade request(s) ───────────
router.get("/upgrade/status", async (req: Request, res: Response) => {
  try {
    const key = (req.query.key as string | undefined)?.trim().toUpperCase();
    if (!key) return res.status(400).json({ error: "key is required" });

    const [found] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.key, key));
    if (!found) return res.status(404).json({ error: "License key not found" });

    const requests = await db.select().from(upgradeRequestsTable)
      .where(eq(upgradeRequestsTable.licenseKeyId, found.id))
      .orderBy(upgradeRequestsTable.createdAt);

    res.json({ requests });
  } catch (e: any) {
    console.error("GET /upgrade/status error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

// ── Admin: list all upgrade requests ──────────────────────────────────────────
router.get("/admin/upgrades", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const requests = await db.select().from(upgradeRequestsTable).orderBy(upgradeRequestsTable.createdAt);

    const keyIds = [...new Set(requests.map((r) => r.licenseKeyId))];
    const keyMap = new Map<string, { key: string; keyType: string; label: string | null }>();
    if (keyIds.length > 0) {
      const keys = await db.select().from(licenseKeysTable);
      for (const k of keys) keyMap.set(k.id, { key: k.key, keyType: k.keyType, label: k.label });
    }

    const withKeys = requests.map((r) => ({
      ...r,
      licenseKey: keyMap.get(r.licenseKeyId)?.key ?? null,
      currentTier: keyMap.get(r.licenseKeyId)?.keyType ?? null,
      keyLabel: keyMap.get(r.licenseKeyId)?.label ?? null,
    }));

    res.json({ requests: withKeys });
  } catch (e: any) {
    console.error("GET /admin/upgrades error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

// ── Admin: approve or reject an upgrade request ───────────────────────────────
router.put("/admin/upgrades/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status, adminNote } = req.body;
    const validStatuses = ["approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const [reqRow] = await db.select().from(upgradeRequestsTable).where(eq(upgradeRequestsTable.id, id));
    if (!reqRow) return res.status(404).json({ error: "Upgrade request not found" });
    if (reqRow.status !== "pending") {
      return res.status(400).json({ error: `Request already ${reqRow.status}` });
    }

    const [updatedRequest] = await db.update(upgradeRequestsTable)
      .set({ status, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(eq(upgradeRequestsTable.id, id))
      .returning();

    let updatedKey = null;
    if (status === "approved") {
      const [key] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, reqRow.licenseKeyId));
      if (!key) return res.status(404).json({ error: "License key for this request no longer exists" });

      const [tierCfg] = await db.select().from(featureConfigTable).where(eq(featureConfigTable.keyType, reqRow.requestedTier));
      const maxAccounts = tierCfg?.maxAccounts ?? key.maxAccounts;

      // Extend from whichever is later: the key's current expiry or now — so an
      // already-active subscription doesn't lose remaining time on upgrade.
      const base = new Date(key.expiresAt) > new Date() ? new Date(key.expiresAt) : new Date();
      const newExpiresAt = new Date(base.getTime() + UPGRADE_DURATION_DAYS * 86400000);

      const [applied] = await db.update(licenseKeysTable)
        .set({
          keyType: reqRow.requestedTier,
          maxAccounts,
          canInvite: true,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(licenseKeysTable.id, key.id))
        .returning();
      updatedKey = applied;

      console.log(`[UPGRADE APPROVED] Key ${key.key} → ${reqRow.requestedTier}, canInvite=true, expires=${newExpiresAt.toISOString()}`);
    } else {
      console.log(`[UPGRADE REJECTED] Request ${id} rejected`);
    }

    res.json({ request: updatedRequest, key: updatedKey });
  } catch (e: any) {
    console.error("PUT /admin/upgrades/:id error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

export default router;
