import * as Haptics from "expo-haptics";
import { Calendar, CheckSquare, Clock, Moon, RotateCcw, Search, Sun, Zap } from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { DEFAULT_OVERNIGHT_SLOTS, OvernightSlot, useSettings } from "@/context/SettingsContext";
import { useAppTheme } from "@/context/ThemeContext";
import {
  cancelAllScheduledNotifications,
  isNotificationsAvailable,
  requestNotificationPermission,
  scheduleOvernightNotifications,
} from "@/utils/notifications";

function to24h(hour12: number, isAm: boolean): number {
  if (isAm) return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function from24h(hour24: number): { hour: number; isAm: boolean } {
  return {
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    isAm: hour24 < 12,
  };
}

function formatSlot(slot: OvernightSlot): string {
  const { hour, isAm } = from24h(slot.hour);
  const mm = slot.minute.toString().padStart(2, "0");
  return `${hour}:${mm} ${isAm ? "AM" : "PM"}`;
}

const SLOT_LABELS = ["Run 1", "Run 2", "Run 3", "Run 4"];

function initHourTexts(slots: OvernightSlot[]): string[] {
  return slots.map((s) => String(from24h(s.hour).hour));
}
function initMinuteTexts(slots: OvernightSlot[]): string[] {
  return slots.map((s) => s.minute.toString().padStart(2, "0"));
}

export default function SettingsScreen() {
  const { scheme, themeMode, setThemeMode } = useAppTheme();
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const [scheduling, setScheduling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);

  const [searchCountText, setSearchCountText] = useState(
    String(settings.defaultSearchCount)
  );
  const [delayText, setDelayText] = useState(String(settings.searchDelay ?? 5));

  const [slotHourTexts, setSlotHourTexts] = useState<string[]>(() =>
    initHourTexts(settings.overnightSlots)
  );
  const [slotMinuteTexts, setSlotMinuteTexts] = useState<string[]>(() =>
    initMinuteTexts(settings.overnightSlots)
  );

  const [previousUserSlots, setPreviousUserSlots] = useState<OvernightSlot[] | null>(null);
  const isShowingDefaults = previousUserSlots !== null;

  const commitSearchCount = () => {
    const parsed = parseInt(searchCountText, 10);
    const clamped = isNaN(parsed)
      ? settings.defaultSearchCount
      : Math.max(5, Math.min(50, parsed));
    setSearchCountText(String(clamped));
    if (clamped !== settings.defaultSearchCount) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateSettings({ defaultSearchCount: clamped });
    }
  };

  const commitDelay = () => {
    const parsed = parseInt(delayText, 10);
    const clamped = isNaN(parsed)
      ? settings.searchDelay ?? 5
      : Math.max(3, Math.min(30, parsed));
    setDelayText(String(clamped));
    if (clamped !== (settings.searchDelay ?? 5)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateSettings({ searchDelay: clamped });
    }
  };

  // ── Slot hour ────────────────────────────────────────────────────────────
  const updateSlotHourText = (index: number, text: string) => {
    const next = [...slotHourTexts];
    next[index] = text;
    setSlotHourTexts(next);
  };

  const commitSlotHour = (index: number) => {
    const parsed = parseInt(slotHourTexts[index], 10);
    const clamped = isNaN(parsed) ? 12 : Math.max(1, Math.min(12, parsed));
    const next = [...slotHourTexts];
    next[index] = String(clamped);
    setSlotHourTexts(next);

    const slot = settings.overnightSlots[index];
    const { isAm } = from24h(slot.hour);
    const newHour24 = to24h(clamped, isAm);
    if (newHour24 !== slot.hour) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = [...settings.overnightSlots];
      updated[index] = { ...slot, hour: newHour24 };
      updateSettings({ overnightSlots: updated });
    }
  };

  // ── Slot minute ──────────────────────────────────────────────────────────
  const updateSlotMinuteText = (index: number, text: string) => {
    const next = [...slotMinuteTexts];
    next[index] = text;
    setSlotMinuteTexts(next);
  };

  const commitSlotMinute = (index: number) => {
    const parsed = parseInt(slotMinuteTexts[index], 10);
    const clamped = isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed));
    const next = [...slotMinuteTexts];
    next[index] = clamped.toString().padStart(2, "0");
    setSlotMinuteTexts(next);

    const slot = settings.overnightSlots[index];
    if (clamped !== slot.minute) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = [...settings.overnightSlots];
      updated[index] = { ...slot, minute: clamped };
      updateSettings({ overnightSlots: updated });
    }
  };

  // ── AM / PM ──────────────────────────────────────────────────────────────
  const toggleSlotAmPm = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const slot = settings.overnightSlots[index];
    const { hour, isAm } = from24h(slot.hour);
    const newHour24 = to24h(hour, !isAm);
    const updated = [...settings.overnightSlots];
    updated[index] = { ...slot, hour: newHour24 };
    updateSettings({ overnightSlots: updated });
    setScheduledCount(null);
  };

  // ── Default / Restore toggle ─────────────────────────────────────────────
  const handleDefaultToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isShowingDefaults) {
      setPreviousUserSlots([...settings.overnightSlots]);
      updateSettings({ overnightSlots: DEFAULT_OVERNIGHT_SLOTS });
      setSlotHourTexts(initHourTexts(DEFAULT_OVERNIGHT_SLOTS));
      setSlotMinuteTexts(initMinuteTexts(DEFAULT_OVERNIGHT_SLOTS));
    } else {
      const restored = previousUserSlots!;
      updateSettings({ overnightSlots: restored });
      setSlotHourTexts(initHourTexts(restored));
      setSlotMinuteTexts(initMinuteTexts(restored));
      setPreviousUserSlots(null);
    }
    setScheduledCount(null);
  };

  // ── Schedule actions ─────────────────────────────────────────────────────
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
        "Please allow notifications in your device settings so the overnight schedule can alert you.",
        [{ text: "OK" }]
      );
      return;
    }

    const { scheduled } = await scheduleOvernightNotifications(settings.overnightSlots);
    setScheduledCount(scheduled);
    setScheduling(false);

    const slotList = settings.overnightSlots
      .map((s, i) => `  Run ${i + 1}: ${formatSlot(s)}`)
      .join("\n");

    Alert.alert(
      "Overnight Schedule Active",
      `${scheduled} daily notification${scheduled !== 1 ? "s" : ""} scheduled.\n\n${slotList}\n\nTap the notification when it fires — the app will start automatically.`,
      [{ text: "Got it" }]
    );
  };

  const handleClearSchedule = async () => {
    await cancelAllScheduledNotifications();
    setScheduledCount(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Schedule Cleared", "All overnight notifications have been removed.", [
      { text: "OK" },
    ]);
  };

  const inputStyle = [
    styles.numberInput,
    {
      color: colors.text,
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border,
    },
  ];

  const slotInputStyle = [
    styles.slotInput,
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

        {/* ── APPEARANCE ───────────────────────────────────── */}
        <Section title="APPEARANCE" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* Title row */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <View style={[styles.iconBg, { backgroundColor: scheme === "dark" ? "#1E1B4B" : "#FEF9C3" }]}>
                  {scheme === "dark" ? (
                    <Moon size={16} color="#818CF8" />
                  ) : (
                    <Sun size={16} color="#F59E0B" />
                  )}
                </View>
                <View style={styles.labelText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>Theme</Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                    {themeMode === "system" ? "Follows device setting" : themeMode === "dark" ? "Always dark" : "Always light"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Full-width segment row */}
            <View style={[styles.themeSegmentRow, { backgroundColor: colors.surfaceSecondary }]}>
              {(["system", "light", "dark"] as const).map((mode) => {
                const active = themeMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setThemeMode(mode);
                    }}
                    style={[
                      styles.themeSegmentOption,
                      active && {
                        backgroundColor: colors.surface,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.12,
                        shadowRadius: 3,
                        elevation: 2,
                      },
                    ]}
                  >
                    {mode === "system" ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Sun size={13} color={active ? "#F59E0B" : colors.textMuted} />
                        <Moon size={13} color={active ? "#818CF8" : colors.textMuted} />
                      </View>
                    ) : mode === "light" ? (
                      <Sun size={14} color={active ? "#F59E0B" : colors.textMuted} />
                    ) : (
                      <Moon size={14} color={active ? "#818CF8" : colors.textMuted} />
                    )}
                    <Text style={[
                      styles.themeSegmentText,
                      { color: active ? colors.text : colors.textMuted },
                      active && { fontFamily: "Inter_600SemiBold" },
                    ]}>
                      {mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        {/* ── SEARCH ────────────────────────────────────────── */}
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

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <View style={[styles.iconBg, { backgroundColor: "#F5F3FF" }]}>
                  <CheckSquare size={16} color="#7C3AED" />
                </View>
                <View style={styles.labelText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    Daily Set
                  </Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                    {settings.dailySetEnabled
                      ? "Runs after searches & Daily Set button visible"
                      : "Searches only — Daily Set button hidden"}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.dailySetEnabled}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateSettings({ dailySetEnabled: val });
                }}
                trackColor={{ false: colors.border, true: "#7C3AED" }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </Section>

        {/* ── OVERNIGHT MODE ────────────────────────────────── */}
        <Section title="OVERNIGHT MODE" colors={colors}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>

            {/* Info banner */}
            <View style={[styles.infoBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <Moon size={14} color={colors.tint} />
              <Text style={[styles.infoText, { color: "#1E40AF" }]}>
                Microsoft resets search points at midnight. Runs before (10 PM, 11 PM) and after (1 AM, 2 AM) to maximize daily points.
              </Text>
            </View>

            {/* 4 slot rows */}
            {settings.overnightSlots.map((slot, i) => {
              const { isAm } = from24h(slot.hour);
              return (
                <View key={i}>
                  {i > 0 && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                  <View style={styles.slotRow}>
                    <View style={styles.slotLabelWrap}>
                      <View style={[styles.slotBadge, { backgroundColor: colors.surfaceSecondary }]}>
                        <Text style={[styles.slotBadgeText, { color: colors.textMuted }]}>
                          {i + 1}
                        </Text>
                      </View>
                      <Text style={[styles.slotLabel, { color: colors.textSecondary }]}>
                        {SLOT_LABELS[i]}
                      </Text>
                    </View>

                    <View style={styles.slotPicker}>
                      {/* Hour column */}
                      <View style={styles.slotInputCol}>
                        {i === 0 && (
                          <Text style={[styles.slotColLabel, { color: colors.textMuted }]}>Hour</Text>
                        )}
                        <TextInput
                          style={slotInputStyle}
                          value={slotHourTexts[i] ?? "12"}
                          onChangeText={(t) => updateSlotHourText(i, t)}
                          onBlur={() => commitSlotHour(i)}
                          onSubmitEditing={() => commitSlotHour(i)}
                          keyboardType="number-pad"
                          returnKeyType="next"
                          maxLength={2}
                          selectTextOnFocus
                        />
                      </View>

                      <Text style={[styles.colonSep, { color: colors.textMuted }, i === 0 && { marginTop: 17 }]}>:</Text>

                      {/* Minute column */}
                      <View style={styles.slotInputCol}>
                        {i === 0 && (
                          <Text style={[styles.slotColLabel, { color: colors.textMuted }]}>Min</Text>
                        )}
                        <TextInput
                          style={slotInputStyle}
                          value={slotMinuteTexts[i] ?? "00"}
                          onChangeText={(t) => updateSlotMinuteText(i, t)}
                          onBlur={() => commitSlotMinute(i)}
                          onSubmitEditing={() => commitSlotMinute(i)}
                          keyboardType="number-pad"
                          returnKeyType="done"
                          maxLength={2}
                          selectTextOnFocus
                        />
                      </View>

                      {/* AM / PM */}
                      <View style={i === 0 ? { marginTop: 17 } : undefined}>
                        <Pressable
                          onPress={() => toggleSlotAmPm(i)}
                          style={[
                            styles.amPmBtn,
                            { backgroundColor: isAm ? "#0EA5E9" : "#7C3AED" },
                          ]}
                        >
                          <Text style={styles.amPmText}>{isAm ? "AM" : "PM"}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Default / Restore toggle button */}
            <Pressable
              onPress={handleDefaultToggle}
              style={({ pressed }) => [
                styles.defaultBtn,
                {
                  backgroundColor: isShowingDefaults ? "#FFF7ED" : colors.surfaceSecondary,
                  borderColor: isShowingDefaults ? "#FDE68A" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              {isShowingDefaults ? (
                <RotateCcw size={15} color="#D97706" />
              ) : (
                <Zap size={15} color={colors.tint} />
              )}
              <Text
                style={[
                  styles.defaultBtnText,
                  { color: isShowingDefaults ? "#D97706" : colors.tint },
                ]}
              >
                {isShowingDefaults
                  ? "Restore my schedule"
                  : "Default  (10 PM · 11 PM · 1 AM · 2 AM)"}
              </Text>
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Daily Sets in overnight toggle */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabel}>
                <View style={[styles.iconBg, { backgroundColor: "#F5F3FF" }]}>
                  <CheckSquare size={16} color="#7C3AED" />
                </View>
                <View style={styles.labelText}>
                  <Text style={[styles.settingTitle, { color: colors.text }]}>
                    Daily Sets in overnight runs
                  </Text>
                  <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                    {settings.overnightDailySet
                      ? "Daily Set will run after searches"
                      : "Searches only — Daily Set skipped"}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.overnightDailySet}
                onValueChange={(val) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateSettings({ overnightDailySet: val });
                }}
                trackColor={{ false: colors.border, true: "#7C3AED" }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </Section>

        {/* ── SCHEDULE ACTIONS ──────────────────────────────── */}
        <Section title="SCHEDULE" colors={colors}>
          {!isNotificationsAvailable() ? (
            <View
              style={[
                styles.unavailableCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.unavailableTitle, { color: colors.text }]}>
                Scheduling unavailable in Expo Go
              </Text>
              <Text style={[styles.unavailableDesc, { color: colors.textSecondary }]}>
                Expo Go removed notification scheduling in SDK 53. To use the
                overnight schedule, you need a development build (EAS Build).
                Your times above are saved and will be used once you switch to a
                development build.
              </Text>
            </View>
          ) : (
            <>
              {scheduledCount !== null && (
                <View
                  style={[
                    styles.statusBanner,
                    {
                      backgroundColor: scheduledCount > 0 ? "#F0FDF4" : "#FFF7ED",
                      borderColor: scheduledCount > 0 ? "#BBF7D0" : "#FDE68A",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: scheduledCount > 0 ? "#166534" : "#92400E",
                      fontSize: 13,
                      fontFamily: "Inter_500Medium",
                    }}
                  >
                    {scheduledCount > 0
                      ? `✓ ${scheduledCount} overnight notification${scheduledCount !== 1 ? "s" : ""} scheduled`
                      : "No active notifications"}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handleApplySchedule}
                disabled={scheduling}
                style={({ pressed }) => [
                  styles.applyBtn,
                  {
                    backgroundColor: colors.tint,
                    opacity: pressed || scheduling ? 0.75 : 1,
                  },
                ]}
              >
                <Calendar size={18} color="#fff" />
                <Text style={styles.applyText}>
                  {scheduling ? "Scheduling…" : "Apply Overnight Schedule"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleClearSchedule}
                style={({ pressed }) => [
                  styles.clearBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.clearText, { color: colors.textSecondary }]}>
                  Clear Schedule
                </Text>
              </Pressable>
            </>
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
  unit: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 40, alignSelf: "center" },
  divider: { height: 1, marginHorizontal: 16 },
  // Overnight
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    margin: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 17,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  slotLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  slotBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  slotBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  slotLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  slotPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slotInput: {
    width: 44,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  colonSep: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginHorizontal: 1,
  },
  amPmBtn: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    marginLeft: 4,
  },
  amPmText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  defaultBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  defaultBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  // Schedule actions
  unavailableCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginBottom: 12,
  },
  unavailableTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  unavailableDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
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
  themeSegmentRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 14,
    gap: 4,
  },
  themeSegmentOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 9,
  },
  themeSegmentText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  slotInputCol: {
    alignItems: "center",
    gap: 2,
  },
  slotColLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
});
