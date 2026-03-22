import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { AlertCircle, AlertTriangle, ArrowLeft, Award, Calendar, CheckSquare, Clock, Edit2, RefreshCw, Search, Shield, ShieldOff, Smartphone, Star, Trash2, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
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
import { useAccounts } from "@/context/AccountsContext";

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, updateAccount, removeAccount } = useAccounts();
  const account = accounts.find((a) => a.id === id);

  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(account?.name ?? "");
  const [editEmail, setEditEmail] = useState(account?.email ?? "");
  const [editDailySet, setEditDailySet] = useState(account?.dailySetEnabled ?? true);

  useEffect(() => {
    if (account && !isEditing) {
      setEditName(account.name);
      setEditEmail(account.email);
      setEditDailySet(account.dailySetEnabled);
    }
  }, [account?.id, isEditing]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, []);

  if (!account) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <AlertCircle size={40} color={colors.textMuted} />
        <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>Account not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.tint }]}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const cookieCount = Object.keys(account.cookies ?? {}).length;
  const isSessionValid = cookieCount > 0;
  const hoursSinceRun = account.lastRun
    ? (Date.now() - new Date(account.lastRun).getTime()) / (1000 * 60 * 60)
    : null;
  const isSessionStale = hoursSinceRun !== null && hoursSinceRun > 24;

  const initial = account.name.charAt(0).toUpperCase();

  const handleSave = () => {
    if (!editName.trim()) {
      Alert.alert("Name required", "Please enter a name for this account.");
      return;
    }
    updateAccount(id, {
      name: editName.trim(),
      email: editEmail.trim(),
      dailySetEnabled: editDailySet,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditing(false);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert("Delete Account?", `Remove "${account.name}"? This will also clear all session cookies.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          router.dismiss();
          setTimeout(() => {
            removeAccount(id);
          }, 300);
        },
      },
    ]);
  };

  const handleRefreshSession = () => {
    router.push({ pathname: "/login-webview", params: { accountId: id } });
  };

  const handleRunNow = () => {
    router.push({ pathname: "/search-runner", params: { accountIds: JSON.stringify([id]) } });
  };

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim, backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={() => {
              if (isEditing) {
                setIsEditing(false);
                setEditName(account.name);
                setEditEmail(account.email);
                setEditDailySet(account.dailySetEnabled);
              } else {
                router.back();
              }
            }}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            {isEditing ? <X size={22} color={colors.textSecondary} /> : <ArrowLeft size={22} color={colors.text} />}
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{isEditing ? "Edit Account" : "Account"}</Text>
          <View style={styles.headerRight}>
            {isEditing ? (
              <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.saveBtnText, { color: colors.tint }]}>Save</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setIsEditing(true)} style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}>
                <Edit2 size={20} color={colors.text} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.profileSection}>
            <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </LinearGradient>
            {isEditing ? (
              <View style={styles.editNameBlock}>
                <TextInput
                  style={[styles.editNameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Display name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />
                <TextInput
                  style={[styles.editEmailInput, { color: colors.textSecondary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email address"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            ) : (
              <>
                <Text style={[styles.accountName, { color: colors.text }]}>{account.name}</Text>
                <Text style={[styles.accountEmail, { color: colors.textSecondary }]}>{account.email}</Text>
              </>
            )}
          </View>

          {!isEditing && (
            <View style={styles.statsRow}>
              <StatCard icon={<Search size={18} color={colors.tint} />} label="Searches done" value={`${account.searchesCompleted}`} bg={colors.surface} colors={colors} />
              <StatCard icon={<Star size={18} color={colors.warning} />} label="Today" value={`${account.todayPoints.toLocaleString()} pts`} bg={colors.surface} colors={colors} />
              <StatCard icon={<Award size={18} color="#8B5CF6" />} label="Total" value={`${account.totalPoints?.toLocaleString() ?? "—"} pts`} bg={colors.surface} colors={colors} />
            </View>
          )}

          <Card title="SESSION" colors={colors}>
            <View style={styles.sessionStatus}>
              <View style={styles.sessionStatusLeft}>
                {isSessionValid && !isSessionStale ? (
                  <Shield size={20} color={colors.success} />
                ) : isSessionValid && isSessionStale ? (
                  <Clock size={20} color={colors.warning} />
                ) : (
                  <ShieldOff size={20} color={colors.error} />
                )}
                <View>
                  <Text style={[styles.sessionStatusText, { color: colors.text }]}>
                    {!isSessionValid ? "No session cookies" : isSessionStale ? "Session may be expired" : "Session active"}
                  </Text>
                  <Text style={[styles.sessionStatusSub, { color: colors.textSecondary }]}>
                    {!isSessionValid
                      ? "Sign in to enable automation"
                      : `${cookieCount} cookies stored${isSessionStale ? " · Over 24h old" : ""}`}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={handleRefreshSession}
                style={({ pressed }) => [styles.sessionRefreshBtn, { backgroundColor: colors.tint + "18", opacity: pressed ? 0.7 : 1 }]}
              >
                <RefreshCw size={14} color={colors.tint} />
              </Pressable>
            </View>

            {(!isSessionValid || isSessionStale) && (
              <View style={[styles.sessionWarning, { backgroundColor: !isSessionValid ? "#FEE2E2" : "#FEF3C7" }]}>
                <AlertTriangle size={13} color={!isSessionValid ? colors.error : "#D97706"} />
                <Text style={[styles.sessionWarningText, { color: !isSessionValid ? "#991B1B" : "#92400E" }]}>
                  {!isSessionValid
                    ? 'Tap "Refresh Session" to log in via Microsoft sign-in flow.'
                    : "Session is older than 24 hours and may need refreshing."}
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleRefreshSession}
              style={({ pressed }) => [styles.refreshBtn, { borderColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}
            >
              <Smartphone size={15} color={colors.tint} />
              <Text style={[styles.refreshBtnText, { color: colors.tint }]}>
                {isSessionValid ? "Refresh Session" : "Sign In with Microsoft"}
              </Text>
            </Pressable>
          </Card>

          <Card title="CONFIGURATION" colors={colors}>
            <View style={styles.configRow}>
              <View style={styles.configLabel}>
                <CheckSquare size={16} color={colors.textMuted} />
                <Text style={[styles.configText, { color: colors.text }]}>Daily Set</Text>
              </View>
              {isEditing ? (
                <Switch
                  value={editDailySet}
                  onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditDailySet(v); }}
                  trackColor={{ false: colors.border, true: colors.tint }}
                  thumbColor="#fff"
                />
              ) : (
                <Text style={[styles.configValue, { color: colors.textSecondary }]}>{account.dailySetEnabled ? "Enabled" : "Disabled"}</Text>
              )}
            </View>

            {account.lastRun && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.configRow}>
                  <View style={styles.configLabel}>
                    <Calendar size={16} color={colors.textMuted} />
                    <Text style={[styles.configText, { color: colors.text }]}>Last run</Text>
                  </View>
                  <Text style={[styles.configValue, { color: colors.textSecondary }]}>
                    {new Date(account.lastRun).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </>
            )}
          </Card>

          {!isEditing && (
            <View style={styles.actions}>
              <Pressable
                onPress={handleRunNow}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <LinearGradient colors={["#3B82F6", "#1D4ED8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.runBtnGradient}>
                  <Search size={18} color="#fff" />
                  <Text style={styles.runBtnText}>Run Now</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [styles.deleteBtn, { borderColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
              >
                <Trash2 size={16} color={colors.error} />
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Account</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function Card({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.cardSection}>
      <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.cardBody, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function StatCard({ icon, label, value, bg, colors }: { icon: React.ReactNode; label: string; value: string; bg: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      {icon}
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerRight: { width: 64, alignItems: "flex-end" },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  scroll: { padding: 16, gap: 16 },
  profileSection: { alignItems: "center", gap: 8, paddingVertical: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  accountName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  accountEmail: { fontSize: 14, fontFamily: "Inter_400Regular" },
  editNameBlock: { width: "100%", gap: 10 },
  editNameInput: { fontSize: 18, fontFamily: "Inter_600SemiBold", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, textAlign: "center" },
  editEmailInput: { fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 4 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardSection: { gap: 8 },
  cardTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginLeft: 4 },
  cardBody: { borderRadius: 16, overflow: "hidden", padding: 16, gap: 12 },
  sessionStatus: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sessionStatusLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  sessionStatusText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sessionStatusSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  sessionRefreshBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sessionWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10 },
  sessionWarningText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1 },
  refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  refreshBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  configRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  configLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  configText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  configValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1 },
  counter: { flexDirection: "row", alignItems: "center", gap: 12 },
  counterBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  counterVal: { fontSize: 16, fontFamily: "Inter_700Bold", minWidth: 24, textAlign: "center" },
  actions: { gap: 12 },
  runBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14 },
  runBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14, borderWidth: 1.5 },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  backBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium" },
});
