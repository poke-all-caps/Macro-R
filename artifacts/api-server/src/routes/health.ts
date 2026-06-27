import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  // Respond 200 immediately so Render's health checker always sees a live
  // service, even when Neon is cold on startup.
  // The DB ping runs in the background — it warms the connection without
  // blocking or gating the health response.
  db.execute(sql`SELECT 1`).catch(() => {
    // Silently ignore — this is best-effort keep-alive, not a liveness gate.
  });
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
