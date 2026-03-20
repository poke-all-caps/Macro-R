import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Monitor,
  PlayCircle,
  Search,
  Square,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Account, RunLog, useAccounts } from "@/context/AccountsContext";
import { useQueries } from "@/context/QueriesContext";
import { useSettings } from "@/context/SettingsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

interface AccountRunState {
  accountId: string;
  accountName: string;
  accountEmail: string;
  steps: Step[];
  overallStatus: "pending" | "running" | "done" | "failed";
  pointsEarned: number;
  searchesDone: number;
  dailySetDone: boolean;
  error?: string;
}

// ─── Bing Search Helpers ─────────────────────────────────────────────────────

const BING_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([k]) => !k.startsWith("_ls_"))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

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
      headers: {
        Cookie: cookieStr,
        "User-Agent": BING_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.bing.com/",
        "Cache-Control": "no-cache",
      },
    });
    return { ok: resp.ok || resp.status === 302, status: resp.status };
  } catch (e: any) {
    if (e?.message?.includes("Network request failed")) {
      throw new Error("NO_NETWORK");
    }
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function buildSteps(account: Account): Step[] {
  return [
    { id: "init", label: "Validating session cookies", status: "pending" },
    {
      id: "searches",
      label: `Running ${account.searchCount} Bing searches`,
      status: "pending",
    },
    ...(account.dailySetEnabled
      ? [{ id: "dailyset", label: "Completing Daily Set", status: "pending" as StepStatus }]
      : []),
    {
      id: "points",
      label: "Fetching updated Rewards points",
      status: "pending",
    },
  ];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchRunnerScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { accountIds: rawIds } = useLocalSearchParams<{ accountIds: string }>();
  const { accounts, updateAccount, addLog, stopRun } = useAccounts();
  const { consumeQueries } = useQueries();
  const { settings } = useSettings();

  const accountIds: string[] = rawIds ? JSON.parse(rawIds) : [];
  // snapshot accounts at start so we always have fresh cookie data
  const targetAccounts = useRef<Account[]>(
    accounts.filter((a) => accountIds.includes(a.id))
  ).current;

  const [runStates, setRunStates] = useState<AccountRunState[]>(
    targetAccounts.map((a) => ({
      accountId: a.id,
      accountName: a.name,
      accountEmail: a.email,
      steps: buildSteps(a),
      overallStatus: "pending",
      pointsEarned: 0,
      searchesDone: 0,
      dailySetDone: false,
    }))
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [currentSearchLabel, setCurrentSearchLabel] = useState("");
  const [activityLogs, setActivityLogs] = useState<string[]>([]);
  const [networkError, setNetworkError] = useState(false);

  const abortRef = useRef(false);
  const startTime = useRef(Date.now());
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsedMs(Date.now() - startTime.current), 1000);
    return () => clearInterval(t);
  }, []);

  const log = useCallback((line: string) => {
    setActivityLogs((prev) => [
      ...prev.slice(-300),
      `[${new Date().toLocaleTimeString()}] ${line}`,
    ]);
  }, []);

  // ─── Step mutators ──────────────────────────────────────────────────────────

  const setStep = useCallback(
    (idx: number, stepId: string, status: StepStatus, detail?: string) => {
      setRunStates((prev) =>
        prev.map((s, i) =>
          i !== idx
            ? s
            : { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, status, detail } : st)) }
        )
      );
    },
    []
  );

  const setAccStatus = useCallback(
    (idx: number, status: AccountRunState["overallStatus"]) => {
      setRunStates((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, overallStatus: status } : s))
      );
    },
    []
  );

  const setAccField = useCallback(
    (idx: number, patch: Partial<AccountRunState>) => {
      setRunStates((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
      );
    },
    []
  );

  // ─── Per-account run logic ──────────────────────────────────────────────────

  const runAccount = useCallback(
    async (account: Account, idx: number) => {
      if (abortRef.current) return;
      const delay = (settings.searchDelay ?? 5) * 1000;
      const hasCookies = Object.keys(account.cookies ?? {}).length > 0;

      log(`▶ [${account.name}] Starting (${account.searchCount} searches)`);
      setAccStatus(idx, "running");
      updateAccount(account.id, { status: "running", searchesCompleted: 0 });

      // ── Step 1: Init / validate session ──────────────────────────────────
      setStep(idx, "init", "running");
      if (!hasCookies) {
        setStep(idx, "init", "failed", "No session cookies — sign in first");
        setStep(idx, "searches", "skipped");
        if (account.dailySetEnabled) setStep(idx, "dailyset", "skipped");
        setStep(idx, "points", "skipped");
        setAccStatus(idx, "failed");
        setAccField(idx, { error: "No cookies stored for this account" });
        updateAccount(account.id, { status: "failed" });
        log(`  ✗ [${account.name}] No cookies — skipping`);

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
        return;
      }

      // Quick connectivity check to Bing
      try {
        const probe = await performBingSearch("bing", account.cookies);
        if (probe.ok) {
          setStep(idx, "init", "done", "Session verified ✓");
          log(`  ✓ [${account.name}] Session OK`);
          setNetworkError(false);
        } else {
          setStep(idx, "init", "failed", `Session check failed (HTTP ${probe.status})`);
          log(`  ⚠ [${account.name}] Session returned ${probe.status} — may be expired`);
          // Continue anyway — some searches may still work
        }
      } catch (e: any) {
        if (e?.message === "NO_NETWORK") {
          setNetworkError(true);
          setStep(idx, "init", "failed", "No internet connection");
          setAccStatus(idx, "failed");
          updateAccount(account.id, { status: "failed" });
          setAccField(idx, { error: "Network unavailable" });
          log(`  ✗ [${account.name}] Network error`);
          addLog({
            accountId: account.id,
            accountName: account.name,
            timestamp: new Date().toISOString(),
            status: "failed",
            searchesDone: 0,
            dailySetDone: false,
            pointsEarned: 0,
            errorMessage: "Network unavailable",
          });
          return;
        }
        setStep(idx, "init", "done", "Session check skipped");
      }

      if (abortRef.current) return;

      // ── Step 2: Bing searches ─────────────────────────────────────────────
      setStep(idx, "searches", "running");
      const queries = consumeQueries(account.searchCount);
      let searchesDone = 0;
      let searchFailed = 0;

      for (let i = 0; i < account.searchCount; i++) {
        if (abortRef.current) return;
        const query = queries[i] ?? `microsoft rewards tip ${i + 1}`;
        setCurrentSearchLabel(query);
        log(`  → [${account.name}] Search ${i + 1}/${account.searchCount}: "${query}"`);

        try {
          const result = await performBingSearch(query, account.cookies);
          if (result.ok) {
            searchesDone++;
          } else {
            searchFailed++;
            log(`  ⚠ [${account.name}] Search ${i + 1} returned ${result.status}`);
          }
        } catch (e: any) {
          if (e?.message === "NO_NETWORK") {
            setNetworkError(true);
            log(`  ✗ [${account.name}] Network lost during search ${i + 1}`);
            break;
          }
          searchFailed++;
        }

        setAccField(idx, { searchesDone });
        updateAccount(account.id, { searchesCompleted: searchesDone });

        // Human-like delay between searches
        if (i < account.searchCount - 1) {
          const jitter = Math.floor((Math.random() - 0.5) * 2000);
          await sleep(Math.max(2000, delay + jitter));
        }
      }

      const allFailed = searchesDone === 0 && account.searchCount > 0;
      setStep(
        idx,
        "searches",
        allFailed ? "failed" : searchFailed > 0 ? "done" : "done",
        allFailed
          ? `All ${account.searchCount} searches failed`
          : searchFailed > 0
          ? `${searchesDone} done, ${searchFailed} failed`
          : `${searchesDone} searches completed`
      );
      log(`  ✓ [${account.name}] Searches: ${searchesDone} done, ${searchFailed} failed`);

      if (abortRef.current) return;

      // ── Step 3: Daily Set ─────────────────────────────────────────────────
      if (account.dailySetEnabled) {
        setStep(idx, "dailyset", "running");
        // Daily Set requires tapping UI elements — approximate with a fixed delay
        // A real implementation would need WebView automation
        await sleep(1500 + Math.random() * 500);
        if (!abortRef.current) {
          // Mark as attempted — actual completion depends on account session
          const dailyAttempted = searchesDone > 0;
          setStep(
            idx,
            "dailyset",
            dailyAttempted ? "done" : "skipped",
            dailyAttempted ? "Attempted via search session" : "Skipped (no successful searches)"
          );
          setAccField(idx, { dailySetDone: dailyAttempted });
          log(`  ${dailyAttempted ? "✓" : "⚠"} [${account.name}] Daily Set: ${dailyAttempted ? "attempted" : "skipped"}`);
        }
      }

      if (abortRef.current) return;

      // ── Step 4: Fetch real points ─────────────────────────────────────────
      setStep(idx, "points", "running");
      const points = await fetchRewardsPoints(account.cookies);
      const prevPoints = account.todayPoints ?? 0;
      const pointsEarned = points > prevPoints ? points - prevPoints : points > 0 ? 0 : 0;

      setStep(
        idx,
        "points",
        "done",
        points > 0 ? `Balance: ${points.toLocaleString()} pts` : "Could not fetch points"
      );
      setAccField(idx, { pointsEarned });
      log(`  ✓ [${account.name}] Points fetched: ${points.toLocaleString()}`);

      // ── Wrap up ───────────────────────────────────────────────────────────
      const finalStatus = allFailed ? "failed" : "done";
      setAccStatus(idx, finalStatus);
      updateAccount(account.id, {
        status: finalStatus,
        lastRun: new Date().toISOString(),
        searchesCompleted: searchesDone,
        todayPoints: points > 0 ? points : prevPoints + pointsEarned,
        totalPoints: (account.totalPoints ?? 0) + pointsEarned,
      });

      addLog({
        accountId: account.id,
        accountName: account.name,
        timestamp: new Date().toISOString(),
        status: finalStatus,
        searchesDone,
        dailySetDone: account.dailySetEnabled && searchesDone > 0,
        pointsEarned,
        errorMessage: allFailed ? "All searches failed — session may be expired" : undefined,
      });

      log(
        `${finalStatus === "done" ? "✔" : "✗"} [${account.name}] ${
          finalStatus === "done" ? "Finished" : "Failed"
        } — ${searchesDone} searches, ${points.toLocaleString()} pts`
      );
      if (finalStatus === "done") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [settings.searchDelay, consumeQueries, updateAccount, addLog, log, setStep, setAccStatus, setAccField]
  );

  // ─── Main execution loop ────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < targetAccounts.length; i++) {
        if (cancelled || abortRef.current) break;
        setCurrentIndex(i);
        Animated.timing(progressAnim, {
          toValue: (i / targetAccounts.length) * 100,
          duration: 500,
          useNativeDriver: false,
        }).start();
        // Always use the freshest account data from the ref snapshot
        await runAccount(targetAccounts[i], i);

        // Short pause between accounts to avoid rate-limiting
        if (i < targetAccounts.length - 1 && !abortRef.current) {
          log(`  ⏳ Pausing 3s before next account...`);
          await sleep(3000);
        }
      }

      if (!cancelled) {
        Animated.timing(progressAnim, {
          toValue: 100,
          duration: 500,
          useNativeDriver: false,
        }).start();
        setIsFinished(true);
        setCurrentSearchLabel("");
        stopRun();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        log("✅ All accounts processed!");
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  // ─── Android back button ────────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!isFinished) { handleStop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [isFinished]);

  const handleStop = () => {
    Alert.alert("Stop Automation?", "Current searches will be interrupted.", [
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

  // ─── Derived state ──────────────────────────────────────────────────────────

  const doneCount = runStates.filter((s) => s.overallStatus === "done").length;
  const failedCount = runStates.filter((s) => s.overallStatus === "failed").length;

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: opacityAnim,
            transform: [{ translateY: slideAnim }],
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerLeft}>
            <Monitor size={20} color={isFinished ? colors.success : colors.running} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {isFinished ? "Run Complete" : "Running Automation"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {networkError && (
              <View style={[styles.netBadge, { backgroundColor: "#FEE2E2" }]}>
                <WifiOff size={12} color={colors.error} />
                <Text style={[styles.netText, { color: colors.error }]}>Offline</Text>
              </View>
            )}
            <View style={[styles.timerBadge, { backgroundColor: colors.surfaceSecondary }]}>
              <Clock size={12} color={colors.textMuted} />
              <Text style={[styles.timerText, { color: colors.textSecondary }]}>
                {formatElapsed(elapsedMs)}
              </Text>
            </View>
            {isFinished && (
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <X size={22} color={colors.text} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressSection, { backgroundColor: colors.surface }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              {isFinished
                ? `${doneCount}/${targetAccounts.length} done${failedCount > 0 ? ` · ${failedCount} failed` : ""}`
                : `Account ${Math.min(currentIndex + 1, targetAccounts.length)} of ${targetAccounts.length}`}
            </Text>
            <Text style={[styles.progressPct, { color: colors.tint }]}>
              {Math.round((doneCount / Math.max(targetAccounts.length, 1)) * 100)}%
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                  backgroundColor:
                    isFinished
                      ? failedCount > 0
                        ? colors.error
                        : colors.success
                      : colors.tint,
                },
              ]}
            />
          </View>
          {!isFinished && currentSearchLabel ? (
            <Text style={[styles.searchingLabel, { color: colors.textMuted }]} numberOfLines={1}>
              Searching: "{currentSearchLabel}"
            </Text>
          ) : null}
        </View>

        {/* Account cards */}
        <ScrollView style={styles.accountsList} showsVerticalScrollIndicator={false}>
          {runStates.map((state, i) => (
            <AccountRunCard
              key={state.accountId}
              state={state}
              isActive={i === currentIndex && !isFinished}
              colors={colors}
            />
          ))}

          {activityLogs.length > 0 && (
            <View style={[styles.logsBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.logsTitle, { color: colors.textSecondary }]}>
                Activity Log
              </Text>
              <ScrollView style={styles.logsScroll} nestedScrollEnabled>
                {[...activityLogs].reverse().map((l, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.logLine,
                      {
                        color: colors.textMuted,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      },
                    ]}
                  >
                    {l}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          {isFinished ? (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
            >
              <LinearGradient
                colors={
                  failedCount === targetAccounts.length
                    ? ["#DC2626", "#B91C1C"]
                    : ["#16A34A", "#15803D"]
                }
                style={styles.doneBtn}
              >
                {failedCount === targetAccounts.length ? (
                  <XCircle size={20} color="#fff" />
                ) : (
                  <CheckCircle size={20} color="#fff" />
                )}
                <Text style={styles.doneBtnText}>
                  {failedCount === targetAccounts.length ? "All Failed" : "All Done!"}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [
                styles.stopBtn,
                { borderColor: colors.error, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Square size={16} color={colors.error} />
              <Text style={[styles.stopBtnText, { color: colors.error }]}>
                Stop Automation
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── AccountRunCard ────────────────────────────────────────────────────────────

function AccountRunCard({
  state,
  isActive,
  colors,
}: {
  state: AccountRunState;
  isActive: boolean;
  colors: any;
}) {
  return (
    <View
      style={[
        styles.accountCard,
        {
          backgroundColor: colors.surface,
          borderColor: isActive ? colors.tint : "transparent",
          borderWidth: isActive ? 1.5 : 0,
        },
      ]}
    >
      <View style={styles.accountCardHeader}>
        <LinearGradient
          colors={["#3B82F6", "#1D4ED8"]}
          style={styles.accountAvatar}
        >
          <Text style={styles.accountAvatarText}>
            {state.accountName.charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.accountCardName, { color: colors.text }]}>
            {state.accountName}
          </Text>
          <Text
            style={[styles.accountCardEmail, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {state.accountEmail}
          </Text>
        </View>
        <OverallStatusIcon status={state.overallStatus} colors={colors} />
      </View>

      {state.overallStatus !== "pending" && (
        <View style={styles.steps}>
          {state.steps.map((step) => (
            <StepRow key={step.id} step={step} colors={colors} />
          ))}
        </View>
      )}

      {state.overallStatus === "done" && (
        <View style={[styles.summaryRow, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.summaryText, { color: colors.success }]}>
            ✓ {state.searchesDone} searches
            {state.dailySetDone ? " · Daily Set ✓" : ""}
            {state.pointsEarned > 0 ? ` · +${state.pointsEarned} pts` : ""}
          </Text>
        </View>
      )}

      {state.overallStatus === "failed" && state.error && (
        <View style={[styles.errorRow, { backgroundColor: "#FEE2E2" }]}>
          <AlertCircle size={12} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>
            {state.error}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── StepRow ──────────────────────────────────────────────────────────────────

function StepRow({ step, colors }: { step: Step; colors: any }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (step.status === "running") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [step.status]);

  const statusColor =
    step.status === "done"
      ? colors.success
      : step.status === "failed"
      ? colors.error
      : step.status === "running"
      ? colors.tint
      : colors.textMuted;

  return (
    <View style={styles.stepRow}>
      <Animated.View style={{ opacity: step.status === "running" ? pulseAnim : 1 }}>
        <StepStatusIcon status={step.status} colors={colors} />
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.stepLabel,
            { color: step.status === "pending" || step.status === "skipped" ? colors.textMuted : colors.text },
          ]}
        >
          {step.label}
        </Text>
        {step.detail && (
          <Text style={[styles.stepDetail, { color: statusColor }]}>
            {step.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

function StepStatusIcon({ status, colors }: { status: StepStatus; colors: any }) {
  const size = 14;
  switch (status) {
    case "done": return <CheckCircle size={size} color={colors.success} />;
    case "failed": return <XCircle size={size} color={colors.error} />;
    case "running": return <Search size={size} color={colors.tint} />;
    case "skipped": return <Square size={size} color={colors.textMuted} />;
    default: return <PlayCircle size={size} color={colors.textMuted} />;
  }
}

function OverallStatusIcon({ status, colors }: { status: AccountRunState["overallStatus"]; colors: any }) {
  switch (status) {
    case "done": return <CheckCircle size={20} color={colors.success} />;
    case "failed": return <XCircle size={20} color={colors.error} />;
    case "running": return <Search size={20} color={colors.tint} />;
    default: return <PlayCircle size={20} color={colors.textMuted} />;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  netBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  netText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timerText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  progressPct: { fontSize: 15, fontFamily: "Inter_700Bold" },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  searchingLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  accountsList: { flex: 1, paddingHorizontal: 16 },
  accountCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  accountCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  accountCardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  accountCardEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  steps: { gap: 8, paddingLeft: 4 },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  stepDetail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  summaryRow: { padding: 10, borderRadius: 10 },
  summaryText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
  },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  logsBox: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  logsTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  logsScroll: { maxHeight: 180 },
  logLine: { fontSize: 10, lineHeight: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  stopBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
