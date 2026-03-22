import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { AlertCircle, CheckCircle, CheckSquare, Clock, Loader, Play, RefreshCw, Search, Shield, Star, XCircle } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Account, AccountStatus } from "@/context/AccountsContext";
import Colors from "@/constants/colors";

interface Props {
  account: Account;
  onPress: () => void;
  onRun: () => void;
  onDailySet: () => void;
  onRefreshSession: () => void;
  isRunningGlobal: boolean;
  showDailySet?: boolean;
}

function StatusBadge({ status, searchesCompleted, searchCount }: { status: AccountStatus; searchesCompleted: number; searchCount: number }) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "running") {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const configs = {
    idle: { Icon: Clock, color: colors.statusIdle, bg: colors.surfaceSecondary, label: "Idle" },
    running: { Icon: RefreshCw, color: colors.statusRunning, bg: "#EDE9FE", label: `${searchesCompleted}/${searchCount}` },
    done: { Icon: CheckCircle, color: colors.statusDone, bg: "#DCFCE7", label: "Done" },
    failed: { Icon: XCircle, color: colors.statusFailed, bg: "#FEE2E2", label: "Failed" },
  };

  const cfg = configs[status];
  const darkRunning = scheme === "dark" && status === "running";
  const darkDone = scheme === "dark" && status === "done";
  const darkFailed = scheme === "dark" && status === "failed";

  return (
    <View style={[
      styles.badge,
      { backgroundColor: darkRunning ? "#4C1D95" : darkDone ? "#14532D" : darkFailed ? "#7F1D1D" : cfg.bg }
    ]}>
      <Animated.View style={{ opacity: status === "running" ? pulseAnim : 1 }}>
        <cfg.Icon size={12} color={cfg.color} />
      </Animated.View>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function isSessionExpired(account: Account): boolean {
  const hasCookies = Object.keys(account.cookies ?? {}).length > 0;
  if (!hasCookies) return true;
  if (!account.lastRun) return false;
  const hoursSinceRun = (Date.now() - new Date(account.lastRun).getTime()) / (1000 * 60 * 60);
  return hoursSinceRun > 24;
}

export function AccountCard({ account, onPress, onRun, onDailySet, onRefreshSession, isRunningGlobal, showDailySet = true }: Props) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  const handleRun = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRun();
  };

  const handleDailySet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDailySet();
  };

  const handleSessionRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRefreshSession();
  };

  const progressPercent = account.searchCount > 0
    ? (account.searchesCompleted / account.searchCount) * 100
    : 0;

  const initial = account.name.charAt(0).toUpperCase();
  const sessionExpired = isSessionExpired(account);
  const noCookies = Object.keys(account.cookies ?? {}).length === 0;

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}
      >
        <View style={styles.cardContent}>
          <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>

          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {account.name}
              </Text>
              <StatusBadge
                status={account.status}
                searchesCompleted={account.searchesCompleted}
                searchCount={account.searchCount}
              />
            </View>
            <Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>
              {account.email}
            </Text>

            {account.status === "running" && (
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` as any, backgroundColor: colors.running }]} />
              </View>
            )}

            <View style={styles.stats}>
              <View style={styles.statItem}>
                <Search size={11} color={colors.textMuted} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{account.searchCount} searches</Text>
              </View>
              {account.todayPoints > 0 && (
                <>
                  <View style={styles.statDot} />
                  <View style={styles.statItem}>
                    <Star size={11} color={colors.warning} />
                    <Text style={[styles.statText, { color: colors.textSecondary }]}>{account.todayPoints.toLocaleString()} pts today</Text>
                  </View>
                </>
              )}
              {account.lastRun && (
                <>
                  <View style={styles.statDot} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>{formatRelativeTime(account.lastRun)}</Text>
                </>
              )}
            </View>

            {account.status !== "running" && (
              <Pressable
                onPress={handleSessionRefresh}
                style={({ pressed }) => [
                  styles.sessionBanner,
                  {
                    backgroundColor: noCookies
                      ? scheme === "dark" ? "#7F1D1D22" : "#FEF2F2"
                      : sessionExpired
                      ? scheme === "dark" ? "#78350F22" : "#FFFBEB"
                      : scheme === "dark" ? "#14532D22" : "#F0FDF4",
                    borderColor: noCookies ? "#FCA5A5" : sessionExpired ? "#FCD34D" : "#86EFAC",
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                {noCookies ? (
                  <AlertCircle size={11} color={colors.error} />
                ) : sessionExpired ? (
                  <Clock size={11} color={colors.warning} />
                ) : (
                  <Shield size={11} color={colors.success} />
                )}
                <Text
                  style={[
                    styles.sessionText,
                    { color: noCookies ? colors.error : sessionExpired ? "#B45309" : colors.success, flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {noCookies
                    ? "No session — tap to sign in"
                    : sessionExpired
                    ? "Session may be expired — tap to refresh"
                    : "Session active"}
                </Text>
                {(noCookies || sessionExpired) && (
                  <RefreshCw size={11} color={noCookies ? colors.error : "#B45309"} />
                )}
              </Pressable>
            )}
          </View>

          <View style={styles.actionCol}>
            <Pressable
              onPress={handleRun}
              disabled={account.status === "running" || isRunningGlobal}
              style={({ pressed }) => [
                styles.runBtn,
                {
                  backgroundColor:
                    account.status === "running" ? colors.border : pressed ? colors.tintDark : colors.tint,
                  opacity: account.status === "running" || isRunningGlobal ? 0.5 : 1,
                },
              ]}
            >
              {account.status === "running" ? (
                <Loader size={14} color="#fff" />
              ) : (
                <Play size={14} color="#fff" />
              )}
            </Pressable>

            {showDailySet && (
              <Pressable
                onPress={handleDailySet}
                disabled={account.status === "running" || isRunningGlobal}
                style={({ pressed }) => [
                  styles.dsBtn,
                  {
                    backgroundColor:
                      account.status === "running" || isRunningGlobal
                        ? colors.border
                        : pressed
                        ? "#5B21B6"
                        : "#7C3AED",
                    opacity: account.status === "running" || isRunningGlobal ? 0.4 : 1,
                  },
                ]}
              >
                <CheckSquare size={13} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  email: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    flexWrap: "wrap",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  sessionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  sessionText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  actionCol: {
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginTop: 2,
  },
  dsBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  runBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
