import { Router, type IRouter } from "express";
import healthRouter from "./health";
import proxyRouter from "./proxy";
import keysRouter from "./keys";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);

// The proxy forwards /validate-key, /validate-admin, /sync-cookies to the
// Render production server — useful only in the Replit dev environment so
// the local dev server can reach production data without its own DB records.
//
// On Render itself, the proxy must NOT run: Render IS the production server,
// so enabling the proxy here would cause an infinite self-request loop.
// Render injects RENDER=true into every service's environment automatically.
if (!process.env.RENDER) {
  router.use(proxyRouter);
}

router.use(keysRouter);
router.use(adminRouter);

export default router;
