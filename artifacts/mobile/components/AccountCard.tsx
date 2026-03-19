import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
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
  isRunningGlobal: boolean;
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
    idle: { icon: "clock" as const, color: colors.statusIdle, bg: colors.surfaceSecondary, label: "Idle" },
    running: { icon: "refresh-cw" as const, color: colors.statusRunning, bg: "#EDE9FE", label: `${searchesCompleted}/${searchCount}` },
    done: { icon: "check-circle" as const, color: colors.statusDone, bg: "#DCFCE7", label: "Done" },
    failed: { icon: "x-circle" as const, color: colors.statusFailed, bg: "#FEE2E2", label: "Failed" },
  };

  const cfg = configs[status];
  const darkRunning = scheme === "dark" && status === "running";
  const darkDone = scheme === "dark" && status === "done";
  const darkFailed = scheme === "dark" && status === "failed";

  return (
    <View style={[
      styles.badge,
      {
        backgroundColor: darkRunning ? "#4C1D95" : darkDone ? "#14532D" : darkFailed ? "#7F1D1D" : cfg.bg,
      }
    ]}>
      <Animated.View style={{ opacity: status === "running" ? pulseAnim : 1 }}>
        <Feather name={cfg.icon} size={12} color={cfg.color} />
      </Animated.View>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export function AccountCard({ account, onPress, onRun, isRunningGlobal }: Props) {
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

  const progressPercent = account.searchCount > 0
    ? (account.searchesCompleted / account.searchCount) * 100
    : 0;

  const initial = account.name.charAt(0).toUpperCase();

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}
      >
        <View style={styles.cardContent}>
          <LinearGradient
            colors={["#3B82F6", "#1D4ED8"]}
            style={styles.avatar}
          >
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
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%` as any, backgroundColor: colors.running },
                  ]}
                />
              </View>
            )}

            <View style={styles.stats}>
              <View style={styles.statItem}>
                <Feather
                  name={Object.keys(account.cookies).length > 0 ? "shield" : "shield-off"}
                  size={11}
                  color={Object.keys(account.cookies).length > 0 ? colors.success : colors.warning}
                />
                <Text style={[styles.statText, { color: Object.keys(account.cookies).length > 0 ? colors.success : colors.warning }]}>
                  {Object.keys(account.cookies).length > 0 ? "Cookies set" : "No cookies"}
                </Text>
              </View>
              <View style={styles.statDot} />
              <View style={styles.statItem}>
                <Feather name="search" size={11} color={colors.textMuted} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {account.searchCount} searches
                </Text>
              </View>
              {account.lastRun && (
                <>
                  <View style={styles.statDot} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>
                    {formatRelativeTime(account.lastRun)}
                  </Text>
                </>
              )}
            </View>
          </View>

          <Pressable
            onPress={handleRun}
            disabled={account.status === "running" || isRunningGlobal}
            style={({ pressed }) => [
              styles.runBtn,
              {
                backgroundColor:
                  account.status === "running"
                    ? colors.border
                    : pressed
                    ? colors.tintDark
                    : colors.tint,
                opacity: account.status === "running" || (isRunningGlobal && account.status !== "running") ? 0.5 : 1,
              },
            ]}
          >
            <Feather
              name={account.status === "running" ? "loader" : "play"}
              size={14}
              color="#fff"
            />
          </Pressable>
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
    alignItems: "center",
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
  runBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
