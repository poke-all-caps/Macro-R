import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
// Client compresses/resizes ID photos before upload (see LicenseGate.tsx),
// so 6mb comfortably covers two compressed base64 JPEGs plus JSON overhead
// while still protecting the server/DB from arbitrarily large payloads.
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true, limit: "6mb" }));

app.use("/api", router);

export default app;
