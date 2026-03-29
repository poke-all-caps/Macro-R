import { router } from "expo-router";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import Colors from "@/constants/colors";
import { consumeCookieBrowserPayload } from "@/utils/cookieBrowserStore";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

const TARGETS = [
  { url: "https://www.bing.com", domain: ".bing.com" },
  { url: "https://rewards.bing.com", domain: ".bing.com" },
  { url: "https://login.live.com", domain: ".live.com" },
  { url: "https://login.microsoftonline.com", domain: ".microsoftonline.com" },
  { url: "https://account.microsoft.com", domain: ".microsoft.com" },
];

async function injectCookies(cookies: Record<string, string>) {
  const mod = require("@react-native-cookies/cookies");
  const CookieManager = mod.default || mod;

  for (const { url } of TARGETS) {
    try { await CookieManager.clearByUrl?.(url); } catch {}
  }

  let injected = 0;
  for (const [name, value] of Object.entries(cookies)) {
    if (name.startsWith("_ls_") || !value) continue;
    for (const { url, domain } of TARGETS) {
      try {
        await CookieManager.set(url, { name, value, path: "/", domain }, true);
        injected++;
      } catch {}
    }
  }
  await CookieManager.flush();
  return injected;
}

export default function CookieBrowserScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "dark" ? "dark" : "light"];
  const webRef = useRef<WebView>(null);

  const [accountName, setAccountName] = useState("Unknown");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const payload = consumeCookieBrowserPayload();
    if (!payload) {
      setError("No cookies provided");
      return;
    }
    setAccountName(payload.accountName);
    injectCookies(payload.cookies)
      .then(() => setReady(true))
      .catch((e) => setError(e?.message || "Failed to inject cookies"));
  }, []);

  const targetUrl = "https://rewards.bing.com/";

  const displayUrl = currentUrl
    ? currentUrl.replace(/^https?:\/\//, "").split("/")[0]
    : "";

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Text style={{ color: "#f87171", fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8 }}>
            Cookie injection failed
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            {error}
          </Text>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { marginTop: 20 }]}>
            <Text style={{ color: "#3b82f6", fontSize: 14, fontFamily: "Inter_500Medium" }}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.toolbarBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        <View style={[styles.urlBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>
            {loading ? "Loading…" : displayUrl}
          </Text>
          {loading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        <Pressable
          onPress={() => webRef.current?.reload()}
          hitSlop={12}
          style={styles.toolbarBtn}
        >
          <RefreshCw size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.accountBanner, { backgroundColor: "#3b82f615", borderBottomColor: colors.border }]}>
        <ExternalLink size={12} color="#3b82f6" />
        <Text style={{ color: "#3b82f6", fontSize: 11, fontFamily: "Inter_500Medium" }}>
          Browsing as: {accountName}
        </Text>
      </View>

      {!ready ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12, fontFamily: "Inter_400Regular" }}>
            Injecting cookies…
          </Text>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: targetUrl }}
          style={{ flex: 1 }}
          userAgent={MOBILE_UA}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(nav) => setCurrentUrl(nav.url)}
          onError={() => setLoading(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  toolbarBtn: { padding: 6 },
  urlBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  accountBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
