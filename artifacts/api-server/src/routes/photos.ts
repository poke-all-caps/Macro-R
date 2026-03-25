import { Router } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { licenseKeysTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../adminSession";

const router = Router();
const connectors = new ReplitConnectors();

const ROOT_FOLDER_NAME = "MacroRewards_Photos";

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ""}`;
  const searchRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { method: "GET" });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];

  const createRes = await connectors.proxy("google-drive", "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const createData = await createRes.json();
  return createData.id;
}

async function getKeyFolder(licenseKey: string): Promise<string> {
  const rootId = await findOrCreateFolder(ROOT_FOLDER_NAME);
  const safeKeyName = licenseKey.replace(/[^A-Z0-9-]/gi, "_");
  return await findOrCreateFolder(safeKeyName, rootId);
}

router.post("/photos/upload", async (req, res) => {
  try {
    const { key, deviceId, fileName, mimeType, base64Data } = req.body;

    if (!key || !deviceId || !base64Data) {
      return res.status(400).json({ error: "key, deviceId, and base64Data required" });
    }

    if (typeof base64Data !== "string" || base64Data.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: "Photo too large (max ~18MB file)" });
    }

    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key.trim().toUpperCase()));

    if (!found || !found.isActive) {
      return res.status(403).json({ error: "Invalid or inactive key" });
    }

    if (new Date(found.expiresAt) < new Date()) {
      return res.status(403).json({ error: "Key has expired" });
    }

    if (found.boundDeviceId && found.boundDeviceId !== deviceId) {
      return res.status(403).json({ error: "Device mismatch" });
    }

    if (!found.boundDeviceId) {
      return res.status(403).json({ error: "Key not yet bound to a device" });
    }

    const folderId = await getKeyFolder(found.key);

    const name = fileName || `photo_${Date.now()}.jpg`;
    const type = mimeType || "image/jpeg";

    const metadata = JSON.stringify({ name, parents: [folderId] });
    const binaryData = Buffer.from(base64Data, "base64");

    const boundary = "macro_rewards_boundary_" + Date.now();
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${type}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Data}\r\n` +
      `--${boundary}--`;

    const uploadRes = await connectors.proxy(
      "google-drive",
      "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      }
    );

    const uploadData = await uploadRes.json();

    if (uploadData.error) {
      return res.status(500).json({ error: uploadData.error.message || "Upload failed" });
    }

    res.json({
      success: true,
      file: {
        id: uploadData.id,
        name: uploadData.name,
        webViewLink: uploadData.webViewLink,
      },
    });
  } catch (e: any) {
    console.error("Photo upload error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/admin/keys/:id/photos", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [found] = await db.select().from(licenseKeysTable)
      .where(eq(licenseKeysTable.id, id));

    if (!found) {
      return res.status(404).json({ error: "Key not found" });
    }

    const folderId = await getKeyFolder(found.key);

    const listRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,createdTime,thumbnailLink,webViewLink)&orderBy=createdTime+desc&pageSize=100`,
      { method: "GET" }
    );
    const listData = await listRes.json();

    const photos = (listData.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      createdTime: f.createdTime,
      thumbnailLink: f.thumbnailLink,
      webViewLink: f.webViewLink,
    }));

    res.json({ photos, folderId });
  } catch (e: any) {
    console.error("List photos error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/admin/keys/:id/photos/:photoId/view", requireAdmin, async (req, res) => {
  try {
    const { photoId } = req.params;

    const fileRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${photoId}?alt=media`,
      { method: "GET" }
    );

    const contentType = fileRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (e: any) {
    console.error("View photo error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
