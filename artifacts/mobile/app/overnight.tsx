import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { AlertTriangle, ArrowLeft, Battery, Bell, Calendar, CheckSquare, Clock, Minus, Moon, Plus, RotateCcw, Zap } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
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

import { useCustomAlert } from "@/components/CustomAlert";
import Colors from "@/constants/colors";
import { useLicense } from "@/context/LicenseContext";
import { DEFAULT_OVERNIGHT_SLOTS, OvernightSlot, useSettings } from "@/context/SettingsContext";
import {
  cancelAllScheduledNotifications,
  checkNotificationPermission,
  isNotificationsAvailable,
  requestBatteryOptimizationExemption,
  requestDisplayOverApps,
  requestExactAlarmPermission,
  requestFullScreenIntent,
  requestNotificationPermission,
  scheduleOvernightNotifications,
  showOvernightPersistentNotification,
  dismissOvernightPersistentNotification,
} from "@/utils/notifications";
import { scheduleBackgroundFetch, unscheduleBackgroundFetch } from "@/utils/backgroundSearch";

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

function initHourTexts(slots: OvernightSlot[]): string[] {
  return slots.map((s) => String(from24h(s.hour).hour));
}
function initMinuteTexts(slots: OvernightSlot[]): string[] {
  return slots.map((s) => s.minute.toString().padStart(2, "0"));
}

const MAX_SLOTS = 10;

export default function OvernightScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { featureConfig } = useLicense();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [scheduling, setScheduling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [previousUserSlots, setPreviousUserSlots] = useState<OvernightSlot[] | null>(null);

  type PermStatus = "granted" | "denied" | "undetermined";
  const [notifPerm, setNotifPerm] = useState<PermStatus>("undetermined");
  const [batteryOpened, setBatteryOpened] = useState(false);
  const [alarmOpened, setAlarmOpened] = useState(false);
  const [overlayOpened, setOverlayOpened] = useState(false);
  const [fullScreenOpened, setFullScreenOpened] = useState(false);

  const refreshPerms = useCallback(async () => {
    if (Platform.OS !== "android") return;
    const n = await checkNotificationPermission();
    setNotifPerm(n);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPerms();
    }, [refreshPerms])
  );

  const handleGrantAll = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (notifPerm !== "granted") {
      await requestNotificationPermission();
    }
    await requestBatteryOptimizationExemption();
    setBatteryOpened(true);
    await requestExactAlarmPermission();
    setAlarmOpened(true);
    await requestDisplayOverApps();
    setOverlayOpened(true);
    await requestFullScreenIntent();
    setFullScreenOpened(true);
    await refreshPerms();
  };
  const isShowingDefaults = previousUserSlots !== null;

  const [slotHourTexts, setSlotHourTexts] = useState<string[]>(() =>
    initHourTexts(settings.overnightSlots)
  );
  const [slotMinuteTexts, setSlotMinuteTexts] = useState<string[]>(() =>
    initMinuteTexts(settings.overnightSlots)
  );

  const backgroundEnabled = featureConfig?.backgroundEnabled ?? false;

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
      showAlert("Permission Required", "Please allow notifications in your device settings so the overnight schedule can alert you.", [{ text: "OK" }]);
      return;
    }
    const { scheduled } = await scheduleOvernightNotifications(settings.overnightSlots);
    await scheduleBackgroundFetch().catch(() => {});
    await showOvernightPersistentNotification(settings.overnightSlots).catch(() => {});
    setScheduledCount(scheduled);
    setScheduling(false);
    const slotList = settings.overnightSlots.map((s, i) => `  Run ${i + 1}: ${formatSlot(s)}`).join("\n");

    const missingPerms = Platform.OS === "android" && (!batteryOpened || !alarmOpened || !overlayOpened || !fullScreenOpened);
    showAlert(
      "Overnight Schedule Active",
      `${scheduled} daily alarm${scheduled !== 1 ? "s" : ""} set.\n\n${slotList}\n\nA status notification will stay in your notification bar with quick Search and Edit Schedule buttons.\n\nSearches will also run automatically in the background at these times — even if the app is closed.${missingPerms ? "\n\n⚠️ Some permissions haven't been granted yet. Scroll up and tap 'Grant All' to avoid Android blocking overnight runs." : ""}`,
      [{ text: missingPerms ? "Grant Permissions" : "Got it", onPress: missingPerms ? handleGrantAll : undefined }]
    );
  };

  const handleClearSchedule = async () => {
    await cancelAllScheduledNotifications();
    await unscheduleBackgroundFetch().catch(() => {});
    await dismissOvernightPersistentNotification().catch(() => {});
    setScheduledCount(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    showAlert("Schedule Cleared", "All overnight notifications have been removed.", [{ text: "OK" }]);
  };

  const slotInputStyle = [
    styles.slotInput,
    { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {AlertComponent}
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>Overnight Mode</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Schedule automatic runs while you sleep
            </Text>
          </View>
        </View>

        {/* Schedule section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SCHEDULE</Text>
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
                <Text style={[styles.editBtnText, { color: colors.tint }]}>Edit</Text>
              )}
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {!isEditingSchedule ? (
              <>
                {settings.overnightSlots.map((slot, i) => (
                  <View key={i}>
                    {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    <View style={styles.summaryRow}>
                      <View style={[styles.summaryDot, { backgroundColor: from24h(slot.hour).isAm ? "#0EA5E9" : "#7C3AED" }]} />
                      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Run {i + 1}</Text>
                      <Text style={[styles.summaryTime, { color: colors.text }]}>{formatSlot(slot)}</Text>
                    </View>
                  </View>
                ))}
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryDot, { backgroundColor: settings.overnightDailySet ? "#7C3AED" : colors.border }]} />
                  <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Daily Sets</Text>
                  <Text style={[styles.summaryTime, { color: colors.textMuted }]}>
                    {settings.overnightDailySet ? "Enabled" : "Off"}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.infoBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
                  <Moon size={14} color={colors.tint} />
                  <Text style={[styles.infoText, { color: "#1E40AF" }]}>
                    Microsoft resets search points at midnight. Runs before and after the reset to maximize daily points.
                  </Text>
                </View>

                <View style={[styles.slotRow, { paddingTop: 8, paddingBottom: 0 }]}>
                  <View style={styles.slotLabelWrap} />
                  <View style={styles.slotPicker}>
                    <Text style={[styles.slotHeaderText, { color: colors.textMuted }]}>Hour</Text>
                    <Text style={[styles.colonSep, { opacity: 0 }]}>:</Text>
                    <Text style={[styles.slotHeaderText, { color: colors.textMuted }]}>Min</Text>
                    <View style={[styles.amPmBtn, { opacity: 0 }]}><Text style={styles.amPmText}>PM</Text></View>
                  </View>
                </View>

                {settings.overnightSlots.map((slot, i) => {
                  const { isAm } = from24h(slot.hour);
                  return (
                    <View key={i}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                      <View style={styles.slotRow}>
                        <View style={styles.slotLabelWrap}>
                          {settings.overnightSlots.length > 1 && (
                            <Pressable onPress={() => removeSlot(i)} hitSlop={8} style={[styles.removeBtn, { backgroundColor: "#FEE2E2" }]}>
                              <Minus size={12} color="#DC2626" />
                            </Pressable>
                          )}
                          <View style={[styles.slotBadge, { backgroundColor: colors.surfaceSecondary }]}>
                            <Text style={[styles.slotBadgeText, { color: colors.textMuted }]}>{i + 1}</Text>
                          </View>
                          <Text style={[styles.slotLabel, { color: colors.textSecondary }]}>Run {i + 1}</Text>
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
                            style={[styles.amPmBtn, { backgroundColor: isAm ? "#0EA5E9" : "#7C3AED" }]}
                          >
                            <Text style={styles.amPmText}>{isAm ? "AM" : "PM"}</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {settings.overnightSlots.length < MAX_SLOTS && (
                  <>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <Pressable onPress={addSlot} style={({ pressed }) => [styles.addSlotBtn, { opacity: pressed ? 0.7 : 1 }]}>
                      <Plus size={16} color={colors.tint} />
                      <Text style={[styles.addSlotText, { color: colors.tint }]}>
                        Add Run ({settings.overnightSlots.length}/{MAX_SLOTS})
                      </Text>
                    </Pressable>
                  </>
                )}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

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
                  {isShowingDefaults ? <RotateCcw size={15} color="#D97706" /> : <Zap size={15} color={colors.tint} />}
                  <Text style={[styles.defaultBtnText, { color: isShowingDefaults ? "#D97706" : colors.tint }]}>
                    {isShowingDefaults ? "Restore my schedule" : "Default  (10 PM · 11 PM · 1 AM · 2 AM)"}
                  </Text>
                </Pressable>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <View style={styles.settingRow}>
                  <View style={styles.settingLabel}>
                    <View style={[styles.iconBg, { backgroundColor: "#F5F3FF" }]}>
                      <CheckSquare size={16} color="#7C3AED" />
                    </View>
                    <View style={styles.labelText}>
                      <Text style={[styles.settingTitle, { color: colors.text }]}>Daily Sets in overnight runs</Text>
                      <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                        {settings.overnightDailySet ? "Daily Set will run after searches" : "Searches only — Daily Set skipped"}
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

        {/* Permissions — Android only */}
        {Platform.OS === "android" && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>REQUIRED PERMISSIONS</Text>
              <Pressable
                onPress={handleGrantAll}
                style={({ pressed }) => [
                  styles.editBtn,
                  { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.editBtnText, { color: "#fff" }]}>Grant All</Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {/* Notifications */}
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (notifPerm === "denied") {
                    // Already denied — Android won't show dialog again, go to Settings
                    Linking.openSettings();
                  } else {
                    await requestNotificationPermission();
                  }
                  await refreshPerms();
                }}
                style={({ pressed }) => [styles.permRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.permIconBg, { backgroundColor: notifPerm === "granted" ? "#F0FDF4" : "#FFF7ED" }]}>
                  <Bell size={16} color={notifPerm === "granted" ? "#16A34A" : "#D97706"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.permTitle, { color: colors.text }]}>Notifications</Text>
                  <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                    {notifPerm === "granted"
                      ? "Granted — schedule can fire alerts"
                      : notifPerm === "denied"
                      ? "Denied — tap to open Settings and enable manually"
                      : "Tap to allow notifications for schedule alerts"}
                  </Text>
                </View>
                <View style={[styles.permBadge, {
                  backgroundColor: notifPerm === "granted" ? "#DCFCE7" : notifPerm === "denied" ? "#FEE2E2" : "#FEF3C7"
                }]}>
                  <Text style={[styles.permBadgeText, {
                    color: notifPerm === "granted" ? "#16A34A" : notifPerm === "denied" ? "#B91C1C" : "#92400E"
                  }]}>
                    {notifPerm === "granted" ? "✓ On" : notifPerm === "denied" ? "Blocked" : "Allow"}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Battery optimization */}
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await requestBatteryOptimizationExemption();
                  setBatteryOpened(true);
                }}
                style={({ pressed }) => [styles.permRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.permIconBg, { backgroundColor: batteryOpened ? "#F0FDF4" : "#FFF7ED" }]}>
                  <Battery size={16} color={batteryOpened ? "#16A34A" : "#D97706"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.permTitle, { color: colors.text }]}>Battery Optimization</Text>
                  <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                    {batteryOpened ? "Setting opened — tap to re-open if needed" : "Tap to exempt this app so Android doesn't kill background tasks"}
                  </Text>
                </View>
                <View style={[styles.permBadge, { backgroundColor: batteryOpened ? "#DCFCE7" : "#FEF3C7" }]}>
                  <Text style={[styles.permBadgeText, { color: batteryOpened ? "#16A34A" : "#92400E" }]}>
                    {batteryOpened ? "✓ Done" : "Open"}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Exact alarm */}
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await requestExactAlarmPermission();
                  setAlarmOpened(true);
                }}
                style={({ pressed }) => [styles.permRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.permIconBg, { backgroundColor: alarmOpened ? "#F0FDF4" : "#FFF7ED" }]}>
                  <Clock size={16} color={alarmOpened ? "#16A34A" : "#D97706"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.permTitle, { color: colors.text }]}>Exact Alarm (Android 12+)</Text>
                  <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                    {alarmOpened ? "Setting opened — enable to allow precise schedule timing" : "Allows searches to start at the exact scheduled time"}
                  </Text>
                </View>
                <View style={[styles.permBadge, { backgroundColor: alarmOpened ? "#DCFCE7" : "#FEF3C7" }]}>
                  <Text style={[styles.permBadgeText, { color: alarmOpened ? "#16A34A" : "#92400E" }]}>
                    {alarmOpened ? "✓ Done" : "Open"}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Display over other apps */}
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await requestDisplayOverApps();
                  setOverlayOpened(true);
                }}
                style={({ pressed }) => [styles.permRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.permIconBg, { backgroundColor: overlayOpened ? "#F0FDF4" : "#FFF7ED" }]}>
                  <Moon size={16} color={overlayOpened ? "#16A34A" : "#D97706"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.permTitle, { color: colors.text }]}>Display Over Other Apps</Text>
                  <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                    {overlayOpened ? "Setting opened — enable to allow overlay on other apps" : "Allows the app to show alerts on top of other running apps"}
                  </Text>
                </View>
                <View style={[styles.permBadge, { backgroundColor: overlayOpened ? "#DCFCE7" : "#FEF3C7" }]}>
                  <Text style={[styles.permBadgeText, { color: overlayOpened ? "#16A34A" : "#92400E" }]}>
                    {overlayOpened ? "✓ Done" : "Open"}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Full-screen notifications */}
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await requestFullScreenIntent();
                  setFullScreenOpened(true);
                }}
                style={({ pressed }) => [styles.permRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.permIconBg, { backgroundColor: fullScreenOpened ? "#F0FDF4" : "#FFF7ED" }]}>
                  <Zap size={16} color={fullScreenOpened ? "#16A34A" : "#D97706"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.permTitle, { color: colors.text }]}>Full-Screen Notifications (Android 14+)</Text>
                  <Text style={[styles.permDesc, { color: colors.textSecondary }]}>
                    {fullScreenOpened ? "Setting opened — enable to allow full-screen alerts when screen is locked" : "Shows overnight run alerts on your lock screen even when the phone is asleep"}
                  </Text>
                </View>
                <View style={[styles.permBadge, { backgroundColor: fullScreenOpened ? "#DCFCE7" : "#FEF3C7" }]}>
                  <Text style={[styles.permBadgeText, { color: fullScreenOpened ? "#16A34A" : "#92400E" }]}>
                    {fullScreenOpened ? "✓ Done" : "Open"}
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Build notice */}
            <View style={[styles.buildNotice, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
              <AlertTriangle size={14} color="#2563EB" />
              <Text style={[styles.buildNoticeText, { color: "#1E40AF" }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>New build required</Text>
                {" — background search, foreground service, and exact alarms require a development build (EAS Build). These features do not work in Expo Go."}
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ACTIONS</Text>

          {!isNotificationsAvailable() ? (
            <View style={[styles.unavailableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.unavailableTitle, { color: colors.text }]}>Scheduling unavailable in Expo Go</Text>
              <Text style={[styles.unavailableDesc, { color: colors.textSecondary }]}>
                Expo Go removed notification scheduling in SDK 53. To use the overnight schedule, you need a development build (EAS Build).
              </Text>
            </View>
          ) : (
            <>
              {scheduledCount !== null && (
                <View style={[styles.statusBanner, {
                  backgroundColor: scheduledCount > 0 ? "#F0FDF4" : "#FFF7ED",
                  borderColor: scheduledCount > 0 ? "#BBF7D0" : "#FDE68A",
                }]}>
                  <Text style={{ color: scheduledCount > 0 ? "#166534" : "#92400E", fontSize: 13, fontFamily: "Inter_500Medium" }}>
                    {scheduledCount > 0
                      ? `✓ ${scheduledCount} overnight notification${scheduledCount !== 1 ? "s" : ""} scheduled`
                      : "No active notifications"}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handleApplySchedule}
                disabled={scheduling}
                style={({ pressed }) => [styles.applyBtn, { backgroundColor: colors.tint, opacity: pressed || scheduling ? 0.75 : 1 }]}
              >
                <Calendar size={18} color="#fff" />
                <Text style={styles.applyText}>{scheduling ? "Scheduling…" : "Apply Overnight Schedule"}</Text>
              </Pressable>

              <Pressable
                onPress={handleClearSchedule}
                style={({ pressed }) => [styles.clearBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.clearText, { color: colors.textSecondary }]}>Clear Schedule</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  card: { borderRadius: 16, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  summaryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryTime: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  infoBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, margin: 12, borderRadius: 10, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  slotRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  slotLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  slotBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  slotBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  slotLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  slotHeaderText: { width: 48, textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium" },
  slotPicker: { flexDirection: "row", alignItems: "center", gap: 4 },
  slotInput: { width: 48, height: 38, borderRadius: 8, borderWidth: 1, textAlign: "center", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  colonSep: { fontSize: 18, fontFamily: "Inter_600SemiBold", width: 12, textAlign: "center" },
  amPmBtn: { paddingHorizontal: 10, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  amPmText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  removeBtn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addSlotBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  addSlotText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  defaultBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, marginHorizontal: 12, marginBottom: 4, borderRadius: 10, borderWidth: 1 },
  defaultBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  settingLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBg: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  labelText: { flex: 1 },
  settingTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  settingDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  editBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 16, marginBottom: 10 },
  applyText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  clearBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  clearText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  statusBanner: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  unavailableCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 6 },
  unavailableTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  unavailableDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  permRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 16, gap: 12 },
  permIconBg: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  permTitle: { fontSize: 13, fontFamily: "Inter_500Medium" },
  permDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1, lineHeight: 15 },
  permBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  permBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  buildNotice: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, marginTop: 10, borderRadius: 10, borderWidth: 1 },
  buildNoticeText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
