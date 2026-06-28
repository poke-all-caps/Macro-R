import crypto from "crypto";
import { db } from "@workspace/db";
import { licenseKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const sessions = new Map<string, number>(); // token -> expiresAt (ms)

export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function deleteSession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function getSessionFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(";").find((c) => c.trim().startsWith("admin_session="));
  return match?.split("=").slice(1).join("=").trim();
}

async function isAdminLicenseKey(key: string | undefined): Promise<boolean> {
  if (!key) return false;
  try {
    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));
    return !!(found && found.isActive && found.keyType === "admin" && new Date(found.expiresAt) > new Date());
  } catch {
    return false;
  }
}

export function requireAdmin(req: any, res: any, next: any): void {
  const ADMIN_SECRET = process.env["ADMIN_SECRET"];

  // 1. Secret-header auth (only possible when ADMIN_SECRET is configured)
  if (ADMIN_SECRET) {
    const headerSecret = req.headers["x-admin-secret"];
    if (headerSecret === ADMIN_SECRET) { next(); return; }
  }

  // 2. Browser session cookie
  const sessionToken = getSessionFromCookie(req.headers.cookie);
  if (isValidSession(sessionToken)) { next(); return; }

  // 3. Admin-type license key (always checked, no dependency on ADMIN_SECRET)
  const adminKey = req.headers["x-admin-key"];
  if (adminKey) {
    isAdminLicenseKey(adminKey).then((valid) => {
      if (valid) { next(); return; }
      res.status(401).json({ error: "Unauthorized" });
    }).catch(() => {
      res.status(401).json({ error: "Unauthorized" });
    });
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
