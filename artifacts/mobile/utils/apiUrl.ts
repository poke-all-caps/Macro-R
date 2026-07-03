import Constants from "expo-constants";
import { Platform } from "react-native";

const PRODUCTION_API_URL = "https://macro-r-631x.onrender.com/api";

// Priority order for native builds:
// 1. Constants.expoConfig.extra.apiUrl — set in app.config.ts, baked into the
//    update *manifest* by EAS Update. This survives every OTA push because EAS
//    re-evaluates app.config.ts when publishing an update and embeds the result
//    in the manifest that the client downloads.
// 2. process.env.EXPO_PUBLIC_API_URL — baked into the JS *bundle* at build/
//    update time. Reliable for eas build (env block in eas.json). Less reliable
//    for eas update because the shell environment at update-publish time may
//    not have it set.
// 3. PRODUCTION_API_URL — hardcoded fallback. Never changes.
//
// Web always uses a relative path so the browser resolves it against the same
// origin — no CORS issues and no env var dependency.
//
// normaliseApiUrl ensures the resolved URL always ends with "/api" so that a
// misconfigured env var (e.g. bare "https://macro-r.onrender.com" without the
// path) never silently produces 404s on every admin route.
function normaliseApiUrl(url: string): string {
  const stripped = url.replace(/\/+$/, ""); // remove any trailing slashes
  return stripped.endsWith("/api") ? stripped : `${stripped}/api`;
}

const rawUrl: string =
  Platform.OS === "web"
    ? "/api"
    : ((Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
       process.env.EXPO_PUBLIC_API_URL ??
       PRODUCTION_API_URL);

export const API_BASE: string =
  Platform.OS === "web" ? "/api" : normaliseApiUrl(rawUrl);
