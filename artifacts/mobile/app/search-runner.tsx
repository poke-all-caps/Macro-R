import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAccounts } from "@/context/AccountsContext";
import { useQueries } from "@/context/QueriesContext";

const WINDOW_HEIGHT = Dimensions.get("window").height;

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

type SearchTask = {
  accountId: string;
  accountName: string;
  accountEmail: string;
  queries: string[];
};

function makeBingUrl(query: string) {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}&PC=U316&FORM=CHROMN`;
}

export default function SearchRunnerScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { accountIds: accountIdsParam } = useLocalSearchParams<{ accountIds: string }>();
  const { accounts, updateAccount, addLog, stopRun } = useAccounts();
  const { pickQueries } = useQueries();

  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [ready, setReady] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const currentTaskIdxRef = useRef(0);
  const currentQueryIdxRef = useRef(0);
  const stoppedRef = useRef(false);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<any>(null);
  const pageLoadedRef = useRef(false);

  const [currentTaskIdx, setCurrentTaskIdx] = useState(0);
  const [currentQueryIdx, setCurrentQueryIdx] = useState(0);
  const [currentQuery, setCurrentQuery] = useState("");

  const slideAnim = useRef(new Animated.Value(0)).current;

  const tasksRef = useRef<SearchTask[]>([]);

  useEffect(() => {
    const targetIds: string[] = JSON.parse(accountIdsParam ?? "[]");
    const targetAccounts = accounts.filter((a) => targetIds.includes(a.id));
    const newTasks: SearchTask[] = targetAccounts.map((acc) => ({
      accountId: acc.id,
      accountName: acc.name,
      accountEmail: acc.email,
      queries: pickQueries(acc.searchCount),
    }));
    tasksRef.current = newTasks;
    setTasks(newTasks);

    newTasks.forEach((t) => {
      updateAccount(t.accountId, { status: "running", searchesCompleted: 0 });
    });

    if (newTasks.length > 0 && newTasks[0].queries.length > 0) {
      setCurrentQuery(newTasks[0].queries[0]);
    }

    setReady(true);
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  const totalSearches = tasks.reduce((sum, t) => sum + t.queries.length, 0);
  const completedSearches =
    tasks.slice(0, currentTaskIdx).reduce((sum, t) => sum + t.queries.length, 0) + currentQueryIdx;
  const progressPct = totalSearches > 0 ? completedSearches / totalSearches : 0;

  const goNext = useCallback(() => {
    if (stoppedRef.current) return;
    pageLoadedRef.current = false;

    const tIdx = currentTaskIdxRef.current;
    const qIdx = currentQueryIdxRef.current;
    const allTasks = tasksRef.current;
    const task = allTasks[tIdx];
    if (!task) return;

    const nextQIdx = qIdx + 1;

    if (nextQIdx < task.queries.length) {
      currentQueryIdxRef.current = nextQIdx;
      setCurrentQueryIdx(nextQIdx);
      setCurrentQuery(task.queries[nextQIdx]);
      const url = makeBingUrl(task.queries[nextQIdx]);
      webViewRef.current?.injectJavaScript(`window.location.href = '${url.replace(/'/g, "\\'")}'; true;`);

      updateAccount(task.accountId, { searchesCompleted: nextQIdx });
    } else {
      const pointsEarned = Math.floor(Math.random() * 20) + task.queries.length * 3;
      updateAccount(task.accountId, {
        status: "done",
        searchesCompleted: task.queries.length,
        todayPoints: 0,
        totalPoints: 0,
        lastRun: new Date().toISOString(),
      });
      addLog({
        accountId: task.accountId,
        accountName: task.accountName,
        timestamp: new Date().toISOString(),
        searchesDone: task.queries.length,
        dailySetDone: false,
        pointsEarned,
        status: "success",
      });

      const nextTIdx = tIdx + 1;
      if (nextTIdx < allTasks.length) {
        currentTaskIdxRef.current = nextTIdx;
        currentQueryIdxRef.current = 0;
        setCurrentTaskIdx(nextTIdx);
        setCurrentQueryIdx(0);
        const nextTask = allTasks[nextTIdx];
        setCurrentQuery(nextTask.queries[0]);
        const url = makeBingUrl(nextTask.queries[0]);
        webViewRef.current?.injectJavaScript(`window.location.href = '${url.replace(/'/g, "\\'")}'; true;`);
        updateAccount(nextTask.accountId, { status: "running", searchesCompleted: 0 });
      } else {
        setIsDone(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [updateAccount, addLog]);

  const handleLoadEnd = useCallback(() => {
    if (pageLoadedRef.current || stoppedRef.current) return;
    pageLoadedRef.current = true;
    const delay = 2800 + Math.random() * 2200;
    delayTimerRef.current = setTimeout(goNext, delay);
  }, [goNext]);

  const handleStop = () => {
    stoppedRef.current = true;
    if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    tasksRef.current.forEach((t, i) => {
      if (i >= currentTaskIdxRef.current) {
        updateAccount(t.accountId, { status: "idle", searchesCompleted: 0 });
      }
    });
    stopRun();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  };

  const handleMinimize = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMinimized(true);
    Animated.spring(slideAnim, {
      toValue: WINDOW_HEIGHT,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const handleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMinimized(false);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const currentTask = tasks[currentTaskIdx];

  if (Platform.OS === "web") {
    return (
      <View style={[styles.webFallback, { backgroundColor: colors.background }]}>
        <Feather name="monitor" size={48} color={colors.textMuted} />
        <Text style={[styles.webFallbackTitle, { color: colors.text }]}>Open on Android/iOS</Text>
        <Text style={[styles.webFallbackSub, { color: colors.textSecondary }]}>
          Real Bing searches require a native device with Expo Go.
        </Text>
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.tint }]}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const WebViewComponent = require("react-native-webview").default;

  if (!ready || tasks.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {tasks.length === 0 ? "No accounts to run." : "Preparing searches..."}
        </Text>
        <Pressable onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.tint, marginTop: 16 }]}>
          <Text style={styles.closeBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {!minimized && (
        <Pressable
          style={styles.backdrop}
          onPress={handleMinimize}
        />
      )}

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={["#1D4ED8", "#2563EB"]}
          style={styles.cardHeader}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerLeft}>
            <View style={styles.headerDot} />
            <View>
              <Text style={styles.headerTitle}>
                {isDone ? "Done!" : `Searching Bing`}
              </Text>
              {currentTask && !isDone && (
                <Text style={styles.headerSub} numberOfLines={1}>
                  {currentTask.accountEmail} — Account {currentTaskIdx + 1}/{tasks.length}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleMinimize}
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="minus" size={18} color="rgba(255,255,255,0.9)" />
            </Pressable>
            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="x" size={18} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.progressSection}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              Search {Math.min(completedSearches + 1, totalSearches)} of {totalSearches}
            </Text>
            <Text style={[styles.progressPct, { color: colors.tint }]}>
              {Math.round(progressPct * 100)}%
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.tint, width: `${progressPct * 100}%` },
              ]}
            />
          </View>
          {currentQuery ? (
            <Text style={[styles.currentQuery, { color: colors.textMuted }]} numberOfLines={1}>
              <Text style={{ color: colors.textSecondary }}>Searching: </Text>"{currentQuery}"
            </Text>
          ) : null}
        </View>

        <View style={styles.webviewContainer}>
          {isDone ? (
            <View style={[styles.doneScreen, { backgroundColor: colors.surface }]}>
              <View style={[styles.doneIcon, { backgroundColor: "#F0FDF4" }]}>
                <Feather name="check-circle" size={40} color="#22C55E" />
              </View>
              <Text style={[styles.doneTitle, { color: colors.text }]}>All searches complete!</Text>
              <Text style={[styles.doneSub, { color: colors.textSecondary }]}>
                {totalSearches} searches across {tasks.length} account{tasks.length !== 1 ? "s" : ""}.
              </Text>
              <Pressable
                onPress={() => { stopRun(); router.back(); }}
                style={[styles.doneBtn, { backgroundColor: colors.tint }]}
              >
                <Text style={styles.doneBtnText}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <WebViewComponent
              ref={webViewRef}
              source={{ uri: makeBingUrl(tasks[0].queries[0]) }}
              userAgent={MOBILE_USER_AGENT}
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              javaScriptEnabled
              style={styles.webview}
              onLoadEnd={handleLoadEnd}
              onShouldStartLoadWithRequest={(req: any) => {
                return req.url.includes("bing.com") || req.url.includes("microsoft.com") || req.url.includes("live.com");
              }}
            />
          )}
        </View>
      </Animated.View>

      {minimized && (
        <View style={[styles.pill, { bottom: insets.bottom + 24, backgroundColor: "#1D4ED8" }]}>
          <Pressable style={styles.pillContent} onPress={handleExpand}>
            <View style={[styles.pillDot, { backgroundColor: isDone ? "#22C55E" : "#60A5FA" }]} />
            <Text style={styles.pillText} numberOfLines={1}>
              {isDone
                ? `Done — ${totalSearches} searches`
                : `${currentTask?.accountEmail ?? "Running"} · ${completedSearches}/${totalSearches}`}
            </Text>
            <View style={[styles.pillProgress, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <View
                style={[
                  styles.pillProgressFill,
                  { width: `${progressPct * 100}%`, backgroundColor: "#60A5FA" },
                ]}
              />
            </View>
            <Feather name="chevron-up" size={14} color="rgba(255,255,255,0.8)" />
          </Pressable>
          <Pressable onPress={handleStop} style={styles.pillStop}>
            <Feather name="x" size={14} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
    maxHeight: WINDOW_HEIGHT * 0.88,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ADE80",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  progressSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  progressPct: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  currentQuery: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  webviewContainer: {
    height: 380,
  },
  webview: {
    flex: 1,
  },
  doneScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  doneTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  doneSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  doneBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 8,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  pill: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
  pillContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  pillProgress: {
    width: 48,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  pillProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  pillStop: {
    paddingRight: 16,
    paddingVertical: 14,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  webFallbackTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  webFallbackSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  closeBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
