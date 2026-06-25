import * as Haptics from "expo-haptics";
import * as Updates from "expo-updates";
import { CheckSquare, ChevronRight, Clock, Download, Moon, RefreshCw, Search, Shield } from "lucide-react-native";
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
import { OvernightSlot, useSettings } from "@/context/SettingsContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

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


export default function SettingsScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { licenseData, featureConfig, removeLicense, isOwnerMode, adminPanelVisible, revalidate, error: licenseError } = useLicense();
  const { showAlert, AlertComponent } = useCustomAlert();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [checkingLicense, setCheckingLicense] = useState(false);

  const [searchCountText, setSearchCountText] = useState(
    String(settings.defaultSearchCount)
  );
  const [delayText, setDelayText] = useState(String(settings.searchDelay ?? 5));


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

            {settings.dailySetEnabled && featureConfig.dailySetEnabled && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/daily-set-settings");
                  }}
                  style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={styles.settingLabel}>
                    <View style={[styles.iconBg, { backgroundColor: "#FFF7ED" }]}>
                      <Clock size={16} color="#F97316" />
                    </View>
                    <View style={styles.labelText}>
                      <Text style={[styles.settingTitle, { color: colors.text }]}>
                        Timing settings
                      </Text>
                      <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                        {settings.dsTimeoutInitialLoad ?? 30}s · {settings.dsTimeoutReturnLoad ?? 25}s · {settings.dsTimeoutCardScan ?? 20}s · {settings.dsTimeoutPostClick ?? 15}s
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </Pressable>
              </>
            )}
          </View>
        </Section>

        {/* ── OVERNIGHT MODE ────────────────────────────────── */}
        <Section title="OVERNIGHT MODE" colors={colors}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/overnight");
            }}
            style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.settingLabel}>
              <View style={[styles.iconBg, { backgroundColor: "#EFF6FF" }]}>
                <Moon size={16} color="#7C3AED" />
              </View>
              <View style={styles.labelText}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>
                  Overnight Schedule
                </Text>
                <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                  {settings.overnightSlots.map((s) => formatSlot(s)).join(" · ")}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        </Section>


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
              onPress={async () => {
                if (checkingLicense) return;
                setCheckingLicense(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await revalidate();
                setCheckingLicense(false);
                showAlert(
                  licenseError ? "License Error" : "License Updated",
                  licenseError ?? "Your license details have been refreshed from the server.",
                  [{ text: "OK" }]
                );
              }}
              style={({ pressed }) => [
                styles.clearBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: pressed || checkingLicense ? 0.7 : 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                },
              ]}
            >
              {checkingLicense ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <RefreshCw size={15} color="#3b82f6" />
              )}
              <Text style={[styles.clearText, { color: "#3b82f6" }]}>
                {checkingLicense ? "Checking…" : "Check for Update"}
              </Text>
            </Pressable>
          )}
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
