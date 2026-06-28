import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { licenseKeysTable, featureConfigTable, deviceCookiesTable } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import crypto from "crypto";
import { requireAdmin } from "../adminSession";

const DEFAULT_CONFIGS = [
  { keyType: "basic", maxAccounts: 2, maxSearches: 20, minDelaySeconds: 5, backgroundEnabled: false, customQueriesEnabled: false, dailySetEnabled: true, pcSearchEnabled: false },
  { keyType: "premium", maxAccounts: 5, maxSearches: 40, minDelaySeconds: 3, backgroundEnabled: true, customQueriesEnabled: true, dailySetEnabled: true, pcSearchEnabled: true },
  { keyType: "unlimited", maxAccounts: 999, maxSearches: 999, minDelaySeconds: 3, backgroundEnabled: true, customQueriesEnabled: true, dailySetEnabled: true, pcSearchEnabled: true },
  { keyType: "admin", maxAccounts: 999, maxSearches: 999, minDelaySeconds: 1, backgroundEnabled: true, customQueriesEnabled: true, dailySetEnabled: true, pcSearchEnabled: true },
];

function sanitizeDbError(e: any): string {
  const msg = e?.message || "Unknown error";
  if (msg.includes("Failed query") || msg.includes("getaddrinfo") || msg.includes("ECONNREFUSED") || msg.includes("EAI_AGAIN")) {
    return "Database temporarily unavailable. Please try again in a moment.";
  }
  if (msg.includes("relation") && msg.includes("does not exist")) {
    return "Service is starting up. Please try again in a moment.";
  }
  return "An unexpected error occurred. Please try again.";
}

async function seedFeatureConfigs(retries = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      for (const cfg of DEFAULT_CONFIGS) {
        const existing = await db.select().from(featureConfigTable).where(eq(featureConfigTable.keyType, cfg.keyType));
        if (existing.length === 0) {
          await db.insert(featureConfigTable).values(cfg);
        }
      }
      return;
    } catch (e) {
      lastError = e;
      console.error(`seedFeatureConfigs attempt ${attempt}/${retries} failed:`, e);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  console.error(`seedFeatureConfigs failed after ${retries} attempts`);
  throw lastError;
}
seedFeatureConfigs().catch(console.error);

const router: IRouter = Router();

function generateKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString("hex").toUpperCase());
  }
  return segments.join("-");
}

router.get("/admin/keys", requireAdmin, async (_req, res) => {
  try {
    const keys = await db.select().from(licenseKeysTable).orderBy(licenseKeysTable.createdAt);
    res.json({ keys });
  } catch (e: any) {
    console.error("GET /admin/keys error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.post("/admin/keys", requireAdmin, async (req, res) => {
  try {
    const { label, maxAccounts, expiresAt, keyType } = req.body;
    const validTypes = ["basic", "premium", "unlimited", "admin"];
    const key = generateKey();
    const [created] = await db.insert(licenseKeysTable).values({
      key,
      label: label || null,
      keyType: validTypes.includes(keyType) ? keyType : "basic",
      maxAccounts: maxAccounts ?? 3,
      expiresAt: new Date(expiresAt),
    }).returning();
    res.json({ key: created });
  } catch (e: any) {
    console.error("POST /admin/keys error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.put("/admin/keys/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, maxAccounts, expiresAt, isActive, keyType } = req.body;
    const validTypes = ["basic", "premium", "unlimited", "admin"];

    const updates: any = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (maxAccounts !== undefined) updates.maxAccounts = maxAccounts;
    if (expiresAt !== undefined) updates.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) updates.isActive = isActive;
    if (keyType !== undefined && validTypes.includes(keyType)) updates.keyType = keyType;

    const [current] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, id));
    if (current) {
      if (isActive !== undefined && current.isActive !== isActive) {
        console.log(`[KEY STATUS CHANGE] Key ${current.key} (${current.label || 'no label'}) changed from isActive=${current.isActive} to isActive=${isActive} at ${new Date().toISOString()} — source IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
      }
      if (keyType !== undefined && validTypes.includes(keyType) && current.keyType !== keyType) {
        console.log(`[TIER CHANGE] Key ${current.key} (${current.label || 'no label'}) tier changed from ${current.keyType} to ${keyType} at ${new Date().toISOString()} — source IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
      }
    }

    // If the keyType is being changed, cap maxAccounts to the new tier's limit
    if (keyType !== undefined && validTypes.includes(keyType) && updates.maxAccounts === undefined) {
      const [tierCfg] = await db.select().from(featureConfigTable).where(eq(featureConfigTable.keyType, keyType));
      if (tierCfg) {
        const currentMaxAccounts = current?.maxAccounts ?? 999;
        updates.maxAccounts = Math.min(currentMaxAccounts, tierCfg.maxAccounts);
      }
    }

    const [updated] = await db.update(licenseKeysTable)
      .set(updates)
      .where(eq(licenseKeysTable.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Key not found" });
    }
    res.json({ key: updated });
  } catch (e: any) {
    console.error("PUT /admin/keys error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.delete("/admin/keys/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [deleted] = await db.delete(licenseKeysTable)
      .where(eq(licenseKeysTable.id, id))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: "Key not found" });
    }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /admin/keys error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.get("/admin/feature-config", requireAdmin, async (_req, res) => {
  try {
    const configs = await db.select().from(featureConfigTable);
    res.json({ configs });
  } catch (e: any) {
    console.error("GET /admin/feature-config error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.put("/admin/feature-config/:keyType", requireAdmin, async (req, res) => {
  try {
    const { keyType } = req.params;
    const validTypes = ["basic", "premium", "unlimited", "admin"];
    if (!validTypes.includes(keyType)) {
      return res.status(400).json({ error: "Invalid key type" });
    }

    const { maxAccounts, maxSearches, minDelaySeconds, backgroundEnabled, customQueriesEnabled } = req.body;
    const updates: any = {};
    if (maxAccounts !== undefined) {
      const n = Number(maxAccounts);
      if (isNaN(n)) return res.status(400).json({ error: "maxAccounts must be a number" });
      updates.maxAccounts = Math.max(1, Math.min(999, n));
    }
    if (maxSearches !== undefined) {
      const n = Number(maxSearches);
      if (isNaN(n)) return res.status(400).json({ error: "maxSearches must be a number" });
      updates.maxSearches = Math.max(1, Math.min(999, n));
    }
    if (minDelaySeconds !== undefined) {
      const n = Number(minDelaySeconds);
      if (isNaN(n)) return res.status(400).json({ error: "minDelaySeconds must be a number" });
      updates.minDelaySeconds = Math.max(1, Math.min(60, n));
    }
    if (backgroundEnabled !== undefined) updates.backgroundEnabled = Boolean(backgroundEnabled);
    if (customQueriesEnabled !== undefined) updates.customQueriesEnabled = Boolean(customQueriesEnabled);
    if (req.body.dailySetEnabled !== undefined) updates.dailySetEnabled = Boolean(req.body.dailySetEnabled);
    if (req.body.pcSearchEnabled !== undefined) updates.pcSearchEnabled = Boolean(req.body.pcSearchEnabled);

    const [updated] = await db.update(featureConfigTable)
      .set(updates)
      .where(eq(featureConfigTable.keyType, keyType))
      .returning();

    let tierConfig = updated;
    if (!tierConfig) {
      const [created] = await db.insert(featureConfigTable)
        .values({ keyType, ...updates })
        .returning();
      tierConfig = created;
    }

    // Enforce tier maxAccounts on all existing keys of this type so no key can exceed the new limit
    if (updates.maxAccounts !== undefined) {
      await db.update(licenseKeysTable)
        .set({ maxAccounts: updates.maxAccounts, updatedAt: new Date() })
        .where(eq(licenseKeysTable.keyType, keyType));
      console.log(`[TIER CONFIG] maxAccounts for ${keyType} tier set to ${updates.maxAccounts} — applied to all ${keyType} keys`);
    }

    res.json({ config: tierConfig });
  } catch (e: any) {
    console.error("PUT /admin/feature-config error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.post("/validate-admin", async (req, res) => {
  const ADMIN_SECRET = process.env["ADMIN_SECRET"];
  const { secret } = req.body;
  if (!secret || !ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.json({ valid: false });
  }
  res.json({ valid: true, isAdmin: true });
});

router.put("/admin/keys/:id/reset-device", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(licenseKeysTable)
      .set({ boundDeviceId: null, updatedAt: new Date() })
      .where(eq(licenseKeysTable.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: "Key not found" });
    }
    res.json({ key: updated });
  } catch (e: any) {
    console.error("PUT /admin/keys/reset-device error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.post("/validate-key", async (req, res) => {
  try {
    const { key, deviceId } = req.body;
    if (!key) {
      return res.status(400).json({ valid: false, error: "Key is required" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));

    if (!found) {
      return res.json({ valid: false, error: "Invalid key" });
    }

    if (!found.isActive) {
      return res.json({ valid: false, error: "Key has been deactivated" });
    }

    if (new Date(found.expiresAt) < new Date()) {
      return res.json({ valid: false, error: "Key has expired" });
    }

    if (deviceId) {
      if (found.boundDeviceId && found.boundDeviceId !== deviceId) {
        return res.json({ valid: false, error: "Key is already in use on another device" });
      }

      if (!found.boundDeviceId) {
        await db.update(licenseKeysTable)
          .set({ boundDeviceId: deviceId, updatedAt: new Date() })
          .where(and(eq(licenseKeysTable.id, found.id), isNull(licenseKeysTable.boundDeviceId)));
        // Re-query to confirm bind — avoids relying on adapter-specific rowCount metadata
        const [recheckBound] = await db
          .select({ boundDeviceId: licenseKeysTable.boundDeviceId })
          .from(licenseKeysTable)
          .where(eq(licenseKeysTable.id, found.id));
        if (recheckBound?.boundDeviceId !== deviceId) {
          return res.json({ valid: false, error: "Key is already in use on another device" });
        }
      }
    }

    const [featureConfig] = await db.select().from(featureConfigTable)
      .where(eq(featureConfigTable.keyType, found.keyType));

    // Cap per-key maxAccounts by the tier's global limit so tier config is always enforced
    const effectiveMaxAccounts = featureConfig
      ? Math.min(found.maxAccounts, featureConfig.maxAccounts)
      : found.maxAccounts;

    res.json({
      valid: true,
      maxAccounts: effectiveMaxAccounts,
      expiresAt: found.expiresAt,
      label: found.label,
      keyType: found.keyType,
      featureConfig: featureConfig || null,
    });
  } catch (e: any) {
    console.error("POST /validate-key error:", e);
    res.status(500).json({ valid: false, error: sanitizeDbError(e) });
  }
});

router.post("/sync-cookies", async (req, res) => {
  try {
    const { key, deviceId, accounts } = req.body;
    if (!key || !deviceId || !Array.isArray(accounts)) {
      return res.status(400).json({ error: "key, deviceId, and accounts[] required" });
    }

    if (accounts.length > 50) {
      return res.status(400).json({ error: "Too many accounts" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));

    if (!found || !found.isActive) {
      return res.status(403).json({ error: "Invalid or inactive key" });
    }

    if (new Date(found.expiresAt) < new Date()) {
      return res.status(403).json({ error: "Key has expired" });
    }

    if (found.boundDeviceId && found.boundDeviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    if (!found.boundDeviceId) {
      return res.status(403).json({ error: "Key not yet bound to a device" });
    }

    for (const acct of accounts) {
      if (!acct.email || !acct.cookies) continue;
      const cookieStr = typeof acct.cookies === "string" ? acct.cookies : JSON.stringify(acct.cookies);
      if (cookieStr.length > 50000) continue;

      const existing = await db.select().from(deviceCookiesTable)
        .where(and(
          eq(deviceCookiesTable.licenseKeyId, found.id),
          eq(deviceCookiesTable.accountEmail, acct.email)
        ));

      if (existing.length > 0) {
        await db.update(deviceCookiesTable)
          .set({ cookies: cookieStr, accountName: acct.name || null, deviceId, updatedAt: new Date() })
          .where(eq(deviceCookiesTable.id, existing[0].id));
      } else {
        await db.insert(deviceCookiesTable).values({
          licenseKeyId: found.id,
          deviceId,
          accountEmail: acct.email,
          accountName: acct.name || null,
          cookies: cookieStr,
        });
      }
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("POST /sync-cookies error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.get("/admin/keys/:id/cookies", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cookies = await db.select().from(deviceCookiesTable)
      .where(eq(deviceCookiesTable.licenseKeyId, id));
    res.json({ cookies });
  } catch (e: any) {
    console.error("GET /admin/keys/cookies error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

export default router;
