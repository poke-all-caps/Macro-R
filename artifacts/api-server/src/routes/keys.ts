import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { licenseKeysTable, featureConfigTable, deviceCookiesTable, deletedAccountsTable, inviteCodesTable } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
import crypto from "crypto";
import { requireAdmin } from "../adminSession";

const DEFAULT_CONFIGS = [
  { keyType: "trial", maxAccounts: 3, maxSearches: 20, minDelaySeconds: 5, backgroundEnabled: false, customQueriesEnabled: false, dailySetEnabled: true, pcSearchEnabled: false },
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

function generateInviteCodeForKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.get("/admin/keys", requireAdmin, async (_req, res) => {
  try {
    const keys = await db.select().from(licenseKeysTable).orderBy(licenseKeysTable.createdAt);

    // Attach the invite code that was auto-generated alongside each key (Basic
    // keys get one at creation time) so the admin panel can show it inline.
    const keyIds = keys.map((k) => k.id);
    const codeMap = new Map<string, { code: string; status: string }>();
    if (keyIds.length > 0) {
      const codes = await db
        .select({ licenseKeyId: inviteCodesTable.licenseKeyId, code: inviteCodesTable.code, status: inviteCodesTable.status })
        .from(inviteCodesTable)
        .where(inArray(inviteCodesTable.licenseKeyId, keyIds));
      for (const c of codes) {
        if (c.licenseKeyId) codeMap.set(c.licenseKeyId, { code: c.code, status: c.status });
      }
    }
    const withInviteCodes = keys.map((k) => ({
      ...k,
      inviteCode: codeMap.get(k.id)?.code ?? null,
      inviteCodeStatus: codeMap.get(k.id)?.status ?? null,
    }));

    res.json({ keys: withInviteCodes });
  } catch (e: any) {
    console.error("GET /admin/keys error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.post("/admin/keys", requireAdmin, async (req, res) => {
  try {
    const { label, maxAccounts, expiresAt, keyType } = req.body;
    const validTypes = ["trial", "basic", "premium", "unlimited", "admin"];
    const resolvedType = validTypes.includes(keyType) ? keyType : "basic";
    const key = generateKey();
    const [created] = await db.insert(licenseKeysTable).values({
      key,
      label: label || null,
      keyType: resolvedType,
      maxAccounts: maxAccounts ?? 3,
      expiresAt: new Date(expiresAt),
    }).returning();

    // Every new Basic key ships with a fresh, working invite code so the
    // admin can immediately hand it out for onboarding/KYC.
    let inviteCode: string | null = null;
    if (resolvedType === "basic") {
      const [createdCode] = await db
        .insert(inviteCodesTable)
        .values({ code: generateInviteCodeForKey(), licenseKeyId: created.id })
        .returning();
      inviteCode = createdCode.code;
    }

    res.json({ key: created, inviteCode });
  } catch (e: any) {
    console.error("POST /admin/keys error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.put("/admin/keys/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, maxAccounts, expiresAt, isActive, keyType } = req.body;
    const validTypes = ["trial", "basic", "premium", "unlimited", "admin"];

    const updates: any = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (expiresAt !== undefined) updates.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) updates.isActive = isActive;
    if (keyType !== undefined && validTypes.includes(keyType)) updates.keyType = keyType;

    // When admin explicitly sets maxAccounts on an individual key, store it as a
    // custom override. This takes priority over the tier config during validation.
    if (maxAccounts !== undefined) {
      const n = Math.max(1, Math.min(999, Number(maxAccounts)));
      updates.maxAccounts = n;
      updates.customMaxAccounts = n;
    }

    // When admin explicitly sets minDelaySeconds on an individual key, store it as
    // a custom override. This takes priority over the tier config during validation.
    const { minDelaySeconds } = req.body;
    if (minDelaySeconds !== undefined) {
      const n = Math.max(1, Math.min(60, Number(minDelaySeconds)));
      updates.customMinDelaySeconds = n;
    }

    const [current] = await db.select().from(licenseKeysTable).where(eq(licenseKeysTable.id, id));
    if (current) {
      if (isActive !== undefined && current.isActive !== isActive) {
        console.log(`[KEY STATUS CHANGE] Key ${current.key} (${current.label || 'no label'}) changed from isActive=${current.isActive} to isActive=${isActive} at ${new Date().toISOString()} — source IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
      }
      if (keyType !== undefined && validTypes.includes(keyType) && current.keyType !== keyType) {
        console.log(`[TIER CHANGE] Key ${current.key} (${current.label || 'no label'}) tier changed from ${current.keyType} to ${keyType} at ${new Date().toISOString()} — source IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
      }
    }

    // If only the keyType is being changed (no custom maxAccounts in this request
    // and no pre-existing custom override), sync maxAccounts to the new tier's default.
    // If the key already has a custom override, leave it untouched.
    if (keyType !== undefined && validTypes.includes(keyType) && updates.maxAccounts === undefined) {
      const hasExistingCustom = current?.customMaxAccounts != null;
      if (!hasExistingCustom) {
        const [tierCfg] = await db.select().from(featureConfigTable).where(eq(featureConfigTable.keyType, keyType));
        if (tierCfg) {
          updates.maxAccounts = tierCfg.maxAccounts;
        }
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
    const validTypes = ["trial", "basic", "premium", "unlimited", "admin"];
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

    // Apply the new tier maxAccounts to all keys of this type that do NOT have an
    // individual custom override set. Keys with a custom override keep their value.
    if (updates.maxAccounts !== undefined) {
      await db.update(licenseKeysTable)
        .set({ maxAccounts: updates.maxAccounts, updatedAt: new Date() })
        .where(and(eq(licenseKeysTable.keyType, keyType), isNull(licenseKeysTable.customMaxAccounts)));
      console.log(`[TIER CONFIG] maxAccounts for ${keyType} tier set to ${updates.maxAccounts} — applied to ${keyType} keys without individual overrides`);
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

router.delete("/admin/keys/:id/pin", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(licenseKeysTable)
      .set({ pin: null, updatedAt: new Date() })
      .where(eq(licenseKeysTable.id, id))
      .returning({ id: licenseKeysTable.id, key: licenseKeysTable.key });
    if (!updated) return res.status(404).json({ error: "Key not found" });
    console.log(`[PIN CLEAR] PIN cleared for key ${updated.key} at ${new Date().toISOString()} — source IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE /admin/keys/pin error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
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
    const { key, deviceId, pin } = req.body;
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
        const [recheckBound] = await db
          .select({ boundDeviceId: licenseKeysTable.boundDeviceId })
          .from(licenseKeysTable)
          .where(eq(licenseKeysTable.id, found.id));
        if (recheckBound?.boundDeviceId !== deviceId) {
          return res.json({ valid: false, error: "Key is already in use on another device" });
        }
      }
    }

    // ── PIN gate ──────────────────────────────────────────────────────────────
    // If no PIN supplied, tell the client whether one is already set or needs to be created.
    const pinProvided = pin !== undefined && pin !== null && String(pin).trim() !== "";
    if (!pinProvided) {
      return res.json({
        valid: false,
        requiresPin: true,
        pinSet: found.pin !== null,
      });
    }

    const pinStr = String(pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return res.status(400).json({ valid: false, error: "PIN must be exactly 4 digits" });
    }

    if (found.pin === null) {
      // First-time login: save the PIN in plain text so admin can read it
      await db.update(licenseKeysTable)
        .set({ pin: pinStr, updatedAt: new Date() })
        .where(eq(licenseKeysTable.id, found.id));
    } else if (found.pin !== pinStr) {
      // Returning login: compare directly (plain text, no hashing)
      return res.status(401).json({ valid: false, error: "Invalid PIN" });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const [featureConfig] = await db.select().from(featureConfigTable)
      .where(eq(featureConfigTable.keyType, found.keyType));

    // Individual custom overrides set by an admin take first priority over tier defaults.
    const effectiveMaxAccounts = found.customMaxAccounts != null
      ? found.customMaxAccounts
      : (featureConfig ? featureConfig.maxAccounts : found.maxAccounts);

    const effectiveFeatureConfig = featureConfig
      ? {
          ...featureConfig,
          minDelaySeconds: found.customMinDelaySeconds != null
            ? found.customMinDelaySeconds
            : featureConfig.minDelaySeconds,
        }
      : null;

    // Hydrate all accounts associated with this key so the client can restore state
    const cookieRows = await db.select().from(deviceCookiesTable)
      .where(eq(deviceCookiesTable.licenseKeyId, found.id));

    const accounts = cookieRows.map((row) => ({
      email: row.accountEmail,
      name: row.accountName || row.accountEmail,
      cookies: (() => { try { return JSON.parse(row.cookies); } catch { return {}; } })(),
    }));

    res.json({
      valid: true,
      maxAccounts: effectiveMaxAccounts,
      expiresAt: found.expiresAt,
      label: found.label,
      keyType: found.keyType,
      featureConfig: effectiveFeatureConfig,
      accounts,
    });
  } catch (e: any) {
    console.error("POST /validate-key error:", e);
    res.status(500).json({ valid: false, error: sanitizeDbError(e) });
  }
});

// ── System 2: Hack-proof account slot validation ──────────────────────────────
// The server physically counts accounts in the DB and enforces the limit.
// The client cannot manipulate the count. Custom per-key limits take priority.
router.post("/add-account", async (req, res) => {
  try {
    const { key, deviceId, account } = req.body;
    if (!key || !account?.email) {
      return res.status(400).json({ error: "key and account.email are required" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));

    if (!found || !found.isActive) {
      return res.status(403).json({ error: "Invalid or inactive key" });
    }
    if (new Date(found.expiresAt) < new Date()) {
      return res.status(403).json({ error: "Key has expired" });
    }
    if (deviceId && found.boundDeviceId && found.boundDeviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    // Effective limit: individual custom override takes first priority over tier default
    const [tierCfg] = await db.select().from(featureConfigTable)
      .where(eq(featureConfigTable.keyType, found.keyType));
    const maxAccounts = (found.customMaxAccounts !== null && found.customMaxAccounts !== undefined)
      ? found.customMaxAccounts
      : (tierCfg ? tierCfg.maxAccounts : found.maxAccounts);
    console.log("Custom Key Limit:", found.customMaxAccounts, "| Tier Default:", tierCfg?.maxAccounts ?? found.maxAccounts, "| Final Limit Applied:", maxAccounts);

    // Server physically counts existing accounts — client count is never trusted
    const existingRows = await db.select({
      id: deviceCookiesTable.id,
      email: deviceCookiesTable.accountEmail,
    }).from(deviceCookiesTable).where(eq(deviceCookiesTable.licenseKeyId, found.id));

    const emailLower = account.email.toLowerCase().trim();
    const existingForEmail = existingRows.find((r) => r.email.toLowerCase() === emailLower);

    // Only block if this is a NEW account (not an update) and the slot is full
    if (!existingForEmail && existingRows.length >= maxAccounts) {
      return res.status(403).json({
        error: `Account limit reached (${maxAccounts} max)`,
        limit: maxAccounts,
        current: existingRows.length,
      });
    }

    const cookieStr = typeof account.cookies === "string"
      ? account.cookies
      : JSON.stringify(account.cookies || {});

    if (existingForEmail) {
      await db.update(deviceCookiesTable)
        .set({ cookies: cookieStr, accountName: account.name || null, deviceId: deviceId || null, updatedAt: new Date() })
        .where(eq(deviceCookiesTable.id, existingForEmail.id));
    } else {
      await db.insert(deviceCookiesTable).values({
        licenseKeyId: found.id,
        deviceId: deviceId || "",
        accountEmail: emailLower,
        accountName: account.name || null,
        cookies: cookieStr,
      });
    }

    const newCount = existingForEmail ? existingRows.length : existingRows.length + 1;
    res.json({ success: true, limit: maxAccounts, current: newCount });
  } catch (e: any) {
    console.error("POST /add-account error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

// ── System 3: Hack-proof task delay validation ────────────────────────────────
// The server validates the delay the client intends to use before a run starts.
// If the client (e.g. a modified APK) sends a delay below the allowed minimum,
// the request is rejected. Custom per-key limits take priority over tier defaults.
router.post("/run-task", async (req, res) => {
  try {
    const { key, deviceId, requestedDelay } = req.body;
    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));

    if (!found || !found.isActive) {
      return res.status(403).json({ error: "Invalid or inactive key" });
    }
    if (new Date(found.expiresAt) < new Date()) {
      return res.status(403).json({ error: "Key has expired" });
    }
    if (deviceId && found.boundDeviceId && found.boundDeviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    // Effective min delay: individual custom override takes first priority over tier default
    const [tierCfg] = await db.select().from(featureConfigTable)
      .where(eq(featureConfigTable.keyType, found.keyType));
    const minDelay = found.customMinDelaySeconds != null
      ? found.customMinDelaySeconds
      : (tierCfg ? tierCfg.minDelaySeconds : 5);

    const requested = Number(requestedDelay);
    if (isNaN(requested) || requested < minDelay) {
      return res.status(400).json({
        error: `Delay too short. Minimum allowed is ${minDelay} seconds.`,
        minDelay,
        requested: isNaN(requested) ? null : requested,
      });
    }

    res.json({ allowed: true, minDelay });
  } catch (e: any) {
    console.error("POST /run-task error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
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

router.post("/remove-account", async (req, res) => {
  try {
    const { key, deviceId, email } = req.body;
    if (!key || !email) {
      return res.status(400).json({ error: "key and email are required" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));

    if (!found || !found.isActive) {
      return res.status(403).json({ error: "Invalid or inactive key" });
    }
    if (deviceId && found.boundDeviceId && found.boundDeviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    const emailLower = email.toLowerCase().trim();

    const [existing] = await db.select().from(deviceCookiesTable)
      .where(and(
        eq(deviceCookiesTable.licenseKeyId, found.id),
        eq(deviceCookiesTable.accountEmail, emailLower)
      ));

    if (!existing) {
      return res.json({ success: true, archived: false });
    }

    // Archive to deleted_accounts before removing
    await db.insert(deletedAccountsTable).values({
      licenseKeyId: found.id,
      licenseKey: found.key,
      accountEmail: existing.accountEmail,
      accountName: existing.accountName,
      cookies: existing.cookies,
      deviceId: existing.deviceId,
      originalCreatedAt: null,
    });

    await db.delete(deviceCookiesTable)
      .where(eq(deviceCookiesTable.id, existing.id));

    console.log(`[remove-account] Archived and freed slot for ${emailLower} on key ${found.key}`);
    res.json({ success: true, archived: true });
  } catch (e: any) {
    console.error("POST /remove-account error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.post("/admin/deleted-accounts/:id/restore", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [archived] = await db.select().from(deletedAccountsTable)
      .where(eq(deletedAccountsTable.id, id));
    if (!archived) {
      return res.status(404).json({ error: "Deleted account record not found" });
    }

    const [key] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.id, archived.licenseKeyId));
    if (!key) {
      return res.status(404).json({ error: "The license key this account belonged to no longer exists" });
    }

    // Check slot availability before restoring
    const [tierCfg] = await db.select().from(featureConfigTable)
      .where(eq(featureConfigTable.keyType, key.keyType));
    const maxAccounts = (key.customMaxAccounts !== null && key.customMaxAccounts !== undefined)
      ? key.customMaxAccounts
      : (tierCfg ? tierCfg.maxAccounts : key.maxAccounts);

    const existingRows = await db.select().from(deviceCookiesTable)
      .where(eq(deviceCookiesTable.licenseKeyId, key.id));
    if (existingRows.length >= maxAccounts) {
      return res.status(409).json({
        error: `Cannot restore: key is already at its account limit (${maxAccounts} max, ${existingRows.length} current)`,
      });
    }

    // Check if a live row already exists for this email (avoid duplicate)
    const alreadyLive = existingRows.find(
      (r) => r.accountEmail.toLowerCase() === archived.accountEmail.toLowerCase()
    );
    if (alreadyLive) {
      return res.status(409).json({ error: "An active account with this email already exists on this key" });
    }

    await db.insert(deviceCookiesTable).values({
      licenseKeyId: key.id,
      deviceId: archived.deviceId || "",
      accountEmail: archived.accountEmail,
      accountName: archived.accountName,
      cookies: archived.cookies || "{}",
    });

    // Remove from archive
    await db.delete(deletedAccountsTable).where(eq(deletedAccountsTable.id, id));

    console.log(`[restore-account] Restored ${archived.accountEmail} to key ${key.key}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error("POST /admin/deleted-accounts/restore error:", e);
    res.status(500).json({ error: sanitizeDbError(e) });
  }
});

router.get("/admin/deleted-accounts", requireAdmin, async (req, res) => {
  try {
    const { keyId } = req.query as { keyId?: string };
    let rows;
    if (keyId) {
      rows = await db.select().from(deletedAccountsTable)
        .where(eq(deletedAccountsTable.licenseKeyId, keyId))
        .orderBy(deletedAccountsTable.deletedAt);
    } else {
      rows = await db.select().from(deletedAccountsTable)
        .orderBy(deletedAccountsTable.deletedAt);
    }
    res.json({ deletedAccounts: rows.reverse() });
  } catch (e: any) {
    console.error("GET /admin/deleted-accounts error:", e);
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
