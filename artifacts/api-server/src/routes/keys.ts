import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { licenseKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

const ADMIN_SECRET = process.env["ADMIN_SECRET"];
if (!ADMIN_SECRET) {
  console.warn("WARNING: ADMIN_SECRET env var not set — admin endpoints will reject all requests");
}

function requireAdmin(req: any, res: any, next: any) {
  const auth = req.headers["x-admin-secret"] || req.query.secret;
  if (auth !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

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
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/keys", requireAdmin, async (req, res) => {
  try {
    const { label, maxAccounts, expiresAt } = req.body;
    const key = generateKey();
    const [created] = await db.insert(licenseKeysTable).values({
      key,
      label: label || null,
      maxAccounts: maxAccounts ?? 3,
      expiresAt: new Date(expiresAt),
    }).returning();
    res.json({ key: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/keys/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, maxAccounts, expiresAt, isActive } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (maxAccounts !== undefined) updates.maxAccounts = maxAccounts;
    if (expiresAt !== undefined) updates.expiresAt = new Date(expiresAt);
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db.update(licenseKeysTable)
      .set(updates)
      .where(eq(licenseKeysTable.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Key not found" });
    }
    res.json({ key: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
    res.status(500).json({ error: e.message });
  }
});

router.post("/validate-admin", async (req, res) => {
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
    res.status(500).json({ error: e.message });
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
          .where(eq(licenseKeysTable.id, found.id));
      }
    }

    res.json({
      valid: true,
      maxAccounts: found.maxAccounts,
      expiresAt: found.expiresAt,
      label: found.label,
    });
  } catch (e: any) {
    res.status(500).json({ valid: false, error: e.message });
  }
});

export default router;
