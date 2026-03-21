import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { CheckCircle, Clock, Loader, Play, RefreshCw, XCircle } from "lucide-react-native";
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
  isRunningGlobal: boolean;
}

const statusColors: Record<AccountStatus, string> = {
  idle: "#94A3B8",
  running: "#7C3AED",
  done: "#22C55E",
  failed: "#EF4444",
};

const statusIcons: Record<AccountStatus, typeof Clock> = {
  idle: Clock,
  running: RefreshCw,
  done: CheckCircle,
  failed: XCircle,
};

export function AccountGridTile({ account, width, onPress, onRun, isRunningGlobal }: Props) {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const initial = account.name.charAt(0).toUpperCase();
  const statusColor = statusColors[account.status];
  const StatusIcon = statusIcons[account.status];
  const progressPercent = account.searchCount > 0
    ? (account.searchesCompleted / account.searchCount) * 100
    : 0;

  useEffect(() => {
    if (account.status === "running") {
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
  }, [account.status]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }], width }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.tile, { backgroundColor: colors.surface, shadowColor: colors.cardShadow }]}
      >
        <View style={styles.topRow}>
          <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onRun();
            }}
            disabled={account.status === "running" || isRunningGlobal}
            style={({ pressed }) => [
              styles.runBtn,
              {
                backgroundColor:
                  account.status === "running" ? colors.border : pressed ? colors.tintDark : colors.tint,
                opacity: account.status === "running" || isRunningGlobal ? 0.4 : 1,
              },
            ]}
          >
            {account.status === "running" ? (
              <Loader size={12} color="#fff" />
            ) : (
              <Play size={12} color="#fff" />
            )}
          </Pressable>
        </View>

        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {account.name}
        </Text>

        <View style={styles.statusRow}>
          <Animated.View style={{ opacity: account.status === "running" ? pulseAnim : 1 }}>
            <StatusIcon size={10} color={statusColor} />
          </Animated.View>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {account.status === "running"
              ? `${account.searchesCompleted}/${account.searchCount}`
              : account.status.charAt(0).toUpperCase() + account.status.slice(1)}
          </Text>
        </View>

        {account.status === "running" && (
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` as any, backgroundColor: colors.running }]} />
          </View>
        )}

        {account.todayPoints > 0 && account.status !== "running" && (
          <Text style={[styles.points, { color: colors.textMuted }]}>
            {account.todayPoints.toLocaleString()} pts
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 14,
    padding: 10,
    marginVertical: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  runBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  progressBar: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: {
    height: "100%",
    borderRadius: 1,
  },
  points: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
