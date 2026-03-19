import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { AccountStatus, useAccounts } from "@/context/AccountsContext";

const STATUS_COLORS: Record<AccountStatus, string> = {
  idle: "#9CA3AF",
  running: "#8B5CF6",
  done: "#22C55E",
  failed: "#EF4444",
};

const STATUS_LABELS: Record<AccountStatus, string> = {
  idle: "Idle",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

const STATUS_ICONS: Record<AccountStatus, keyof typeof Feather.glyphMap> = {
  idle: "clock",
  running: "refresh-cw",
  done: "check-circle",
  failed: "x-circle",
};

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { accounts, updateAccount, removeAccount, runAccount, isRunning, logs } = useAccounts();

  const account = accounts.find((a) => a.id === id);
  const accountLogs = logs.filter((l) => l.accountId === id).slice(0, 5);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(account?.name ?? "");
  const [editEmail, setEditEmail] = useState(account?.email ?? "");

  if (!account) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textSecondary }}>Account not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.tint }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      "Remove Account",
      `Are you sure you want to remove "${account.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeAccount(account.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          },
        },
      ]
    );
  };

  const handleSave = () => {
    if (!editName.trim()) return;
    updateAccount(account.id, { name: editName.trim(), email: editEmail.trim().toLowerCase() });
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRun = () => {
    if (isRunning || account.status === "running") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    runAccount(account.id);
  };

  const statusColor = STATUS_COLORS[account.status];
  const progressPercent = account.searchCount > 0 ? (account.searchesCompleted / account.searchCount) * 100 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={scheme === "dark" ? ["#1E3A5F", "#0F172A"] : ["#EFF6FF", "#F9FAFB"]}
        style={[styles.hero, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.heroHeader}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="x" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.heroActions}>
            <Pressable
              onPress={() => setEditing(!editing)}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name={editing ? "x" : "edit-2"} size={18} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="trash-2" size={18} color={colors.error} />
            </Pressable>
          </View>
        </View>

        <View style={styles.heroContent}>
          <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.bigAvatar}>
            <Text style={styles.bigAvatarText}>{account.name.charAt(0).toUpperCase()}</Text>
          </LinearGradient>

          {editing ? (
            <View style={styles.editForm}>
              <TextInput
                style={[styles.editInput, { color: colors.text, backgroundColor: colors.surface }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.editInput, { color: colors.text, backgroundColor: colors.surface }]}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.heroName, { color: colors.text }]}>{account.name}</Text>
              <Text style={[styles.heroEmail, { color: colors.textSecondary }]}>{account.email}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + "22" }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusLabel, { color: statusColor }]}>{STATUS_LABELS[account.status]}</Text>
              </View>
            </>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsGrid}>
          <StatCard icon="star" label="Today" value={String(account.todayPoints)} color={colors.warning} colors={colors} />
          <StatCard icon="award" label="Total" value={String(account.totalPoints)} color={colors.tint} colors={colors} />
          <StatCard icon="search" label="Searches" value={String(account.searchCount)} color={colors.success} colors={colors} />
        </View>

        {account.status === "running" && (
          <View style={[styles.progressCard, { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 16 }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressTitle, { color: colors.text }]}>In Progress</Text>
              <Text style={[styles.progressCount, { color: colors.running }]}>
                {account.searchesCompleted}/{account.searchCount}
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <Animated.View style={[styles.progressFill, { width: `${progressPercent}%` as any, backgroundColor: colors.running }]} />
            </View>
            <Text style={[styles.progressSub, { color: colors.textMuted }]}>
              Bing searches completed
            </Text>
          </View>
        )}

        <View style={[styles.section, { marginHorizontal: 16, marginBottom: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SESSION</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.configRow}>
              <View style={styles.configLeft}>
                <Feather
                  name={Object.keys(account.cookies).length > 0 ? "shield" : "shield-off"}
                  size={16}
                  color={Object.keys(account.cookies).length > 0 ? colors.success : colors.warning}
                />
                <View>
                  <Text style={[styles.configLabel, { color: colors.text }]}>
                    {Object.keys(account.cookies).length > 0 ? "Session Active" : "No Session"}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>
                    {Object.keys(account.cookies).length > 0
                      ? `${Object.keys(account.cookies).length} cookies stored`
                      : "Login required for automation"}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: "/login-webview", params: { accountId: account.id } })}
                style={({ pressed }) => [
                  {
                    backgroundColor: Object.keys(account.cookies).length > 0 ? colors.surfaceSecondary : colors.tint,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 20,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: Object.keys(account.cookies).length > 0 ? colors.tint : "#fff",
                }}>
                  {Object.keys(account.cookies).length > 0 ? "Re-login" : "Login"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.section, { marginHorizontal: 16, marginBottom: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CONFIGURATION</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <ConfigRow
              icon="search"
              label="Search count"
              value={`${account.searchCount} searches`}
              colors={colors}
              onDecrease={() => updateAccount(account.id, { searchCount: Math.max(5, account.searchCount - 5) })}
              onIncrease={() => updateAccount(account.id, { searchCount: Math.min(50, account.searchCount + 5) })}
              showCounter
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.configRow}>
              <View style={styles.configLeft}>
                <Feather name="check-square" size={16} color={colors.success} />
                <Text style={[styles.configLabel, { color: colors.text }]}>Daily Set</Text>
              </View>
              <Switch
                value={!!account.dailySetEnabled}
                onValueChange={(v) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateAccount(account.id, { dailySetEnabled: v });
                }}
                trackColor={{ false: colors.border, true: colors.tint }}
                thumbColor="#fff"
              />
            </View>
            {account.lastRun && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.configRow}>
                  <View style={styles.configLeft}>
                    <Feather name="clock" size={16} color={colors.textMuted} />
                    <Text style={[styles.configLabel, { color: colors.text }]}>Last run</Text>
                  </View>
                  <Text style={[styles.configValue, { color: colors.textSecondary }]}>
                    {formatDateTime(account.lastRun)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {accountLogs.length > 0 && (
          <View style={[styles.section, { marginHorizontal: 16, marginBottom: 16 }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>RECENT RUNS</Text>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {accountLogs.map((log, i) => (
                <View key={log.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.logRow}>
                    <View style={[styles.logDot, { backgroundColor: log.status === "success" ? colors.success : colors.error }]} />
                    <View style={styles.logInfo}>
                      <Text style={[styles.logTime, { color: colors.text }]}>{formatDateTime(log.timestamp)}</Text>
                      <Text style={[styles.logDetail, { color: colors.textSecondary }]}>
                        {log.searchesDone} searches · +{log.pointsEarned} pts
                      </Text>
                    </View>
                    <View style={[styles.logBadge, { backgroundColor: log.status === "success" ? "#DCFCE7" : "#FEE2E2" }]}>
                      <Text style={{ color: log.status === "success" ? colors.success : colors.error, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                        {log.status === "success" ? "Done" : "Failed"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      <View style={[styles.bottomBtn, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={handleRun}
          disabled={account.status === "running" || isRunning}
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        >
          <LinearGradient
            colors={account.status === "running" ? ["#6B7280", "#4B5563"] : ["#3B82F6", "#1D4ED8"]}
            style={[styles.runBtn, { opacity: account.status === "running" || isRunning ? 0.5 : 1 }]}
          >
            <Feather name={account.status === "running" ? "loader" : "play"} size={20} color="#fff" />
            <Text style={styles.runBtnText}>
              {account.status === "running" ? "Running..." : "Run Now"}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function StatCard({ icon, label, value, color, colors }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Feather name={icon} size={18} color={color} />
      <Text style={[styles.statVal, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function ConfigRow({ icon, label, value, colors, onDecrease, onIncrease, showCounter }: any) {
  return (
    <View style={styles.configRow}>
      <View style={styles.configLeft}>
        <Feather name={icon} size={16} color={colors.textMuted} />
        <Text style={[styles.configLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {showCounter ? (
        <View style={styles.miniCounter}>
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDecrease?.(); }}>
            <Feather name="minus" size={14} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.configValue, { color: colors.text }]}>{value}</Text>
          <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onIncrease?.(); }}>
            <Feather name="plus" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.configValue, { color: colors.textSecondary }]}>{value}</Text>
      )}
    </View>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
    " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingBottom: 24 },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
  bigAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  bigAvatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  heroName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  heroEmail: { fontSize: 14, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  editForm: { gap: 10, width: "100%" },
  editInput: {
    padding: 12,
    borderRadius: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    width: "100%",
    textAlign: "center",
  },
  saveBtn: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginVertical: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  statVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  progressCard: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  progressCount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  card: { borderRadius: 16, overflow: "hidden" },
  divider: { height: 1, marginHorizontal: 16 },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  configLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  configLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  configValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  miniCounter: { flexDirection: "row", alignItems: "center", gap: 12 },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  logDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logInfo: { flex: 1 },
  logTime: { fontSize: 13, fontFamily: "Inter_500Medium" },
  logDetail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  logBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  bottomBtn: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  runBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
