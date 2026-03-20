import * as Haptics from "expo-haptics";
import { Calendar, Clock, Play, RefreshCw, Search } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useSettings } from "@/context/SettingsContext";
import {
  cancelAllScheduledNotifications,
  getScheduledCount,
  requestNotificationPermission,
  scheduleRewardsNotifications,
} from "@/utils/notifications";

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const [scheduling, setScheduling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);

  const [searchCountText, setSearchCountText] = useState(
    String(settings.defaultSearchCount)
  );
  const [delayText, setDelayText] = useState(
    String(settings.searchDelay ?? 5)
  );

  const commitSearchCount = () => {
    const parsed = parseInt(searchCountText, 10);
    const clamped = isNaN(parsed) ? settings.defaultSearchCount : Math.max(5, Math.min(50, parsed));
    setSearchCountText(String(clamped));
    if (clamped !== settings.defaultSearchCount) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateSettings({ defaultSearchCount: clamped });
    }
  };

  const commitDelay = () => {
    const parsed = parseInt(delayText, 10);
    const clamped = isNaN(parsed) ? (settings.searchDelay ?? 5) : Math.max(3, Math.min(30, parsed));
    setDelayText(String(clamped));
    if (clamped !== (settings.searchDelay ?? 5)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateSettings({ searchDelay: clamped });
    }
  };

  // ── First run time editor ────────────────────────────────────────────────
  const { hour, minute } = settings.firstRunTime;
  const isAm = hour < 12;
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  const adjustHour = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let h = hour + delta;
    if (h < 0) h = 23;
    if (h > 23) h = 0;
    updateSettings({ firstRunTime: { hour: h, minute } });
    setScheduledCount(null);
  };

  const toggleAmPm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newHour = isAm ? hour + 12 : hour - 12;
    updateSettings({ firstRunTime: { hour: Math.max(0, Math.min(23, newHour)), minute } });
    setScheduledCount(null);
  };

  // ── Retry schedule (fixed) ───────────────────────────────────────────────
  const retryTimes = [
    { hour: 22, minute: 0, label: "10:00 PM" },
    { hour: 22, minute: 30, label: "10:30 PM" },
    { hour: 23, minute: 0, label: "11:00 PM" },
    { hour: 23, minute: 30, label: "11:30 PM" },
    { hour: 0, minute: 0, label: "12:00 AM (Final)" },
  ];

  // ── Apply Schedule ───────────────────────────────────────────────────────
  const handleApplySchedule = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Notifications require a real device.");
      return;
    }
    setScheduling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const granted = await requestNotificationPermission();
    if (!granted) {
      setScheduling(false);
      Alert.alert(
        "Permission Required",
        "Please allow notifications in your device settings so the schedule can alert you.",
        [{ text: "OK" }]
      );
      return;
    }

    const { scheduled } = await scheduleRewardsNotifications(
      settings.firstRunTime,
      retryTimes
    );
    setScheduledCount(scheduled);
    setScheduling(false);

    const fmt = (h: number, m: number) =>
      `${h % 12 === 0 ? 12 : h % 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

    Alert.alert(
      "Schedule Active ✓",
      `${scheduled} daily notification${scheduled !== 1 ? "s" : ""} scheduled.\n\nFirst run: ${fmt(settings.firstRunTime.hour, settings.firstRunTime.minute)}\n\nTap the notification when it fires — the app will start your run automatically.`,
      [{ text: "Got it" }]
    );
  };

  const handleClearSchedule = async () => {
    await cancelAllScheduledNotifications();
    setScheduledCount(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Schedule Cleared", "All scheduled notifications have been removed.", [{ text: "OK" }]);
  };

  const formatTime = (h: number, m: number) =>
    `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

  const inputStyle = [
    styles.numberInput,
    {
      color: colors.text,
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Configure automation behavior
          </Text>
        </View>

        <Section title="SEARCH" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <View style={[styles.iconBg, { backgroundColor: "#EFF6FF" }]}>
                  <Search size={16} color={colors.tint} />
                </View>
                <View style={styles.labelText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    Searches per account
                  </Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                    Daily Bing searches (5–50)
                  </Text>
                </View>
              </View>
              <TextInput
                style={inputStyle}
                value={searchCountText}
                onChangeText={setSearchCountText}
                onBlur={commitSearchCount}
                onSubmitEditing={commitSearchCount}
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={2}
                selectTextOnFocus
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <View style={[styles.iconBg, { backgroundColor: "#F0F9FF" }]}>
                  <Clock size={16} color="#0EA5E9" />
                </View>
                <View style={styles.labelText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    Delay between searches
                  </Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                    Seconds between each search (3–30)
                  </Text>
                </View>
              </View>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={inputStyle}
                  value={delayText}
                  onChangeText={setDelayText}
                  onBlur={commitDelay}
                  onSubmitEditing={commitDelay}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={[styles.unit, { color: colors.textMuted }]}>s</Text>
              </View>
            </View>
          </View>
        </Section>

        <Section title="SCHEDULE" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* First run time — editable */}
            <View style={[styles.settingRow, styles.settingRowBottom, { borderBottomColor: colors.border }]}>
              <View style={styles.settingLabel}>
                <View style={[styles.iconBg, { backgroundColor: "#FFF7ED" }]}>
                  <Play size={16} color={colors.warning} />
                </View>
                <View style={styles.labelText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    First Run
                  </Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                    Daily notification trigger
                  </Text>
                </View>
              </View>

              <View style={styles.timePicker}>
                <Pressable
                  onPress={() => adjustHour(-1)}
                  style={[styles.timeStepBtn, { backgroundColor: colors.surfaceSecondary }]}
                >
                  <Text style={[styles.timeStepText, { color: colors.text }]}>−</Text>
                </Pressable>
                <Text style={[styles.timeDisplay, { color: colors.text }]}>
                  {displayHour}:00
                </Text>
                <Pressable
                  onPress={() => adjustHour(1)}
                  style={[styles.timeStepBtn, { backgroundColor: colors.surfaceSecondary }]}
                >
                  <Text style={[styles.timeStepText, { color: colors.text }]}>+</Text>
                </Pressable>
                <Pressable
                  onPress={toggleAmPm}
                  style={[styles.amPmBtn, { backgroundColor: colors.tint }]}
                >
                  <Text style={styles.amPmText}>{isAm ? "AM" : "PM"}</Text>
                </Pressable>
              </View>
            </View>

            {/* Retry schedule — informational */}
            <View style={styles.retrySection}>
              <View style={styles.retryHeader}>
                <RefreshCw size={14} color={colors.running} />
                <Text style={[styles.retryLabel, { color: colors.textSecondary }]}>
                  Auto-retry schedule for failed accounts
                </Text>
              </View>
              {retryTimes.map((t, i) => (
                <View key={i} style={styles.retryItem}>
                  <View
                    style={[
                      styles.retryDot,
                      {
                        backgroundColor:
                          i === retryTimes.length - 1 ? colors.error : colors.running,
                      },
                    ]}
                  />
                  <Text style={[styles.retryTime, { color: colors.text }]}>
                    {t.label}
                  </Text>
                  {i === retryTimes.length - 1 && (
                    <View style={[styles.finalBadge, { backgroundColor: "#FEE2E2" }]}>
                      <Text style={[styles.finalText, { color: colors.error }]}>Final</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        </Section>

        <Section title="ACTIONS" colors={colors}>
          {scheduledCount !== null && (
            <View style={[styles.statusBanner, {
              backgroundColor: scheduledCount > 0 ? "#F0FDF4" : "#FFF7ED",
              borderColor: scheduledCount > 0 ? "#BBF7D0" : "#FDE68A",
            }]}>
              <Text style={{ color: scheduledCount > 0 ? "#166534" : "#92400E", fontSize: 13, fontFamily: "Inter_500Medium" }}>
                {scheduledCount > 0
                  ? `✓ ${scheduledCount} notification${scheduledCount !== 1 ? "s" : ""} scheduled`
                  : "No active notifications"}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleApplySchedule}
            disabled={scheduling}
            style={({ pressed }) => [
              styles.applyBtn,
              { backgroundColor: colors.tint, opacity: pressed || scheduling ? 0.75 : 1 },
            ]}
          >
            <Calendar size={18} color="#fff" />
            <Text style={styles.applyText}>
              {scheduling ? "Scheduling…" : "Apply Schedule"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleClearSchedule}
            style={({ pressed }) => [
              styles.clearBtn,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.clearText, { color: colors.textSecondary }]}>Clear Schedule</Text>
          </Pressable>

          {Platform.OS === "web" && (
            <Text style={[styles.webNote, { color: colors.textMuted }]}>
              Notifications require a real Android or iOS device
            </Text>
          )}
        </Section>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { borderRadius: 16, overflow: "hidden" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  settingRowBottom: {
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  settingLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  labelText: { flex: 1 },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  settingTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  settingDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  numberInput: {
    width: 56,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  inputWithUnit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unit: { fontSize: 14, fontFamily: "Inter_500Medium" },
  divider: { height: 1, marginHorizontal: 16 },
  // Time picker
  timePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeStepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  timeStepText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  timeDisplay: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    minWidth: 52,
    textAlign: "center",
  },
  amPmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  amPmText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  // Retry section
  retrySection: { padding: 16, paddingTop: 12, gap: 10 },
  retryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  retryLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  retryItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  retryDot: { width: 6, height: 6, borderRadius: 3 },
  retryTime: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  finalBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  finalText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  // Buttons
  statusBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 10,
  },
  applyText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  clearText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  webNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});
