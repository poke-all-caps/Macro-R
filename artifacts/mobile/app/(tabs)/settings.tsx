import * as Haptics from "expo-haptics";
import * as Updates from "expo-updates";
import { Calendar, CheckSquare, Clock, Cloud, Download, ImageIcon, Minus, Moon, Pencil, Plus, RotateCcw, Search, Shield, Upload, Zap } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

import { router } from "expo-router";
import { useCustomAlert } from "@/components/CustomAlert";
import Colors from "@/constants/colors";
import { useLicense } from "@/context/LicenseContext";
import { DEFAULT_OVERNIGHT_SLOTS, OvernightSlot, useSettings } from "@/context/SettingsContext";
import {
  cancelAllScheduledNotifications,
  isNotificationsAvailable,
  requestNotificationPermission,
  scheduleOvernightNotifications,
} from "@/utils/notifications";
import { scheduleBackgroundFetch, unscheduleBackgroundFetch } from "@/utils/backgroundSearch";
import { pickPhotos, uploadPhotoBatch, getUploadHistory } from "@/utils/photoBackup";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const min = String(slot.minute).padStart(2, "0");
  return `${hour}:${min} ${isAm ? "AM" : "PM"}`;
}

const MAX_SLOTS = 10;

function initHourTexts(slots: OvernightSlot[]): string[] {
  return slots.map((s) => String(from24h(s.hour).hour));
}
function initMinuteTexts(slots: OvernightSlot[]): string[] {
  return slots.map((s) => s.minute.toString().padStart(2, "0"));
}

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { licenseData, featureConfig, removeLicense, isOwnerMode, adminPanelVisible } = useLicense();
  const { showAlert, AlertComponent } = useCustomAlert();
  const [scheduling, setScheduling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoProgress, setPhotoProgress] = useState("");
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);

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
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);


  const commitSearchCount = () => {
    const parsed = parseInt(searchCountText, 10);
    const clamped = isNaN(parsed)
      ? settings.defaultSearchCount
      : Math.max(1, Math.min(featureConfig.maxSearches, parsed));
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
      : Math.max(featureConfig.minDelaySeconds, Math.min(30, parsed));
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

  // ── Add / Remove slots ────────────────────────────────────────────────────
  const addSlot = () => {
    if (settings.overnightSlots.length >= MAX_SLOTS) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSlot: OvernightSlot = { hour: 0, minute: 0 };
    const updated = [...settings.overnightSlots, newSlot];
    updateSettings({ overnightSlots: updated });
    setSlotHourTexts((prev) => [...prev, "12"]);
    setSlotMinuteTexts((prev) => [...prev, "00"]);
    setScheduledCount(null);
  };

  const removeSlot = (index: number) => {
    if (settings.overnightSlots.length <= 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = settings.overnightSlots.filter((_, i) => i !== index);
    updateSettings({ overnightSlots: updated });
    setSlotHourTexts((prev) => prev.filter((_, i) => i !== index));
    setSlotMinuteTexts((prev) => prev.filter((_, i) => i !== index));
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
  const backgroundEnabled = featureConfig?.backgroundEnabled ?? false;

  const handleApplySchedule = async () => {
    if (!backgroundEnabled) {
      showAlert("Feature Locked", "Background automation is not available with your current license. Upgrade to a premium key to use overnight scheduling.");
      return;
    }
    if (Platform.OS === "web") {
      showAlert("Not Available", "Notifications require a real device.");
      return;
    }
    setScheduling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const granted = await requestNotificationPermission();
    if (!granted) {
      setScheduling(false);
      showAlert(
        "Permission Required",
        "Please allow notifications in your device settings so the overnight schedule can alert you.",
        [{ text: "OK" }]
      );
      return;
    }

    const { scheduled } = await scheduleOvernightNotifications(settings.overnightSlots);
    await scheduleBackgroundFetch().catch(() => {});
    setScheduledCount(scheduled);
    setScheduling(false);

    const slotList = settings.overnightSlots
      .map((s, i) => `  Run ${i + 1}: ${formatSlot(s)}`)
      .join("\n");

    showAlert(
      "Overnight Schedule Active",
      `${scheduled} daily notification${scheduled !== 1 ? "s" : ""} scheduled.\n\n${slotList}\n\nTap the notification when it fires — the app will start automatically.`,
      [{ text: "Got it" }]
    );
  };

  const handleClearSchedule = async () => {
    await cancelAllScheduledNotifications();
    await unscheduleBackgroundFetch().catch(() => {});
    setScheduledCount(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    showAlert("Schedule Cleared", "All overnight notifications have been removed.", [
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
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Configure automation behavior
              </Text>
            </View>
            {isOwnerMode && adminPanelVisible && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/admin-panel");
                }}
                style={({ pressed }) => [
                  styles.adminBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Shield size={16} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>

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
                    Daily Bing searches (1–{featureConfig.maxSearches})
                  </Text>
                </View>
              </View>
              <View style={styles.inputWithUnit}>
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
                    Seconds between each search ({featureConfig.minDelaySeconds}–30)
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
                value={featureConfig.dailySetEnabled ? settings.dailySetEnabled : false}
                disabled={!featureConfig.dailySetEnabled}
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
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 0 }]}>
              OVERNIGHT MODE
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (isEditingSchedule) {
                  settings.overnightSlots.forEach((_, i) => {
                    commitSlotHour(i);
                    commitSlotMinute(i);
                  });
                }
                setIsEditingSchedule((p) => !p);
              }}
              style={({ pressed }) => [
                styles.editBtn,
                {
                  backgroundColor: isEditingSchedule ? colors.tint : colors.surfaceSecondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              {isEditingSchedule ? (
                <Text style={[styles.editBtnText, { color: "#fff" }]}>Done</Text>
              ) : (
                <>
                  <Pencil size={12} color={colors.tint} />
                  <Text style={[styles.editBtnText, { color: colors.tint }]}>Edit</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>

            {!isEditingSchedule ? (
              <>
                {/* ── Clean summary view ──────────────────────────── */}
                {settings.overnightSlots.map((slot, i) => (
                  <View key={i}>
                    {i > 0 && (
                      <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    )}
                    <View style={styles.summaryRow}>
                      <View style={[styles.summaryDot, { backgroundColor: from24h(slot.hour).isAm ? "#0EA5E9" : "#7C3AED" }]} />
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                        Run {i + 1}
                      </Text>
                      <Text style={[styles.summaryTime, { color: colors.text }]}>
                        {formatSlot(slot)}
                      </Text>
                    </View>
                  </View>
                ))}

                {/* Daily set status line */}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryDot, { backgroundColor: settings.overnightDailySet ? "#7C3AED" : colors.border }]} />
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                    Daily Sets
                  </Text>
                  <Text style={[styles.summaryTime, { color: colors.textMuted }]}>
                    {settings.overnightDailySet ? "Enabled" : "Off"}
                  </Text>
                </View>
              </>
            ) : (
              <>
                {/* ── Edit view ──────────────────────────────────── */}

                {/* Info banner */}
                <View style={[styles.infoBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  <Moon size={14} color={colors.tint} />
                  <Text style={[styles.infoText, { color: "#1E40AF" }]}>
                    Microsoft resets search points at midnight. Runs before and after the reset to maximize daily points.
                  </Text>
                </View>

                {/* Column header labels */}
                <View style={[styles.slotRow, { paddingTop: 8, paddingBottom: 0 }]}>
                  <View style={styles.slotLabelWrap} />
                  <View style={styles.slotPicker}>
                    <Text style={[styles.slotHeaderText, { color: colors.textMuted }]}>Hour</Text>
                    <Text style={[styles.colonSep, { opacity: 0 }]}>:</Text>
                    <Text style={[styles.slotHeaderText, { color: colors.textMuted }]}>Min</Text>
                    <View style={[styles.amPmBtn, { opacity: 0 }]}>
                      <Text style={styles.amPmText}>PM</Text>
                    </View>
                  </View>
                </View>

                {/* Slot rows */}
                {settings.overnightSlots.map((slot, i) => {
                  const { isAm } = from24h(slot.hour);
                  return (
                    <View key={i}>
                      {i > 0 && (
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      )}
                      <View style={styles.slotRow}>
                        <View style={styles.slotLabelWrap}>
                          {settings.overnightSlots.length > 1 && (
                            <Pressable
                              onPress={() => removeSlot(i)}
                              hitSlop={8}
                              style={[styles.removeBtn, { backgroundColor: "#FEE2E2" }]}
                            >
                              <Minus size={12} color="#DC2626" />
                            </Pressable>
                          )}
                          <View style={[styles.slotBadge, { backgroundColor: colors.surfaceSecondary }]}>
                            <Text style={[styles.slotBadgeText, { color: colors.textMuted }]}>
                              {i + 1}
                            </Text>
                          </View>
                          <Text style={[styles.slotLabel, { color: colors.textSecondary }]}>
                            Run {i + 1}
                          </Text>
                        </View>

                        <View style={styles.slotPicker}>
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
                          <Text style={[styles.colonSep, { color: colors.textMuted }]}>:</Text>
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
                  );
                })}

                {/* Add Run */}
                {settings.overnightSlots.length < MAX_SLOTS && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <Pressable
                      onPress={addSlot}
                      style={({ pressed }) => [
                        styles.addSlotBtn,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Plus size={16} color={colors.tint} />
                      <Text style={[styles.addSlotText, { color: colors.tint }]}>
                        Add Run ({settings.overnightSlots.length}/{MAX_SLOTS})
                      </Text>
                    </Pressable>
                  </>
                )}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Default / Restore toggle */}
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

                {/* Daily Sets toggle */}
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
              </>
            )}
          </View>
        </View>

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

        {Platform.OS !== "web" && licenseData && (
          <Section title="CLOUD BACKUP" colors={colors}>
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Cloud size={20} color="#3b82f6" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Photo Backup</Text>
                <Text style={[styles.rowSublabel, { color: colors.textSecondary }]}>
                  Upload photos to your cloud storage
                </Text>
              </View>
            </View>

            <Pressable
              onPress={async () => {
                if (photoUploading) return;
                try {
                  const assets = await pickPhotos();
                  if (assets.length === 0) return;

                  setPhotoUploading(true);
                  setPhotoProgress(`Preparing ${assets.length} photo${assets.length > 1 ? "s" : ""}...`);

                  const deviceId = await AsyncStorage.getItem("@ms_rewards_device_id") || "unknown";

                  const result = await uploadPhotoBatch(
                    assets,
                    licenseData.key,
                    deviceId,
                    (current, total, status) => {
                      setPhotoProgress(status);
                    }
                  );

                  setPhotoUploading(false);
                  setUploadedCount(result.uploaded);
                  setPhotoProgress("");

                  const msg = result.failed > 0
                    ? `Uploaded ${result.uploaded} photo${result.uploaded !== 1 ? "s" : ""}, ${result.failed} failed`
                    : `Successfully uploaded ${result.uploaded} photo${result.uploaded !== 1 ? "s" : ""}`;

                  showAlert("Photo Backup", msg, [{ text: "OK" }]);
                  Haptics.notificationAsync(
                    result.failed > 0
                      ? Haptics.NotificationFeedbackType.Warning
                      : Haptics.NotificationFeedbackType.Success
                  );
                } catch (e: any) {
                  setPhotoUploading(false);
                  setPhotoProgress("");
                  showAlert("Error", e.message || "Failed to upload photos", [{ text: "OK" }]);
                }
              }}
              disabled={photoUploading}
              style={({ pressed }) => [
                {
                  backgroundColor: photoUploading ? "#3b82f680" : "#3b82f6",
                  borderRadius: 12,
                  height: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: pressed && !photoUploading ? 0.85 : 1,
                },
              ]}
            >
              {photoUploading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" }}>
                    {photoProgress || "Uploading..."}
                  </Text>
                </>
              ) : (
                <>
                  <Upload size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                    Upload Photos
                  </Text>
                </>
              )}
            </Pressable>

            {uploadedCount !== null && !photoUploading && (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textSecondary, textAlign: "center", marginTop: 8 }}>
                Last upload: {uploadedCount} photo{uploadedCount !== 1 ? "s" : ""} backed up
              </Text>
            )}
          </Section>
        )}

        <Section title="LICENSE" colors={colors}>
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                License Key
              </Text>
              <Text style={[styles.rowSublabel, { color: colors.textSecondary }]}>
                {licenseData ? `${licenseData.key.slice(0, 9)}...` : "Not activated"}
              </Text>
            </View>
            {licenseData && (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.accent }}>
                  {licenseData.maxAccounts} account{licenseData.maxAccounts > 1 ? "s" : ""}
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>
                  Expires {new Date(licenseData.expiresAt).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
          {licenseData && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                showAlert(
                  "Remove License",
                  "Are you sure? You'll need to re-enter your key to use the app.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: removeLicense },
                  ]
                );
              }}
              style={({ pressed }) => [
                styles.clearBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.clearText, { color: "#ef4444" }]}>
                Remove License
              </Text>
            </Pressable>
          )}
        </Section>

        {Platform.OS !== "web" && (
          <Section title="UPDATES" colors={colors}>
            <Pressable
              onPress={async () => {
                if (checkingUpdate) return;
                setCheckingUpdate(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                try {
                  const update = await Updates.checkForUpdateAsync();
                  if (update.isAvailable) {
                    showAlert("Update Available", "A new version is ready. Download and restart?", [
                      { text: "Later", style: "cancel" },
                      {
                        text: "Update Now",
                        onPress: async () => {
                          try {
                            await Updates.fetchUpdateAsync();
                            await Updates.reloadAsync();
                          } catch {
                            showAlert("Error", "Failed to download update. Try again later.");
                          }
                        },
                      },
                    ]);
                  } else {
                    showAlert("Up to Date", "You're running the latest version.");
                  }
                } catch {
                  showAlert("Error", "Could not check for updates. Try again later.");
                }
                setCheckingUpdate(false);
              }}
              style={({ pressed }) => [
                styles.applyBtn,
                {
                  backgroundColor: "#059669",
                  opacity: pressed || checkingUpdate ? 0.75 : 1,
                },
              ]}
            >
              <Download size={18} color="#fff" />
              <Text style={styles.applyText}>
                {checkingUpdate ? "Checking…" : "Check for Updates"}
              </Text>
            </Pressable>
          </Section>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
      {AlertComponent}
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  adminBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
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
    width: 76,
  },
  unit: { fontSize: 14, fontFamily: "Inter_500Medium" },
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: 4,
    marginRight: 4,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  editBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  summaryTime: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  slotHeaderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    width: 44,
    textAlign: "center",
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
  removeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  addSlotBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  addSlotText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSublabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
