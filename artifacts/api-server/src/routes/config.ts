import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { globalConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../adminSession";

const router: IRouter = Router();

const TIERS_KEY = "phase3_tiers";
const PAYMENT_METHODS_KEY = "phase3_payment_methods";

const DEFAULT_TIERS = [
  { id: "basic", label: "Basic", price: 5, currency: "USD", period: "month", features: ["2 accounts", "Daily set"] },
  { id: "premium", label: "Premium", price: 12, currency: "USD", period: "month", features: ["5 accounts", "Background mode", "Custom queries"] },
  { id: "unlimited", label: "Unlimited", price: 25, currency: "USD", period: "month", features: ["Unlimited accounts", "All features"] },
];

const DEFAULT_PAYMENT_METHODS = [
  { id: "bank", label: "Bank Transfer", details: "Add your bank account info in the admin config" },
  { id: "crypto", label: "Crypto Wallet", details: "Add your wallet address in the admin config" },
];

async function readJsonConfig<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(globalConfigTable).where(eq(globalConfigTable.key, key));
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonConfig(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  const [existing] = await db.select().from(globalConfigTable).where(eq(globalConfigTable.key, key));
  if (existing) {
    await db.update(globalConfigTable).set({ value: serialized }).where(eq(globalConfigTable.key, key));
  } else {
    await db.insert(globalConfigTable).values({ key, value: serialized });
  }
}

// ── Public: fetch tiers + payment methods (for the in-app Upgrade screen) ────
router.get("/config", async (_req: Request, res: Response) => {
  try {
    const tiers = await readJsonConfig(TIERS_KEY, DEFAULT_TIERS);
    const paymentMethods = await readJsonConfig(PAYMENT_METHODS_KEY, DEFAULT_PAYMENT_METHODS);
    res.json({ tiers, paymentMethods });
  } catch (e: any) {
    console.error("GET /config error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: fetch tiers + payment methods ──────────────────────────────────────
router.get("/admin/config", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const tiers = await readJsonConfig(TIERS_KEY, DEFAULT_TIERS);
    const paymentMethods = await readJsonConfig(PAYMENT_METHODS_KEY, DEFAULT_PAYMENT_METHODS);
    res.json({ tiers, paymentMethods });
  } catch (e: any) {
    console.error("GET /admin/config error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: update tiers + payment methods (JSON blobs) ────────────────────────
router.put("/admin/config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { tiers, paymentMethods } = req.body;
    if (tiers !== undefined) {
      if (!Array.isArray(tiers)) return res.status(400).json({ error: "tiers must be an array" });
      await writeJsonConfig(TIERS_KEY, tiers);
    }
    if (paymentMethods !== undefined) {
      if (!Array.isArray(paymentMethods)) return res.status(400).json({ error: "paymentMethods must be an array" });
      await writeJsonConfig(PAYMENT_METHODS_KEY, paymentMethods);
    }
    const finalTiers = await readJsonConfig(TIERS_KEY, DEFAULT_TIERS);
    const finalPaymentMethods = await readJsonConfig(PAYMENT_METHODS_KEY, DEFAULT_PAYMENT_METHODS);
    res.json({ tiers: finalTiers, paymentMethods: finalPaymentMethods });
  } catch (e: any) {
    console.error("PUT /admin/config error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
