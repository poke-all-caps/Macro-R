import { Router, type IRouter, type Request, type Response } from "express";

const PRODUCTION_API = "https://macro-r-631x.onrender.com/api";

// Exact-path routes: the client-facing license/account endpoints.
const PROXY_ROUTES = ["/validate-key", "/validate-admin", "/sync-cookies", "/add-account", "/remove-account", "/run-task"];

// Prefix routes: everything under these paths (any method — GET/POST/PUT/DELETE)
// is forwarded to production. This covers the invite/KYC flow and the entire
// admin panel (key list, invite codes, KYC review, feature config, etc.) so
// that using the app/admin panel from the Replit dev preview always reflects
// the same data the mobile app sees, instead of the empty local dev DB.
const PROXY_PREFIXES = ["/invite", "/admin"];

console.log(`[proxy] Forwarding ${PROXY_ROUTES.join(", ")} and everything under ${PROXY_PREFIXES.join(", ")} → ${PRODUCTION_API}`);

const router: IRouter = Router();

async function forwardToProduction(req: Request, res: Response) {
  const targetUrl = `${PRODUCTION_API}${req.url}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (req.headers.cookie) headers["cookie"] = req.headers.cookie;
    if (req.headers["x-admin-secret"]) headers["x-admin-secret"] = req.headers["x-admin-secret"] as string;
    if (req.headers["x-admin-key"]) headers["x-admin-key"] = req.headers["x-admin-key"] as string;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) res.setHeader("set-cookie", setCookie);

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } else {
      const text = await upstream.text();
      res.status(upstream.status).set("content-type", contentType || "text/plain").send(text);
    }
  } catch (e: any) {
    const timedOut = e?.name === "AbortError";
    res.status(502).json({
      error: timedOut ? "Production server timed out" : "Could not reach production server",
    });
  }
}

for (const route of PROXY_ROUTES) {
  router.post(route, forwardToProduction);
}

for (const prefix of PROXY_PREFIXES) {
  // Registered directly on this router (not via router.use(prefix, ...)) so
  // Express does NOT strip the prefix from req.url — we need the full path
  // (e.g. "/admin/keys") to forward correctly.
  router.all(prefix, forwardToProduction);
  router.all(`${prefix}/*splat`, forwardToProduction);
}

export default router;
