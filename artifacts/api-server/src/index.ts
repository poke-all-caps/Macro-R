import app from "./app";
import { initSchema } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Mask the DB URL for safe logging (show host only)
function maskDbUrl(url: string | undefined): string {
  if (!url) return "(not set)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? "***@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

console.log(`[startup] PORT=${port}`);
console.log(`[startup] DATABASE_URL=${maskDbUrl(process.env.DATABASE_URL)}`);
console.log(`[startup] NODE_ENV=${process.env.NODE_ENV ?? "development"}`);

initSchema()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`[startup] Server listening on 0.0.0.0:${port}`);
    });
  })
  .catch((err) => {
    console.error("[startup] FATAL: Failed to initialize database schema:", err);
    process.exit(1);
  });
