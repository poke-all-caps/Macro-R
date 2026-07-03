import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { CheckCircle, Search, Square, Wifi, WifiOff } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCustomAlert } from "@/components/CustomAlert";
import Colors from "@/constants/colors";
import { Account, useAccounts } from "@/context/AccountsContext";
import { useLicense, API_BASE } from "@/context/LicenseContext";
import { useQueries } from "@/context/QueriesContext";
import { useSettings } from "@/context/SettingsContext";
import {
  showRunningNotification,
  dismissRunningNotification,
  showCompletedNotification,
} from "@/utils/notifications";
import {
  sleep,
  randomHex,
  buildCookieHeader,
  performBingSearch,
  fetchRewardsPoints,
  BING_UA,
} from "@/utils/bingSearch";

let BackgroundService: any = null;
if (Platform.OS === "android") {
  try {
    BackgroundService = require("react-native-background-actions").default;
  } catch {}
}

const ACTIVE_RUN_KEY = "@ms_rewards_active_run";

// Flushes the WebView OS cookie jar and loads the given account's cookies into
// it so the Daily Set WebView is always authenticated as the correct account.
// Uses dynamic require so the native module is only loaded in real device builds
// (not in Expo Go where it would crash the whole file).
async function injectAccountCookies(
  cookies: Record<string, string>
): Promise<{ ok: boolean; injected: number; verified: number; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-cookies/cookies");
    const CookieManager = mod.default || mod;
    await CookieManager.clearAll(true);

    const targets = [
      { url: "https://www.bing.com", domain: ".bing.com" },
      { url: "https://rewards.bing.com", domain: ".bing.com" },
      { url: "https://login.live.com", domain: ".live.com" },
      { url: "https://login.microsoftonline.com", domain: ".microsoftonline.com" },
      { url: "https://account.microsoft.com", domain: ".microsoft.com" },
    ];

    let injected = 0;
    for (const [name, value] of Object.entries(cookies)) {
      if (name.startsWith("_ls_") || !value) continue;
      for (const { url, domain } of targets) {
        try {
          await CookieManager.set(url, { name, value, path: "/", domain }, true);
          injected++;
        } catch {}
      }
    }

    await CookieManager.flush();

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const bingCookies = await CookieManager.get("https://www.bing.com", true);
        const count = bingCookies ? Object.keys(bingCookies).length : 0;
        if (count > 0) return { ok: true, injected, verified: count };
      } catch {}
      await new Promise<void>((r) => setTimeout(r, 200));
    }
    return { ok: false, injected, verified: 0, error: "Cookie verification timed out" };
  } catch (e: any) {
    return { ok: false, injected: 0, verified: 0, error: e?.message ?? "CookieManager unavailable" };
  }
}

// Polls the DOM for up to maxMs for the Daily Set cards to actually render.
// This is what makes the "page load" timing settings meaningful — the WebView's
// onLoadEnd event fires as soon as the raw HTML/JS document loads, which for a
// modern SPA like rewards.microsoft.com happens in a few seconds, long before
// the client-side app has hydrated and rendered the activity cards. Without
// this poll, the click script would run immediately after onLoadEnd and find
// nothing, always reporting "could not find any activities" regardless of the
// configured timeout.
function makeWaitForCardsScript(maxMs: number): string {
  return `
(function() {
  try {
    var start = Date.now();
    var maxMs = ${Math.max(1000, maxMs)};

    // Tier 1: new Tailwind div-based cards (2025 redesign) — no href required.
    // Cards are <div> elements identified by their design-token class combination.
    var tier1Selector = '[class*="bgCardOnPrimaryDefaultRest"][class*="cursor-pointer"]';

    // Tier 2: legacy Angular/class-attribute selectors — still require a[href].
    var tier2Selector =
      'a.cursor-pointer[class*="bgCardOnPrimaryDefault"],' +
      'a[class*="bgCardOnPrimaryDefault"],' +
      'mee-rewards-daily-set-item a[href],' +
      '[class*="dailySet"] a[href],' +
      '[class*="daily-set"] a[href],' +
      '[class*="DailySet"] a[href],' +
      '[data-bi-an*="DailySet"] a[href],' +
      '[data-bi-an*="dailyset"] a[href],' +
      '[data-m*="DailySet"] a[href],' +
      'section[class*="daily-set"] a[href],' +
      'div[class*="daily-set"] a[href],' +
      '[data-bi-id*="dailyset"] a[href],' +
      '[data-bi-id*="DailySet"] a[href],' +
      '.ds-card-sec a[href],' +
      '[class*="ds-card"] a[href]';

    function hasCards() {
      try {
        return (
          document.querySelectorAll(tier1Selector).length > 0 ||
          document.querySelectorAll(tier2Selector).length > 0
        );
      } catch (e) { return false; }
    }
    function tick() {
      if (hasCards()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cards_ready', found: true, waitedMs: Date.now() - start }));
        return;
      }
      if (Date.now() - start >= maxMs) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cards_ready', found: false, waitedMs: Date.now() - start }));
        return;
      }
      setTimeout(tick, 400);
    }
    tick();
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cards_ready', found: false, error: String(e) }));
  }
})(); true;
`;
}

function makeClickScript(alreadyClicked: string[]): string {
  return `
(function() {
  try {
    var alreadyClicked = ${JSON.stringify(alreadyClicked)};

    // Build a stable ID from the card's data attributes, href, or inner text so
    // we can deduplicate across page reloads without relying on DOM positions.
    // For new div-based cards that have no href, we fall back to data-activity-id
    // then to a normalised slice of the element's inner text.
    function getCardId(el) {
      var href = (el.href || el.getAttribute('href') || '').toLowerCase().trim();
      var activityId = el.getAttribute('data-activity-id') || '';
      var container = el.closest('[data-activity-id], [data-bi-id], [data-m], [id]');
      var attrId = activityId || (container
        ? (container.getAttribute('data-activity-id') ||
           container.getAttribute('data-bi-id') ||
           container.getAttribute('data-m') ||
           container.id || '')
        : '');
      // If neither an href nor a data attribute is available, fall back to the
      // first 80 chars of normalised inner text as a best-effort stable key.
      var textKey = (!href && !attrId)
        ? (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80).toLowerCase()
        : '';
      return (attrId + '||' + href + '||' + textKey);
    }

    // Signals that a card has already been completed — check the element itself
    // and its closest card container.
    var completedSignals = [
      '[class*="complete"]', '[class*="completed"]',
      '[class*="done"]', '[aria-checked="true"]',
      '[class*="checked"]', '[class*="earned"]',
      '[class*="finish"]', '[class*="finished"]',
      '[class*="lockup-disabled"]', '[class*="c-card-disabled"]',
      '[aria-disabled="true"]',
    ];

    function isCompleted(el) {
      for (var s of completedSignals) {
        if (el.matches && el.matches(s)) return true;
        if (el.closest(s)) return true;
      }
      var card = el.closest(
        '[class*="card"], [data-activity-id], [class*="ds-"], [class*="punchcard"],' +
        '[class*="c-card"], [class*="offer"], [class*="lockup"], li[class]'
      );
      if (card) {
        for (var s of completedSignals) {
          if (card.querySelector(s)) return true;
        }
        if (card.querySelector('svg[class*="check"], svg[class*="complete"], [class*="check-icon"]')) return true;
      }
      return false;
    }

    // Only follow links that are genuine Daily Set activity links.
    // Deliberately narrow: rewards /go/ redirects and bing quiz/search URLs.
    // Does NOT include generic microsoft.com/rewards or bing.com/rewards home
    // pages — those are the dashboard itself, not activities.
    function isDailySetActivityHref(href) {
      if (!href) return false;
      var h = href.toLowerCase();
      return (
        h.indexOf('rewards.microsoft.com/go/') !== -1 ||
        h.indexOf('rewards.bing.com/go/') !== -1 ||
        h.indexOf('bing.com/search?') !== -1 ||
        h.indexOf('bing.com/quiz') !== -1 ||
        h.indexOf('bing.com/know') !== -1 ||
        h.indexOf('rewardschallenges') !== -1
      );
    }

    // ── Tier 1: new Tailwind div-based cards (2025 redesign) ────────────────
    // Cards are now <div> elements with JavaScript onClick — no <a href> exists.
    // We match them by their two invariant design-token classes and dispatch the
    // click directly to the <div> container itself.
    var tailwindCardCandidates = Array.from(
      document.querySelectorAll(
        '[class*="bgCardOnPrimaryDefaultRest"][class*="cursor-pointer"]'
      )
    );

    // Keywords that identify Goal / Redeem cards — must never be clicked.
    var goalTextExclusions = [
      'redeem', 'league of legends', 'roblox', 'gift card', 'set goal', 'your goal'
    ];

    for (var ti = 0; ti < tailwindCardCandidates.length; ti++) {
      var tEl = tailwindCardCandidates[ti];

      // ── Link check ──────────────────────────────────────────────────────────
      // If the card contains an <a> with an href, that href must pass the
      // Daily Set activity whitelist. A /redeem or unrecognised href means this
      // is a Goal/Redeem card — skip it.
      var childAnchor = tEl.querySelector('a[href]');
      if (childAnchor) {
        var childHref = (childAnchor.href || childAnchor.getAttribute('href') || '').toLowerCase().trim();
        if (childHref && !isDailySetActivityHref(childHref)) continue;
      }

      // ── Text exclusion check ─────────────────────────────────────────────
      // Goal cards contain recognisable reward/product names. Skip any card
      // whose text content matches one of the known exclusion strings.
      var cardText = (tEl.textContent || '').toLowerCase();
      var isGoalCard = false;
      for (var gi = 0; gi < goalTextExclusions.length; gi++) {
        if (cardText.indexOf(goalTextExclusions[gi]) !== -1) { isGoalCard = true; break; }
      }
      if (isGoalCard) continue;

      if (isCompleted(tEl)) continue;

      var tCardId = getCardId(tEl);
      if (alreadyClicked.indexOf(tCardId) !== -1) continue;

      var tText = (
        tEl.textContent ||
        tEl.getAttribute('aria-label') ||
        tEl.getAttribute('title') || ''
      ).trim().replace(/\\s+/g, ' ').slice(0, 60);

      tEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'card_clicked', found: true,
        text: tText || 'Activity', href: '', cardId: tCardId,
      }));
      return;
    }

    // ── Tier 2: older Angular/class-attribute selectors (pre-2024 layout) ──────
    var selectors = [
      'mee-rewards-daily-set-item a[href]',
      '[class*="dailySet"] a[href]',
      '[class*="daily-set"] a[href]',
      '[class*="DailySet"] a[href]',
      '[data-bi-an*="DailySet"] a[href]',
      '[data-bi-an*="dailyset"] a[href]',
      '[data-m*="DailySet"] a[href]',
      'section[class*="daily-set"] a[href]',
      'div[class*="daily-set"] a[href]',
      '[data-bi-id*="dailyset"] a[href]',
      '[data-bi-id*="DailySet"] a[href]',
      '.ds-card-sec a[href]',
      '[class*="ds-card"] a[href]',
    ];

    for (var sel of selectors) {
      var matches = Array.from(document.querySelectorAll(sel));
      for (var i = 0; i < matches.length; i++) {
        var el = matches[i];
        var href = (el.href || el.getAttribute('href') || '').toLowerCase().trim();

        // Skip links that don't look like actual activity destinations.
        // This is the key guard — it prevents clicking nav links, banners,
        // and other non-activity anchors that live inside the same containers.
        if (!isDailySetActivityHref(href)) continue;
        if (isCompleted(el)) continue;

        var cardId = getCardId(el);
        if (alreadyClicked.indexOf(cardId) !== -1) continue;
        if (href && alreadyClicked.indexOf(href) !== -1) continue;

        var text = (
          el.textContent ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') || ''
        ).trim().replace(/\\s+/g, ' ').slice(0, 60);

        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'card_clicked', found: true,
          text: text || 'Activity', href: href, cardId: cardId,
        }));
        return;
      }
    }

    // ── No card found — report done ────────────────────────────────────────
    // The old fallback that searched arbitrary headings for "daily set" text
    // and walked up the DOM has been intentionally removed. It was too broad
    // and clicked promotions, streaks, and other non-Daily-Set activities.
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'card_clicked', found: false }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'card_clicked', found: false, error: String(e) }));
  }
})(); true;
`;
}

export default function SearchRunnerScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { accountIds: rawIds, mode: rawMode } = useLocalSearchParams<{ accountIds: string; mode?: string }>();
  const { accounts, updateAccount, addLog, stopRun } = useAccounts();
  const { pickQueries } = useQueries();
  const { settings } = useSettings();
  const { featureConfig } = useLicense();
  const { showAlert, AlertComponent } = useCustomAlert();

  const mode = (rawMode === "dailyset" ? "dailyset" : rawMode === "searchonly" ? "searchonly" : "both") as "both" | "dailyset" | "searchonly";

  let accountIds: string[] = [];
  try { accountIds = rawIds ? JSON.parse(rawIds) : []; } catch { accountIds = []; }
  const accountIdsRef = useRef(accountIds);

  // H4: keep a live ref to accounts so the run() loop always sees the latest cookie/state
  const accountsRef = useRef(accounts);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  const webViewRef = useRef<any>(null);
  const abortRef = useRef(false);

  // WebView event bridges — used to turn event-driven WebView into async/await
  const webViewLoadResolverRef = useRef<(() => void) | null>(null);
  const webViewMsgHandlerRef = useRef<((data: any) => void) | null>(null);

  // H1: event buffers so load/message events fired before a waiter is installed are not lost
  const loadEventBufferedRef = useRef(false);
  const msgEventQueueRef = useRef<any[]>([]);

  const [webViewUrl, setWebViewUrl] = useState("about:blank");

  // Derive the initial name from the live accounts list (first matching account)
  const firstAccount = accounts.find((a) => accountIdsRef.current.includes(a.id));

  // Status display
  const [currentAccountIdx, setCurrentAccountIdx] = useState(0);
  const [currentAccountName, setCurrentAccountName] = useState(firstAccount?.name ?? "");
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

  // H1: If a load resolver is waiting, call it immediately. Otherwise buffer the
  // event so the next waitForLoad() call can drain it without missing the load.
  const handleWebViewLoadEnd = useCallback(() => {
    if (webViewLoadResolverRef.current) {
      webViewLoadResolverRef.current();
      webViewLoadResolverRef.current = null;
    } else {
      loadEventBufferedRef.current = true;
    }
  }, []);

  // H1: If a message handler is waiting, call it immediately. Otherwise push
  // the parsed data into the queue so the next waitForMessage() can drain it.
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (webViewMsgHandlerRef.current) {
        webViewMsgHandlerRef.current(data);
      } else {
        msgEventQueueRef.current.push(data);
      }
    } catch {}
  }, []);

  const waitForLoad = useCallback((timeoutMs = 12000): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (loadEventBufferedRef.current) {
        loadEventBufferedRef.current = false;
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        webViewLoadResolverRef.current = null;
        reject(new Error("WebView load timeout"));
      }, timeoutMs);
      webViewLoadResolverRef.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }, []);

  // Returns a promise that resolves when the WebView posts a message of the given type (or times out).
  // H1: drains the message queue first — picks up any messages that arrived before this call.
  const waitForMessage = useCallback((type: string, timeoutMs = 8000): Promise<any> => {
    return new Promise((resolve) => {
      const queued = msgEventQueueRef.current.findIndex((d) => d.type === type);
      if (queued !== -1) {
        const [data] = msgEventQueueRef.current.splice(queued, 1);
        resolve(data);
        return;
      }
      const timer = setTimeout(() => {
        webViewMsgHandlerRef.current = null;
        resolve(null);
      }, timeoutMs);
      webViewMsgHandlerRef.current = (data: any) => {
        if (data.type === type) {
          clearTimeout(timer);
          webViewMsgHandlerRef.current = null;
          resolve(data);
        } else {
          // queue messages of other types so they are not lost
          msgEventQueueRef.current.push(data);
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
    const MAX_CARDS = 3; // Daily Set always has exactly 3 cards
    let completed = 0;

    // Tracks every card we clicked this session so we never repeat one.
    // Both the composite cardId and the bare href are stored so either key hits.
    const clickedIds: string[] = [];

    const t1 = (settings.dsTimeoutInitialLoad ?? 30) * 1000;
    const t2 = (settings.dsTimeoutReturnLoad ?? 25) * 1000;
    const t3 = (settings.dsTimeoutCardScan ?? 20) * 1000;
    const t4 = (settings.dsTimeoutPostClick ?? 15) * 1000;

    // ── 1. Load the Rewards dashboard once ──────────────────────────────────
    // Use rewards.microsoft.com — this is the current URL after the 2024 redesign.
    // rewards.bing.com still works but may redirect, adding latency.
    const REWARDS_URL = "https://rewards.microsoft.com/";
    onStatus("Daily Set: loading Rewards page…");
    setWebViewUrl(REWARDS_URL);
    let loadStart = Date.now();
    try { await waitForLoad(t1); } catch {}
    let remaining = Math.max(1500, t1 - (Date.now() - loadStart));
    onStatus("Daily Set: waiting for activities to render…");
    webViewRef.current?.injectJavaScript(makeWaitForCardsScript(remaining));
    let readyMsg = await waitForMessage("cards_ready", remaining + 1500);
    if (!readyMsg?.found) {
      // Cards never rendered within the configured timeout — fall back to a
      // short settle sleep so the click script still gets a chance to run
      // rather than scanning an empty page immediately.
      await sleep(1000);
    }

    for (let attempt = 0; attempt < MAX_CARDS; attempt++) {
      if (abortRef.current) break;

      if (attempt > 0) {
        onStatus(`Daily Set: back to Rewards (${completed} done so far)…`);
        navigateTo(REWARDS_URL);
        loadStart = Date.now();
        try { await waitForLoad(t2); } catch {}
        remaining = Math.max(1500, t2 - (Date.now() - loadStart));
        onStatus("Daily Set: waiting for activities to render…");
        webViewRef.current?.injectJavaScript(makeWaitForCardsScript(remaining));
        readyMsg = await waitForMessage("cards_ready", remaining + 1500);
        if (!readyMsg?.found) {
          await sleep(1000);
        }
      }

      onStatus("Daily Set: scanning for next activity…");
      webViewRef.current?.injectJavaScript(makeClickScript(clickedIds));
      const msg = await waitForMessage("card_clicked", t3);

      if (!msg?.found) {
        if (completed === 0 && attempt === 0) {
          onStatus("Daily Set: no activities found — try re-logging in");
          await sleep(1500);
        } else {
          onStatus(`Daily Set: all activities done (${completed} completed)`);
          await sleep(1000);
        }
        break;
      }

      if (msg.cardId) clickedIds.push(msg.cardId);
      if (msg.href && clickedIds.indexOf(msg.href) === -1) {
        clickedIds.push(msg.href);
      }

      const label = msg.text || `Activity ${completed + 1}`;
      onStatus(`Daily Set: clicked "${label}" — waiting…`);
      setDailySetResult({ completed, total: completed + 1 });

      try { await waitForLoad(t4); } catch {}
      await sleep(2000);

      completed++;
      setDailySetResult({ completed, total: completed });
    }

    const alreadyDone = completed === 0;
    return { completed, total: completed, alreadyDone };
  }, [navigateTo, waitForLoad, waitForMessage,
    settings.dsTimeoutInitialLoad, settings.dsTimeoutReturnLoad,
    settings.dsTimeoutCardScan, settings.dsTimeoutPostClick]);

  // ─── Main automation loop ─────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;

    const run = async () => {
      // H4: compute target accounts from the live ref so we always have the
      // freshest cookies — not the stale mount-time snapshot.
      // Declared here (before try) so the catch block can reference it too.
      let targetAccounts = accountsRef.current.filter((a) =>
        accountIdsRef.current.includes(a.id)
      );
      let runningNotifId: string | null = null;

      // ── System 3: server-side delay validation (pre-flight) ──────────────
      // Verify that the delay the client intends to use is at or above the
      // server-enforced minimum before ANY automation starts. A tampered APK
      // cannot bypass this — the server rejects requests with too-short delays.
      // On network error we fail-open (proceed) so offline runs still work.
      try {
        const storedKey = await AsyncStorage.getItem("@ms_rewards_license_key");
        const storedDeviceId = await AsyncStorage.getItem("@ms_rewards_device_id");
        if (storedKey) {
          const requestedDelay = settings.searchDelay ?? 5;
          const taskResp = await fetch(`${API_BASE}/run-task`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: storedKey, deviceId: storedDeviceId, requestedDelay }),
          });
          if (taskResp.status === 400) {
            const body = await taskResp.json();
            cancelled = true;
            abortRef.current = true;
            showAlert(
              "Delay Too Short",
              body.error || `Your minimum allowed delay is ${body.minDelay} seconds.`,
              [{ text: "OK" }]
            );
            stopRun();
            return;
          }
        }
      } catch {
        // Network error — proceed with local settings (fail-open)
      }
      // ────────────────────────────────────────────────────────────────────

      try {
      if (!BackgroundService?.isRunning()) {
        runningNotifId = await showRunningNotification();
      }

      for (let ai = 0; ai < targetAccounts.length; ai++) {
        if (cancelled || abortRef.current) break;

        // Re-fetch from the live ref each iteration so cookie updates from
        // a previous account's run are visible when we reach the next one.
        const account =
          accountsRef.current.find((a) => a.id === targetAccounts[ai].id) ??
          targetAccounts[ai];
        const hasCookies = Object.keys(account.cookies ?? {}).length > 0;
        const maxSearches = featureConfig?.maxSearches ?? 50;
        const minDelay = featureConfig?.minDelaySeconds ?? 3;
        const searchCount = Math.min(settings.defaultSearchCount, maxSearches);
        const queries = pickQueries(searchCount);
        const delay = Math.max(settings.searchDelay ?? 5, minDelay) * 1000;

        setCurrentAccountIdx(ai);
        setCurrentAccountName(account.name);
        setTotalSearches(searchCount);
        setCurrentSearchIdx(0);
        setPhase(mode === "dailyset" ? "dailyset" : "searching");
        setDailySetResult(null);

        updateAccount(account.id, { status: "running", searchesCompleted: 0 });
        setStatusLine(`[${account.name}]  Preparing session…`);

        const acctCookies = account.cookies ?? {};
        const cookieCount = Object.keys(acctCookies).filter(k => !k.startsWith("_ls_")).length;
        const hasU = "_U" in acctCookies;

        setStatusLine(`[${account.name}] Loading ${cookieCount} cookies (_U: ${hasU ? "yes" : "no"})…`);
        const injectResult = await injectAccountCookies(acctCookies);
        if (injectResult.error) {
          setStatusLine(`[${account.name}] Cookie inject warning: ${injectResult.error}`);
        } else {
          setStatusLine(`[${account.name}] Injected ${injectResult.injected} cookies, verified ${injectResult.verified} in WebView`);
        }
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

            const result = await performBingSearch(query, acctCookies);
            if (result.networkError) {
              setNetworkError(true);
              networkLost = true;
              setStatusLine("No internet connection");
              break;
            }
            if (result.ok) {
              searchesDone++;
              setNetworkError(false);
            }

            updateAccount(account.id, { searchesCompleted: searchesDone });

            if (BackgroundService?.isRunning()) {
              const pct = Math.round(((si + 1) / searchCount) * 100);
              BackgroundService.updateNotification({
                taskTitle: `Macro Rewards — ${account.name}`,
                taskDesc: `Search ${si + 1}/${searchCount} (${pct}%)`,
                progressBar: { max: 100, value: pct, indeterminate: false },
              }).catch(() => {});
            }

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
          mode !== "searchonly" &&
          (mode === "dailyset"
            ? true
            : settings.dailySetEnabled && (account.dailySetEnabled ?? true));

        if (shouldRunDailySet) {
          setPhase("dailyset");

          if (mode !== "dailyset") {
            setStatusLine(`[${account.name}] Re-injecting cookies for Daily Set…`);
            await injectAccountCookies(acctCookies);
            await sleep(500);
          }

          const ds = await runDailySetViaWebView(setStatusLine);
          dailySetDone = ds.completed > 0 || ds.alreadyDone;
          setDailySetResult({ completed: ds.completed, total: ds.total });
          await sleep(1000);
        }

        // ── Points ─────────────────────────────────────────────────────────
        setStatusLine(`[${account.name}]  Fetching points…`);
        const { available, today } = await fetchRewardsPoints(acctCookies);
        const prevTotalPoints = account.totalPoints ?? 0;
        // If we have a valid baseline (account has been run before), calculate delta.
        // Otherwise use today's API-reported daily earnings to avoid showing the entire balance.
        const hasBaseline = !!account.lastRun;
        const pointsEarned = hasBaseline
          ? (available > prevTotalPoints ? available - prevTotalPoints : 0)
          : today;

        const totalSearchesDone = searchesDone;
        const finalStatus = networkLost && totalSearchesDone === 0 ? "failed" : "success";

        updateAccount(account.id, {
          status: finalStatus === "success" ? "done" : "failed",
          lastRun: new Date().toISOString(),
          searchesCompleted: totalSearchesDone,
          todayPoints: today,
          totalPoints: available > 0 ? available : prevTotalPoints,
        });

        addLog({
          accountId: account.id,
          accountName: account.name,
          timestamp: new Date().toISOString(),
          status: finalStatus,
          searchesDone: totalSearchesDone,
          dailySetDone,
          pointsEarned,
          errorMessage: finalStatus === "failed" ? "Network unavailable" : undefined,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (ai < targetAccounts.length - 1 && !abortRef.current) {
          setStatusLine("Pausing before next account…");
          setPhase("searching");

          // Reset the WebView to a blank page between accounts so the Android
          // WebView process releases the page memory before loading the next
          // account's session. Clear stale event refs first so the about:blank
          // onLoadEnd doesn't accidentally resolve a waiting promise.
          webViewLoadResolverRef.current = null;
          webViewMsgHandlerRef.current = null;
          loadEventBufferedRef.current = false;
          msgEventQueueRef.current = [];
          setWebViewUrl("about:blank");

          await sleep(3000);

          // about:blank's onLoadEnd fires during the sleep and may set
          // loadEventBufferedRef=true. Any late postMessage from the previous
          // page can also repopulate msgEventQueueRef during the sleep.
          // Clear both now so the next account starts with a fully clean
          // event bridge — no stale load or message events carried over.
          webViewLoadResolverRef.current = null;
          loadEventBufferedRef.current = false;
          msgEventQueueRef.current = [];
        }
      }

      if (!cancelled) {
        setIsFinished(true);
        setPhase("done");
        setStatusLine("All accounts completed!");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await showCompletedNotification();
      }

      } catch (err: any) {
        console.error("[SearchRunner] Unexpected error:", err);
        setStatusLine(`Error: ${err?.message ?? "Unknown error"}`);
        setIsFinished(true);
        setPhase("done");
        accountsRef.current
          .filter((a) => accountIdsRef.current.includes(a.id))
          .forEach((a) => {
            updateAccount(a.id, {
              status: a.status === "running" ? "failed" : a.status,
            } as any);
          });
      } finally {
        stopRun();
        // Clear the persisted run so home screen doesn't try to auto-resume
        try { await AsyncStorage.removeItem(ACTIVE_RUN_KEY); } catch {}
        try {
          if (BackgroundService?.isRunning()) {
            await BackgroundService.stop().catch(() => {});
          }
        } catch {}
        if (runningNotifId) {
          await dismissRunningNotification(runningNotifId);
        }
      }
    };

    const startWithBackground = async () => {
      // Persist run params so if the process is killed, reopening the app auto-resumes
      try {
        await AsyncStorage.setItem(
          ACTIVE_RUN_KEY,
          JSON.stringify({ accountIds, mode, startedAt: Date.now() })
        );
      } catch {}

      try {
        const isRunning = BackgroundService ? BackgroundService.isRunning() : false;
        if (BackgroundService && !isRunning) {
          try {
            await BackgroundService.start(
              async () => { await run(); },
              {
                taskName: "MacroRewardsSearch",
                taskTitle: "Macro Rewards — running searches",
                taskDesc: "Tap to return to the search screen",
                taskIcon: { name: "ic_launcher", type: "mipmap" },
                color: "#3B82F6",
                linkingURI: "mobile://",
                progressBar: { max: 100, value: 0, indeterminate: true },
              }
            );
          } catch (e) {
            console.log("[SearchRunner] BackgroundService start failed, running foreground:", e);
            await run();
          }
        } else {
          await run();
        }
      } catch (e) {
        console.log("[SearchRunner] BackgroundService check failed, running foreground:", e);
        await run();
      }
    };

    startWithBackground();
    return () => {
      cancelled = true;
      try {
        if (BackgroundService?.isRunning()) {
          BackgroundService.stop().catch(() => {});
        }
      } catch {}
    };
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
    showAlert("Stop Automation?", "This will interrupt the current run.", [
      { text: "Keep Running", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: async () => {
          abortRef.current = true;
          try { await AsyncStorage.removeItem(ACTIVE_RUN_KEY); } catch {}
          try {
            if (BackgroundService?.isRunning()) {
              await BackgroundService.stop().catch(() => {});
            }
          } catch {}
          stopRun();
          accountsRef.current
          .filter((a) => accountIdsRef.current.includes(a.id))
          .forEach((a) => updateAccount(a.id, { status: "idle" }));
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
            {((): string => {
              const n = accountIdsRef.current.length;
              const pos = Math.min(currentAccountIdx + 1, n);
              if (mode === "dailyset") return `Daily Set Only · Account ${pos}/${n}`;
              if (phase === "dailyset") return `Account ${pos}/${n} · Daily Set`;
              if (mode === "searchonly") return `Searches Only · Account ${pos}/${n} · ${currentSearchIdx}/${totalSearches}`;
              return `Account ${pos}/${n} · Search ${currentSearchIdx}/${totalSearches}`;
            })()}
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
      {AlertComponent}
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
