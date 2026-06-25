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

initSchema()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server listening on 0.0.0.0:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
