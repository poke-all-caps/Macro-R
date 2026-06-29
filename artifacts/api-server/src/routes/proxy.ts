import { Router, type IRouter, type Request, type Response } from "express";

const PRODUCTION_API = "https://macro-r-631x.onrender.com/api";
const PROXY_ROUTES = ["/validate-key", "/validate-admin", "/sync-cookies", "/add-account", "/remove-account", "/run-task"];

console.log(`[proxy] Forwarding ${PROXY_ROUTES.join(", ")} → ${PRODUCTION_API}`);

const router: IRouter = Router();

async function forwardToProduction(req: Request, res: Response) {
  const targetUrl = `${PRODUCTION_API}${req.path}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
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

export default router;
