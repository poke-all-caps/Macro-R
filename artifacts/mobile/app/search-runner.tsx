import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { CheckCircle, Square, Wifi, WifiOff } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Account, useAccounts } from "@/context/AccountsContext";
import { useQueries } from "@/context/QueriesContext";
import { useSettings } from "@/context/SettingsContext";

// ─── Network helpers ──────────────────────────────────────────────────────────

const BING_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([k]) => !k.startsWith("_ls_"))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

// Real search request — sent with the account's explicit cookies, independent
// of the WebView's shared cookie store.
async function performBingSearch(
  query: string,
  cookies: Record<string, string>
): Promise<{ ok: boolean; status?: number }> {
  const cookieStr = buildCookieHeader(cookies);
  const cvid = randomHex(32).toUpperCase();
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBLH&cvid=${cvid}`;
  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: {
        Cookie: cookieStr,
        "User-Agent": BING_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.bing.com/",
        "Cache-Control": "no-cache",
      },
    });
    return { ok: resp.ok || resp.status === 302, status: resp.status };
  } catch (e: any) {
    if (e?.message?.includes("Network request failed")) throw new Error("NO_NETWORK");
    return { ok: false, status: 0 };
  }
}

async function fetchRewardsPoints(
  cookies: Record<string, string>
): Promise<number> {
  const cookieStr = buildCookieHeader(cookies);
  try {
    const resp = await fetch(
      "https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest",
      {
        credentials: "omit",
        headers: {
          Cookie: cookieStr,
          "User-Agent": BING_UA,
          Accept: "application/json, text/javascript, */*",
          Referer: "https://rewards.bing.com/",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );
    if (!resp.ok) return 0;
    const json = await resp.json();
    return (
      json?.dashboard?.userStatus?.availablePoints ??
      json?.userStatus?.availablePoints ??
      0
    );
  } catch {
    return 0;
  }
}

// ─── Daily Set helpers ────────────────────────────────────────────────────────

interface DailyActivity {
  id: string;
  title: string;
  type: string;
  destinationUrl: string;
  pointValue: number;
  complete: boolean;
}

async function fetchDailyActivities(
  cookies: Record<string, string>
): Promise<DailyActivity[]> {
  const cookieStr = buildCookieHeader(cookies);
  try {
    const resp = await fetch(
      "https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest",
      {
        credentials: "omit",
        headers: {
          Cookie: cookieStr,
          "User-Agent": BING_UA,
          Accept: "application/json, text/javascript, */*",
          Referer: "https://rewards.bing.com/",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );
    if (!resp.ok) return [];
    const json = await resp.json();

    const activities: DailyActivity[] = [];

    // Daily set promotions are keyed by date string inside dashboard
    const rawPromotions: any[] = [];

    // Collect from top-level promotions array
    if (Array.isArray(json?.dashboard?.promotions)) {
      rawPromotions.push(...json.dashboard.promotions);
    }

    // Also collect from dailySetPromotions (some API versions use this key)
    const dsp = json?.dashboard?.dailySetPromotions;
    if (dsp && typeof dsp === "object") {
      for (const dateKey of Object.keys(dsp)) {
        const arr = dsp[dateKey];
        if (Array.isArray(arr)) rawPromotions.push(...arr);
      }
    }

    // Collect punch cards / streak bonuses
    if (Array.isArray(json?.dashboard?.punchCards)) {
      for (const pc of json.dashboard.punchCards) {
        if (Array.isArray(pc?.childPromotion)) {
          rawPromotions.push(...pc.childPromotion);
        }
      }
    }

    for (const promo of rawPromotions) {
      const dest =
        promo?.attributes?.destination ??
        promo?.destinationUrl ??
        promo?.linkUrl;
      if (!dest) continue;

      activities.push({
        id: promo.id ?? promo.offerId ?? String(Math.random()),
        title: promo.attributes?.title ?? promo.title ?? "Activity",
        type: promo.promotionType ?? promo.type ?? "urlreward",
        destinationUrl: dest,
        pointValue: promo.pointValue ?? promo.points ?? 0,
        complete: promo.complete ?? promo.isComplete ?? false,
      });
    }

    return activities;
  } catch {
    return [];
  }
}

async function completeActivity(
  activity: DailyActivity,
  cookies: Record<string, string>
): Promise<boolean> {
  if (activity.complete) return true;
  const cookieStr = buildCookieHeader(cookies);

  try {
    // For urlreward and simple click-type activities, a GET to the destination
    // URL with the account cookies is enough to credit the points.
    // Quiz/poll types are more complex and will at minimum open the activity
    // page — partial credit may still apply on some quiz types.
    const resp = await fetch(activity.destinationUrl, {
      method: "GET",
      credentials: "omit",
      headers: {
        Cookie: cookieStr,
        "User-Agent": BING_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://rewards.bing.com/",
        "Cache-Control": "no-cache",
      },
    });
    return resp.ok || resp.status === 302 || resp.status === 301;
  } catch {
    return false;
  }
}

async function performDailySet(
  cookies: Record<string, string>,
  onStatus: (msg: string) => void
): Promise<{ completed: number; total: number; alreadyDone: boolean }> {
  onStatus("Daily Set: fetching activities…");

  const activities = await fetchDailyActivities(cookies);
  const pending = activities.filter((a) => !a.complete);

  if (activities.length === 0) {
    onStatus("Daily Set: no activities found (session may need re-login)");
    await sleep(3000);
    return { completed: 0, total: 0, alreadyDone: false };
  }

  if (pending.length === 0) {
    onStatus("Daily Set: already completed ✓");
    await sleep(2000);
    return { completed: activities.length, total: activities.length, alreadyDone: true };
  }

  onStatus(`Daily Set: found ${pending.length} activities`);
  await sleep(1000);

  let completed = 0;
  for (let i = 0; i < pending.length; i++) {
    const activity = pending[i];
    const label = activity.title || activity.type;
    onStatus(`Daily Set [${i + 1}/${pending.length}]: ${label}…`);

    const ok = await completeActivity(activity, cookies);
    if (ok) completed++;

    await sleep(1500 + Math.random() * 1000);
  }

  onStatus(`Daily Set: ${completed}/${pending.length} activities completed`);
  await sleep(2000);

  return { completed, total: pending.length, alreadyDone: false };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchRunnerScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { accountIds: rawIds } = useLocalSearchParams<{ accountIds: string }>();
  const { accounts, updateAccount, addLog, stopRun } = useAccounts();
  const { pickQueries } = useQueries();
  const { settings } = useSettings();

  const accountIds: string[] = rawIds ? JSON.parse(rawIds) : [];
  const targetAccounts = useRef<Account[]>(
    accounts.filter((a) => accountIds.includes(a.id))
  ).current;

  const webViewRef = useRef<any>(null);
  const abortRef = useRef(false);

  const [webViewUrl, setWebViewUrl] = useState("https://www.bing.com");

  // Status display
  const [currentAccountIdx, setCurrentAccountIdx] = useState(0);
  const [currentAccountName, setCurrentAccountName] = useState(
    targetAccounts[0]?.name ?? ""
  );
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0);
  const [totalSearches, setTotalSearches] = useState(settings.defaultSearchCount);
  const [statusLine, setStatusLine] = useState("Starting…");
  const [phase, setPhase] = useState<"searching" | "dailyset" | "done">("searching");
  const [dailySetResult, setDailySetResult] = useState<{ completed: number; total: number } | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startTime = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(
      () => setElapsedMs(Date.now() - startTime.current),
      1000
    );
    return () => clearInterval(t);
  }, []);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const navigateTo = useCallback((url: string) => {
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(url)}; true;`
    );
  }, []);

  // ─── Main automation loop ─────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;

    const run = async () => {
      for (let ai = 0; ai < targetAccounts.length; ai++) {
        if (cancelled || abortRef.current) break;

        const account = targetAccounts[ai];
        const hasCookies = Object.keys(account.cookies ?? {}).length > 0;
        const searchCount = settings.defaultSearchCount;
        const queries = pickQueries(searchCount);
        const delay = (settings.searchDelay ?? 5) * 1000;

        setCurrentAccountIdx(ai);
        setCurrentAccountName(account.name);
        setTotalSearches(searchCount);
        setCurrentSearchIdx(0);
        setPhase("searching");
        setDailySetResult(null);

        updateAccount(account.id, { status: "running", searchesCompleted: 0 });

        if (!hasCookies) {
          setStatusLine(`${account.name}: no session — skipping`);
          addLog({
            accountId: account.id,
            accountName: account.name,
            timestamp: new Date().toISOString(),
            status: "failed",
            searchesDone: 0,
            dailySetDone: false,
            pointsEarned: 0,
            errorMessage: "No session cookies",
          });
          updateAccount(account.id, { status: "failed" });
          await sleep(1500);
          continue;
        }

        // ── Bing searches ────────────────────────────────────────────────────
        let searchesDone = 0;
        let networkLost = false;

        for (let si = 0; si < searchCount; si++) {
          if (cancelled || abortRef.current) break;

          const query = queries[si] ?? `microsoft rewards tip ${si + 1}`;
          const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(
            query
          )}&form=QBLH&cvid=${randomHex(32).toUpperCase()}`;

          setCurrentSearchIdx(si + 1);
          setStatusLine(`[${account.name}]  "${query}"`);

          if (si === 0) {
            setWebViewUrl(searchUrl);
          } else {
            navigateTo(searchUrl);
          }

          try {
            const result = await performBingSearch(query, account.cookies);
            if (result.ok) {
              searchesDone++;
              setNetworkError(false);
            }
          } catch (e: any) {
            if (e?.message === "NO_NETWORK") {
              setNetworkError(true);
              networkLost = true;
              setStatusLine("No internet connection");
              break;
            }
          }

          updateAccount(account.id, { searchesCompleted: searchesDone });

          if (si < searchCount - 1) {
            const jitter = Math.floor((Math.random() - 0.5) * 2000);
            await sleep(Math.max(2500, delay + jitter));
          }
        }

        if (cancelled || abortRef.current) break;

        // ── Daily Set ────────────────────────────────────────────────────────
        let dailySetDone = false;
        // account.dailySetEnabled may be undefined for accounts created before
        // this field was added — treat undefined as true (opt-in by default).
        const shouldRunDailySet =
          !networkLost &&
          settings.dailySetEnabled &&
          (account.dailySetEnabled ?? true);

        if (shouldRunDailySet) {
          setPhase("dailyset");
          // Navigate WebView to Rewards for visual context
          navigateTo("https://rewards.bing.com/");

          const ds = await performDailySet(account.cookies, setStatusLine);
          dailySetDone = ds.alreadyDone || ds.completed > 0;
          setDailySetResult({ completed: ds.completed, total: ds.total });

          if (!ds.alreadyDone) {
            setStatusLine(
              `[${account.name}]  Daily Set: ${ds.completed}/${ds.total} completed`
            );
          }
          await sleep(1000);
        }

        // ── Points ───────────────────────────────────────────────────────────
        setStatusLine(`[${account.name}]  Fetching points…`);
        const points = await fetchRewardsPoints(account.cookies ?? {});
        const prevPoints = account.todayPoints ?? 0;
        const pointsEarned = points > prevPoints ? points - prevPoints : 0;

        const finalStatus = networkLost && searchesDone === 0 ? "failed" : "success";

        updateAccount(account.id, {
          status: finalStatus === "success" ? "done" : "failed",
          lastRun: new Date().toISOString(),
          searchesCompleted: searchesDone,
          todayPoints: points > 0 ? points : prevPoints,
          totalPoints: (account.totalPoints ?? 0) + pointsEarned,
        });

        addLog({
          accountId: account.id,
          accountName: account.name,
          timestamp: new Date().toISOString(),
          status: finalStatus,
          searchesDone,
          dailySetDone,
          pointsEarned,
          errorMessage:
            finalStatus === "failed" ? "Network unavailable" : undefined,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (ai < targetAccounts.length - 1 && !abortRef.current) {
          setStatusLine("Pausing before next account…");
          setPhase("searching");
          await sleep(3000);
        }
      }

      if (!cancelled) {
        setIsFinished(true);
        setPhase("done");
        setStatusLine("All accounts completed!");
        stopRun();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  // Android back button
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!isFinished) { handleStop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [isFinished]);

  const handleStop = () => {
    Alert.alert("Stop Automation?", "Searches will be interrupted.", [
      { text: "Keep Running", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: () => {
          abortRef.current = true;
          stopRun();
          targetAccounts.forEach((a) => updateAccount(a.id, { status: "idle" }));
          router.back();
        },
      },
    ]);
  };

  // ─── Web fallback ─────────────────────────────────────────────────────────

  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center", gap: 16 }]}>
        <Text style={{ color: colors.text, fontSize: 16, textAlign: "center", paddingHorizontal: 32 }}>
          WebView searches only work on a real Android or iOS device.
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.tint, fontSize: 15 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const WebViewComponent = require("react-native-webview").default;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10, backgroundColor: "#0F172A" }]}>
        <View style={styles.topLeft}>
          <Text style={styles.topAccountName} numberOfLines={1}>
            {currentAccountName || "Starting…"}
          </Text>
          <Text style={styles.topSub}>
            {phase === "dailyset"
              ? `Account ${Math.min(currentAccountIdx + 1, targetAccounts.length)}/${targetAccounts.length} · Daily Set`
              : `Account ${Math.min(currentAccountIdx + 1, targetAccounts.length)}/${targetAccounts.length} · Search ${currentSearchIdx}/${totalSearches}`}
          </Text>
        </View>

        <View style={styles.topRight}>
          {networkError ? (
            <View style={styles.netBadge}>
              <WifiOff size={12} color="#F87171" />
              <Text style={styles.netText}>Offline</Text>
            </View>
          ) : (
            <View style={styles.timerPill}>
              <Wifi size={11} color="#4ADE80" />
              <Text style={styles.timerText}>{formatElapsed(elapsedMs)}</Text>
            </View>
          )}

          {!isFinished && (
            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [styles.stopBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Square size={15} color="#fff" fill="#fff" />
            </Pressable>
          )}
          {isFinished && (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Phase pill — shows when in daily set phase */}
      {phase === "dailyset" && (
        <View style={styles.phasePill}>
          <CheckCircle size={13} color="#A78BFA" />
          <Text style={styles.phaseText}>
            {dailySetResult
              ? `Daily Set  ${dailySetResult.completed}/${dailySetResult.total} done`
              : "Running Daily Set…"}
          </Text>
        </View>
      )}

      {/* Status line */}
      <View style={[
        styles.statusBar,
        {
          backgroundColor:
            isFinished ? "#14532D"
            : phase === "dailyset" ? "#2E1065"
            : "#1E293B",
        },
      ]}>
        <View style={[
          styles.statusDot,
          {
            backgroundColor:
              isFinished ? "#4ADE80"
              : networkError ? "#F87171"
              : phase === "dailyset" ? "#A78BFA"
              : "#60A5FA",
          },
        ]} />
        <Text style={styles.statusText} numberOfLines={1}>{statusLine}</Text>
      </View>

      {/* Live Bing / Rewards WebView */}
      <WebViewComponent
        ref={webViewRef}
        source={{ uri: webViewUrl }}
        userAgent={BING_UA}
        style={styles.webView}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures={false}
        startInLoadingState
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  topLeft: { flex: 1, gap: 3 },
  topAccountName: { color: "#F1F5F9", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  topSub: { color: "#64748B", fontSize: 12, fontFamily: "Inter_400Regular" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  timerPill: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timerText: { color: "#94A3B8", fontSize: 12, fontFamily: "Inter_500Medium" },
  netBadge: {
    backgroundColor: "#450A0A",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  netText: { color: "#F87171", fontSize: 12, fontFamily: "Inter_500Medium" },
  stopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: {
    backgroundColor: "#166534",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  doneBtnText: { color: "#4ADE80", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  phasePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E1040",
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: "center",
    borderRadius: 20,
    marginTop: 6,
  },
  phaseText: { color: "#C4B5FD", fontSize: 12, fontFamily: "Inter_500Medium" },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  statusText: { color: "#CBD5E1", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  webView: { flex: 1 },
});
