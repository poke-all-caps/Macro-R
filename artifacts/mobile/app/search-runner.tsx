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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BING_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([k]) => !k.startsWith("_ls_"))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// Flushes the WebView OS cookie jar and loads the given account's cookies into
// it so the Daily Set WebView is always authenticated as the correct account.
// Uses dynamic require so the native module is only loaded in real device builds
// (not in Expo Go where it would crash the whole file).
async function injectAccountCookies(cookies: Record<string, string>): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CookieManager = require("@react-native-cookies/cookies").default;
    await CookieManager.clearAll(true);
    const domains = [
      "https://www.bing.com",
      "https://rewards.bing.com",
      "https://login.live.com",
    ];
    for (const [name, value] of Object.entries(cookies)) {
      if (name.startsWith("_ls_") || !value) continue;
      for (const domain of domains) {
        try {
          await CookieManager.set(domain, { name, value, path: "/" }, true);
        } catch {}
      }
    }
  } catch {}
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

// Bing search via fetch — uses the OS cookie jar (set by injectAccountCookies)
// so httpOnly cookies like _U are included automatically by the platform.
// Falls back to manual Cookie header for extra safety.
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
      credentials: "include",
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

// Points via fetch — uses OS cookie jar for httpOnly cookie access
async function fetchRewardsPoints(
  cookies: Record<string, string>
): Promise<number> {
  const cookieStr = buildCookieHeader(cookies);
  try {
    const resp = await fetch(
      "https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest",
      {
        credentials: "include",
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

// ─── JS injected into rewards.bing.com to click the next uncompleted card ─────
//
// Accepts a list of already-clicked card IDs so it never repeats the same card.
// Uses dispatchEvent(MouseEvent) to fire Microsoft's own click handlers — the
// same path a real user tap takes. Does NOT navigate via href/location.href;
// the click event itself is what Microsoft registers for rewards credit.

function makeClickScript(alreadyClicked: string[]): string {
  return `
(function() {
  try {
    var alreadyClicked = ${JSON.stringify(alreadyClicked)};

    // Build a stable ID for a card element from its href + any data attribute
    function getCardId(el) {
      var href = (el.href || el.getAttribute('href') || '').toLowerCase().trim();
      var container = el.closest('[data-activity-id], [data-bi-id], [id]');
      var attrId = container
        ? (container.getAttribute('data-activity-id') ||
           container.getAttribute('data-bi-id') ||
           container.id || '')
        : '';
      return (attrId + '||' + href);
    }

    var completedSignals = [
      '[class*="complete"]', '[class*="completed"]',
      '[class*="done"]', '[aria-checked="true"]',
      '[class*="checked"]', '[class*="earned"]',
    ];

    function isCompleted(el) {
      for (var s of completedSignals) {
        if (el.closest(s)) return true;
      }
      // Also check inside the nearest card container
      var card = el.closest('[class*="card"], [data-activity-id], [class*="ds-"], [class*="punchcard"]');
      if (card) {
        for (var s of completedSignals) {
          if (card.querySelector(s)) return true;
        }
      }
      return false;
    }

    var selectors = [
      '[data-activity-id] a[href]',
      '[data-bi-id*="dailyset"] a[href]',
      '[data-bi-id*="DailySet"] a[href]',
      '.ds-card-sec a[href]',
      '[class*="ds-card"] a[href]',
      '[class*="daily-set"] a[href]',
      '[class*="dailyset"] a[href]',
      '.punchcard-row a[href]',
      '[class*="punchcard"] a[href]',
      '[class*="offer-card"] a[href]',
      '[class*="offercard"] a[href]',
      'a[href*="rewardschallenges"]',
      'a[href*="rewards.bing.com/go/"]',
    ];

    for (var sel of selectors) {
      var matches = Array.from(document.querySelectorAll(sel));
      for (var i = 0; i < matches.length; i++) {
        var el = matches[i];
        if (isCompleted(el)) continue;

        var cardId = getCardId(el);
        var href = (el.href || el.getAttribute('href') || '').toLowerCase().trim();

        // Skip if we already clicked this card in a previous iteration
        if (alreadyClicked.indexOf(cardId) !== -1) continue;
        if (href && alreadyClicked.indexOf(href) !== -1) continue;

        var text = (
          el.textContent ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') || ''
        ).trim().replace(/\\s+/g, ' ').slice(0, 60);

        // Fire a real MouseEvent so Microsoft's click handlers run
        // (same path as a real user tap — NOT window.location.href navigation)
        el.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        }));

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'card_clicked',
          found: true,
          text: text || 'Activity',
          href: href,
          cardId: cardId,
        }));
        return;
      }
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'card_clicked',
      found: false,
    }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'card_clicked',
      found: false,
      error: String(e),
    }));
  }
})(); true;
`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchRunnerScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { accountIds: rawIds, mode: rawMode } = useLocalSearchParams<{ accountIds: string; mode?: string }>();
  const { accounts, updateAccount, addLog, stopRun } = useAccounts();
  const { pickQueries } = useQueries();
  const { settings } = useSettings();

  // mode: "both" = searches + daily set  |  "dailyset" = daily set only
  const mode = (rawMode === "dailyset" ? "dailyset" : "both") as "both" | "dailyset";

  const accountIds: string[] = rawIds ? JSON.parse(rawIds) : [];
  const targetAccounts = useRef<Account[]>(
    accounts.filter((a) => accountIds.includes(a.id))
  ).current;

  const webViewRef = useRef<any>(null);
  const abortRef = useRef(false);

  // WebView event bridges — used to turn event-driven WebView into async/await
  const webViewLoadResolverRef = useRef<(() => void) | null>(null);
  const webViewMsgHandlerRef = useRef<((data: any) => void) | null>(null);

  const [webViewUrl, setWebViewUrl] = useState("https://www.bing.com");

  // Status display
  const [currentAccountIdx, setCurrentAccountIdx] = useState(0);
  const [currentAccountName, setCurrentAccountName] = useState(targetAccounts[0]?.name ?? "");
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0);
  const [totalSearches, setTotalSearches] = useState(settings.defaultSearchCount);
  const [statusLine, setStatusLine] = useState("Starting…");
  const [phase, setPhase] = useState<"searching" | "dailyset" | "done">(
    mode === "dailyset" ? "dailyset" : "searching"
  );
  const [dailySetResult, setDailySetResult] = useState<{ completed: number; total: number } | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startTime = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - startTime.current), 1000);
    return () => clearInterval(t);
  }, []);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  // Navigate the WebView to a new URL
  const navigateTo = useCallback((url: string) => {
    webViewRef.current?.injectJavaScript(
      `window.location.href = ${JSON.stringify(url)}; true;`
    );
  }, []);

  // ─── WebView event handlers ────────────────────────────────────────────────

  const handleWebViewLoadEnd = useCallback(() => {
    if (webViewLoadResolverRef.current) {
      webViewLoadResolverRef.current();
      webViewLoadResolverRef.current = null;
    }
  }, []);

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (webViewMsgHandlerRef.current) {
        webViewMsgHandlerRef.current(data);
      }
    } catch {}
  }, []);

  // Returns a promise that resolves when the next WebView load completes (or times out)
  const waitForLoad = useCallback((timeoutMs = 12000): Promise<void> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        webViewLoadResolverRef.current = null;
        resolve();
      }, timeoutMs);
      webViewLoadResolverRef.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }, []);

  // Returns a promise that resolves when the WebView posts a message of the given type (or times out)
  const waitForMessage = useCallback((type: string, timeoutMs = 8000): Promise<any> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        webViewMsgHandlerRef.current = null;
        resolve(null);
      }, timeoutMs);
      webViewMsgHandlerRef.current = (data: any) => {
        if (data.type === type) {
          clearTimeout(timer);
          webViewMsgHandlerRef.current = null;
          resolve(data);
        }
      };
    });
  }, []);

  // ─── WebView-based Daily Set ───────────────────────────────────────────────
  //
  // The WebView holds the real OS cookie store (httpOnly included), so the
  // rewards page is fully authenticated. We inject JS that .click()s each
  // daily-set card — the same user action that Microsoft's tracking listens for.
  // After each click the WebView may navigate away; we wait for it to settle,
  // then go back to rewards.bing.com and click the next card.

  const runDailySetViaWebView = useCallback(async (
    onStatus: (msg: string) => void
  ): Promise<{ completed: number; total: number; alreadyDone: boolean }> => {
    const MAX_CARDS = 10; // safety cap per account
    let completed = 0;

    // Tracks every card we clicked this session so we never repeat one.
    // Both the composite cardId and the bare href are stored so either key hits.
    const clickedIds: string[] = [];

    // ── 1. Load the Rewards dashboard once ──────────────────────────────────
    onStatus("Daily Set: loading Rewards page…");
    setWebViewUrl("https://rewards.bing.com/");
    await waitForLoad(15000);
    // Give the React-rendered SPA time to fully paint activity cards
    await sleep(4000);

    for (let attempt = 0; attempt < MAX_CARDS; attempt++) {
      if (abortRef.current) break;

      // ── 2. On subsequent iterations navigate back to Rewards ─────────────
      if (attempt > 0) {
        onStatus(`Daily Set: back to Rewards (${completed} done so far)…`);
        navigateTo("https://rewards.bing.com/");
        await waitForLoad(15000);
        await sleep(3500);
      }

      // ── 3. Inject script with the list of already-clicked IDs ────────────
      onStatus("Daily Set: scanning for next activity…");
      webViewRef.current?.injectJavaScript(makeClickScript(clickedIds));
      const msg = await waitForMessage("card_clicked", 10000);

      if (!msg?.found) {
        // No more unclicked cards — we're done
        if (completed === 0 && attempt === 0) {
          onStatus("Daily Set: no activities found — try re-logging in");
          await sleep(3000);
        } else {
          onStatus(`Daily Set: all activities done (${completed} completed)`);
          await sleep(2000);
        }
        break;
      }

      // ── 4. Record this card so we never click it again ───────────────────
      if (msg.cardId) clickedIds.push(msg.cardId);
      if (msg.href && clickedIds.indexOf(msg.href) === -1) {
        clickedIds.push(msg.href);
      }

      // ── 5. Wait for any navigation the click triggered to settle ─────────
      const label = msg.text || `Activity ${completed + 1}`;
      onStatus(`Daily Set: clicked "${label}" — waiting…`);
      setDailySetResult({ completed, total: completed + 1 });

      // Use a short waitForLoad — some clicks navigate, others are AJAX-only.
      // Either way we cap the wait so we don't block for the full timeout.
      await waitForLoad(5000);
      // Extra settle time for server-side registration before going back
      await sleep(2500);

      completed++;
      setDailySetResult({ completed, total: completed });
    }

    return { completed, total: completed, alreadyDone: false };
  }, [navigateTo, waitForLoad, waitForMessage]);

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
        setPhase(mode === "dailyset" ? "dailyset" : "searching");
        setDailySetResult(null);

        updateAccount(account.id, { status: "running", searchesCompleted: 0 });
        setStatusLine(`[${account.name}]  Preparing session…`);
        await injectAccountCookies(account.cookies ?? {});
        await sleep(500);

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

        // ── Bing searches (skipped in dailyset-only mode) ──────────────────
        let searchesDone = 0;
        let networkLost = false;

        if (mode !== "dailyset") {
          for (let si = 0; si < searchCount; si++) {
            if (cancelled || abortRef.current) break;

            const query = queries[si] ?? `microsoft rewards tip ${si + 1}`;
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBLH&cvid=${randomHex(32).toUpperCase()}`;

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
        }

        if (cancelled || abortRef.current) break;

        // ── Daily Set via WebView ──────────────────────────────────────────
        // WebView uses the full OS cookie store (httpOnly included) so
        // navigating it to rewards.bing.com gives a properly authenticated page.
        let dailySetDone = false;

        const shouldRunDailySet =
          !networkLost &&
          (mode === "dailyset"
            ? true
            : settings.dailySetEnabled && (account.dailySetEnabled ?? true));

        if (shouldRunDailySet) {
          setPhase("dailyset");

          const ds = await runDailySetViaWebView(setStatusLine);
          dailySetDone = ds.completed > 0 || ds.alreadyDone;
          setDailySetResult({ completed: ds.completed, total: ds.total });
          await sleep(1000);
        }

        // ── Points ─────────────────────────────────────────────────────────
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
          errorMessage: finalStatus === "failed" ? "Network unavailable" : undefined,
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
    Alert.alert("Stop Automation?", "This will interrupt the current run.", [
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
          WebView automation only works on a real Android or iOS device.
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
            {mode === "dailyset"
              ? `Daily Set Only · Account ${Math.min(currentAccountIdx + 1, targetAccounts.length)}/${targetAccounts.length}`
              : phase === "dailyset"
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

      {/* Daily Set phase pill */}
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
        <Text style={styles.statusText} numberOfLines={2}>{statusLine}</Text>
      </View>

      {/* WebView — navigated through Bing searches and Rewards activities */}
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
        onLoadEnd={handleWebViewLoadEnd}
        onMessage={handleWebViewMessage}
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
    paddingVertical: 8,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  statusText: { color: "#CBD5E1", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  webView: { flex: 1 },
});
