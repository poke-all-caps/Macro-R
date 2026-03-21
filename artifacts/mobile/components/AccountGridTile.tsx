import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertCircle,
  CheckCircle,
  CheckSquare,
  Clock,
  Loader,
  Play,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
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
  width: number;
  onPress: () => void;
  onRun: () => void;
  onDailySet: () => void;
  onRefreshSession: () => void;
  isRunningGlobal: boolean;
  showDailySet?: boolean;
}

function isSessionExpired(account: Account): boolean {
  const hasCookies = Object.keys(account.cookies ?? {}).length > 0;
  if (!hasCookies) return true;
  if (!account.lastRun) return false;
  const hoursSinceRun =
    (Date.now() - new Date(account.lastRun).getTime()) / (1000 * 60 * 60);
  return hoursSinceRun > 24;
}

const statusLabels: Record<AccountStatus, string> = {
  idle: "Idle",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

export function AccountGridTile({
  account,
  width,
  onPress,
  onRun,
  onDailySet,
  onRefreshSession,
  isRunningGlobal,
  showDailySet = true,
}: Props) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const initial = account.name.charAt(0).toUpperCase();
  const noCookies = Object.keys(account.cookies ?? {}).length === 0;
  const sessionExpired = isSessionExpired(account);
  const progressPercent =
    account.searchCount > 0
      ? (account.searchesCompleted / account.searchCount) * 100
      : 0;

  useEffect(() => {
    if (account.status === "running") {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [account.status]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };

  const sessionBannerColor = noCookies
    ? { bg: scheme === "dark" ? "#7F1D1D22" : "#FEF2F2", text: colors.error ?? "#EF4444", border: "#FCA5A5" }
    : sessionExpired
    ? { bg: scheme === "dark" ? "#78350F22" : "#FFFBEB", text: "#B45309", border: "#FCD34D" }
    : { bg: scheme === "dark" ? "#14532D22" : "#F0FDF4", text: colors.success ?? "#22C55E", border: "#86EFAC" };

  const sessionLabel = noCookies
    ? "No session \u2014 tap to sign in"
    : sessionExpired
    ? "Session may be expired"
    : "Session active";

  const SessionIcon = noCookies
    ? AlertCircle
    : sessionExpired
    ? Clock
    : Shield;

  const statusColor =
    account.status === "idle"
      ? "#94A3B8"
      : account.status === "running"
      ? "#7C3AED"
      : account.status === "done"
      ? "#22C55E"
      : "#EF4444";

  const StatusIcon =
    account.status === "idle"
      ? Clock
      : account.status === "running"
      ? RefreshCw
      : account.status === "done"
      ? CheckCircle
      : XCircle;

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }], width }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.tile,
          { backgroundColor: colors.surface, shadowColor: colors.cardShadow },
        ]}
      >
        {/* Session banner */}
        {account.status !== "running" && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRefreshSession();
            }}
            style={[
              styles.sessionBanner,
              {
                backgroundColor: sessionBannerColor.bg,
                borderColor: sessionBannerColor.border,
              },
            ]}
          >
            <SessionIcon size={9} color={sessionBannerColor.text} />
            <Text
              style={[styles.sessionText, { color: sessionBannerColor.text }]}
              numberOfLines={1}
            >
              {sessionLabel}
            </Text>
            <View style={styles.statusBadge}>
              <Animated.View
                style={{
                  opacity: account.status === "running" ? pulseAnim : 1,
                }}
              >
                <StatusIcon size={8} color={statusColor} />
              </Animated.View>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {account.status === "running"
                  ? `${account.searchesCompleted}/${account.searchCount}`
                  : statusLabels[account.status]}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Running progress banner */}
        {account.status === "running" && (
          <View style={[styles.runningBanner, { backgroundColor: "#EDE9FE" }]}>
            <Animated.View style={{ opacity: pulseAnim }}>
              <RefreshCw size={9} color="#7C3AED" />
            </Animated.View>
            <Text style={[styles.sessionText, { color: "#7C3AED", flex: 1 }]} numberOfLines={1}>
              {account.searchesCompleted}/{account.searchCount}
            </Text>
            <View style={[styles.miniProgress, { backgroundColor: "#C4B5FD" }]}>
              <View
                style={[
                  styles.miniProgressFill,
                  {
                    width: `${progressPercent}%` as any,
                    backgroundColor: "#7C3AED",
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Large avatar */}
        <View style={styles.avatarWrap}>
          <LinearGradient
            colors={["#3B82F6", "#1D4ED8"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
        </View>

        {/* Name & email */}
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={1}
        >
          {account.name}
        </Text>
        <Text
          style={[styles.email, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {account.email}
        </Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onRun();
            }}
            disabled={account.status === "running" || isRunningGlobal}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor:
                  account.status === "running"
                    ? colors.border
                    : pressed
                    ? colors.tintDark
                    : colors.tint,
                opacity:
                  account.status === "running" || isRunningGlobal ? 0.4 : 1,
              },
            ]}
          >
            {account.status === "running" ? (
              <Loader size={16} color="#fff" />
            ) : (
              <Play size={16} color="#fff" />
            )}
          </Pressable>

          {showDailySet && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDailySet();
              }}
              disabled={account.status === "running" || isRunningGlobal}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor:
                    account.status === "running" || isRunningGlobal
                      ? colors.border
                      : pressed
                      ? "#5B21B6"
                      : "#7C3AED",
                  opacity:
                    account.status === "running" || isRunningGlobal ? 0.4 : 1,
                },
              ]}
            >
              <CheckSquare size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    paddingBottom: 12,
    marginVertical: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
    overflow: "hidden",
  },
  sessionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  runningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sessionText: {
    fontSize: 8,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statusBadgeText: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
  },
  miniProgress: {
    height: 2,
    borderRadius: 1,
    width: 30,
    overflow: "hidden",
  },
  miniProgressFill: {
    height: "100%",
    borderRadius: 1,
  },
  avatarWrap: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  name: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    paddingHorizontal: 6,
  },
  email: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 4,
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
