import * as Haptics from "expo-haptics";
import * as Updates from "expo-updates";
import { CheckSquare, ChevronRight, Clock, Crown, Download, FlaskConical, Key, Moon, Search, Shield, Trash2, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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

import { router, useFocusEffect } from "expo-router";
import { useCustomAlert } from "@/components/CustomAlert";
import Colors from "@/constants/colors";
import { useAccounts } from "@/context/AccountsContext";
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
  const { accounts, addDemoAccount, removeAccount } = useAccounts();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [searchCountText, setSearchCountText] = useState(
    String(settings.defaultSearchCount)
  );
  const [delayText, setDelayText] = useState(String(settings.searchDelay ?? 5));
  const [licenseModalVisible, setLicenseModalVisible] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  // Overnight visibility is driven by the server-side backgroundEnabled flag so
  // the admin toggle affects all users, not just the admin's own device.
  const overnightFeatureEnabled = featureConfig.backgroundEnabled;

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
        {overnightFeatureEnabled && (
        <Section title="OVERNIGHT MODE" colors={colors}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/overnight");
            }}
            style={({ pressed }) => ({
              backgroundColor: colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {/* Header row */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
              <View style={[styles.iconBg, { backgroundColor: "#F5F3FF" }]}>
                <Moon size={16} color="#7C3AED" />
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>Overnight Schedule</Text>
                {settings.overnightSlots.length > 0 && (
                  <View style={{ backgroundColor: "#7C3AED18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#7C3AED" }}>
                      {settings.overnightSlots.length} active
                    </Text>
                  </View>
                )}
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border, marginHorizontal: 0 }]} />

            {/* Time chips or empty hint */}
            {settings.overnightSlots.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                {settings.overnightSlots.map((s, i) => (
                  <View
                    key={i}
                    style={{
                      backgroundColor: "#7C3AED15",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderWidth: 1,
                      borderColor: "#7C3AED30",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#7C3AED" }}>
                      {formatSlot(s)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                  No schedule set — tap to configure
                </Text>
              </View>
            )}
          </Pressable>
        </Section>
        )}


        <Section title="LICENSE" colors={colors}>
          <Pressable
            onPress={() => {
              if (licenseData) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLicenseModalVisible(true);
              }
            }}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed && licenseData ? 0.7 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>License Key</Text>
              <Text style={[styles.rowSublabel, { color: colors.textSecondary }]}>
                {licenseData ? `${licenseData.key.slice(0, 9)}...` : "Not activated"}
              </Text>
            </View>
            {licenseData ? (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.accent }}>
                  {licenseData.maxAccounts} account{licenseData.maxAccounts > 1 ? "s" : ""}
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>
                  Expires {new Date(licenseData.expiresAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            ) : null}
            {licenseData && <ChevronRight size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />}
          </Pressable>

          {licenseData?.keyType === "trial" && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/upgrade");
              }}
              style={({ pressed }) => ({
                marginTop: 10,
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: pressed ? "#6D28D9" : "#7C3AED",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Crown size={17} color="#fff" />
              <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                Upgrade Plan
              </Text>
            </Pressable>
          )}
        </Section>


        {/* ── UPDATES ───────────────────────────────────────── */}
        <Section title="UPDATES" colors={colors}>
          <Pressable
            onPress={async () => {
              if (checkingUpdate) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setCheckingUpdate(true);
              try {
                const result = await Updates.checkForUpdateAsync();
                if (result.isAvailable) {
                  showAlert(
                    "Update Available",
                    "A new version is ready. Restart to apply it.",
                    [
                      { text: "Later", style: "cancel" },
                      {
                        text: "Restart Now",
                        onPress: async () => {
                          await Updates.fetchUpdateAsync();
                          await Updates.reloadAsync();
                        },
                      },
                    ]
                  );
                } else {
                  showAlert("Up to Date", "You're running the latest version.", [{ text: "OK" }]);
                }
              } catch {
                showAlert("Check Failed", "Could not check for updates. Try again later.", [{ text: "OK" }]);
              } finally {
                setCheckingUpdate(false);
              }
            }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#16a34a" : "#22c55e",
              borderRadius: 14,
              paddingVertical: 15,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: checkingUpdate ? 0.7 : 1,
            })}
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Download size={18} color="#fff" />
            )}
            <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
              {checkingUpdate ? "Checking…" : "Check for Updates"}
            </Text>
          </Pressable>
        </Section>

        {/* ── DEVELOPER ─────────────────────────────────────── */}
        {isOwnerMode && (
          <Section title="DEVELOPER" colors={colors}>
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const demoNames = [
                    "Alex Johnson",
                    "Sam Rivera",
                    "Jordan Lee",
                    "Casey Morgan",
                    "Taylor Smith",
                  ];
                  const picked = demoNames[Math.floor(Math.random() * demoNames.length)];
                  const suffix = Math.floor(Math.random() * 9000 + 1000);
                  addDemoAccount({
                    name: picked,
                    email: `demo.${suffix}@example.com`,
                    avatarUrl: undefined,
                    lastRun: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
                    searchCount: 30,
                    dailySetEnabled: true,
                    enabled: true,
                    cookies: {},
                    totalPoints: Math.floor(Math.random() * 40000 + 5000),
                    todayPoints: Math.floor(Math.random() * 150 + 10),
                    searchesCompleted: Math.floor(Math.random() * 30),
                  });
                  showAlert("Demo Account Added", "A demo account has been added to the Home tab so you can preview the UI with populated data.", [{ text: "Got it" }]);
                }}
                style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.settingLabel}>
                  <View style={[styles.iconBg, { backgroundColor: "#F0FDF4" }]}>
                    <FlaskConical size={16} color="#16a34a" />
                  </View>
                  <View style={styles.labelText}>
                    <Text style={[styles.settingTitle, { color: colors.text }]}>
                      Add Demo Account
                    </Text>
                    <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                      Inject a fake account to preview the UI
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: "#16a34a18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#16a34a" }}>DEV</Text>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const demoAccounts = accounts.filter((a) => a.email.startsWith("demo.") && a.email.endsWith("@example.com"));
                  if (demoAccounts.length === 0) {
                    showAlert("No Demo Accounts", "There are no demo accounts to remove.", [{ text: "OK" }]);
                    return;
                  }
                  showAlert(
                    "Remove Demo Accounts",
                    `Remove ${demoAccounts.length} demo account${demoAccounts.length > 1 ? "s" : ""}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => {
                          demoAccounts.forEach((a) => removeAccount(a.id));
                        },
                      },
                    ]
                  );
                }}
                style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.settingLabel}>
                  <View style={[styles.iconBg, { backgroundColor: "#FFF1F2" }]}>
                    <Trash2 size={16} color="#e11d48" />
                  </View>
                  <View style={styles.labelText}>
                    <Text style={[styles.settingTitle, { color: colors.text }]}>
                      Clear Demo Accounts
                    </Text>
                    <Text style={[styles.settingDesc, { color: colors.textSecondary }]}>
                      Remove all injected demo accounts
                    </Text>
                  </View>
                </View>
                {accounts.filter((a) => a.email.startsWith("demo.") && a.email.endsWith("@example.com")).length > 0 && (
                  <View style={{ backgroundColor: "#e11d4818", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#e11d48" }}>
                      {accounts.filter((a) => a.email.startsWith("demo.") && a.email.endsWith("@example.com")).length}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Section>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* ── LICENSE DETAIL MODAL ─────────────────────────── */}
      <Modal
        visible={licenseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLicenseModalVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setLicenseModalVisible(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 24,
              paddingTop: 20,
              paddingBottom: insets.bottom + 28,
            }}
          >
            {/* Handle bar */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 20 }} />

            {/* Title row */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center" }}>
                  <Key size={16} color="#7C3AED" />
                </View>
                <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>License Details</Text>
              </View>
              <Pressable
                onPress={() => setLicenseModalVisible(false)}
                style={({ pressed }) => ({
                  width: 30, height: 30, borderRadius: 15,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center", justifyContent: "center",
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <X size={15} color={colors.textMuted} />
              </Pressable>
            </View>

            {licenseData && (
              <>
                {/* Key */}
                <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.6, marginBottom: 4 }}>LICENSE KEY</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.text, letterSpacing: 0.3 }} selectable>
                    {licenseData.key}
                  </Text>
                </View>

                {/* Stats grid */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.6, marginBottom: 6 }}>ACCOUNTS USED</Text>
                    <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text }}>
                      {accounts.length}
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                        /{licenseData.maxAccounts}
                      </Text>
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.6, marginBottom: 6 }}>PLAN</Text>
                    <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#7C3AED", textTransform: "capitalize" }}>
                      {licenseData.keyType ?? "Standard"}
                    </Text>
                    {licenseData.label ? (
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }}>{licenseData.label}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Dates */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                  <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.6, marginBottom: 4 }}>EXPIRES</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                      {new Date(licenseData.expiresAt).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.textMuted, letterSpacing: 0.6, marginBottom: 4 }}>LAST VERIFIED</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text }}>
                      {new Date(licenseData.validatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </Text>
                  </View>
                </View>

                {/* Remove button */}
                <Pressable
                  onPress={() => {
                    setLicenseModalVisible(false);
                    setTimeout(() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      showAlert(
                        "Remove License",
                        "Are you sure? You'll need to re-enter your key to use the app.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: removeLicense },
                        ]
                      );
                    }, 350);
                  }}
                  style={({ pressed }) => ({
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: pressed ? "#fef2f2" : "#fff5f5",
                    borderWidth: 1,
                    borderColor: "#fecaca",
                  })}
                >
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#ef4444" }}>Remove License</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
