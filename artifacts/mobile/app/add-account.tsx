import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { AlertCircle, AlertTriangle, ArrowLeft, ChevronRight, Edit3, UserPlus, X } from "lucide-react-native";
import React, { useState } from "react";
import {
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
import { useAccounts } from "@/context/AccountsContext";
import { useLicense } from "@/context/LicenseContext";
import { useSettings } from "@/context/SettingsContext";

export default function AddAccountScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { accounts, addAccount } = useAccounts();
  const { licenseData, featureConfig } = useLicense();
  const { settings } = useSettings();
  const maxAccounts = featureConfig?.maxAccounts ?? licenseData?.maxAccounts ?? 999;

  const [showManual, setShowManual] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleLoginWithMicrosoft = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/login-webview");
  };

  const validateAndSaveManual = () => {
    if (accounts.length >= maxAccounts) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors({ email: `Account limit reached (${maxAccounts} max)` });
      return;
    }
    const errs: { name?: string; email?: string } = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email address";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addAccount({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      searchCount: settings.defaultSearchCount,
      dailySetEnabled: settings.dailySetEnabled,
      lastRun: null,
      cookies: {},
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header]}>
        <Text style={[styles.title, { color: colors.text }]}>Add Account</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <X size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {!showManual ? (
          <>
            <Pressable onPress={handleLoginWithMicrosoft} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
              <LinearGradient colors={["#1565C0", "#1976D2", "#2196F3"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loginCard}>
                <View style={styles.msLogo}>
                  <View style={styles.msGrid}>
                    <View style={[styles.msCell, { backgroundColor: "#F25022" }]} />
                    <View style={[styles.msCell, { backgroundColor: "#7FBA00" }]} />
                    <View style={[styles.msCell, { backgroundColor: "#00A4EF" }]} />
                    <View style={[styles.msCell, { backgroundColor: "#FFB900" }]} />
                  </View>
                </View>
                <View style={styles.loginCardText}>
                  <Text style={styles.loginCardTitle}>Sign in with Microsoft</Text>
                  <Text style={styles.loginCardSub}>Opens a secure Microsoft login. Cookies are captured automatically when you reach Rewards.</Text>
                </View>
                <ChevronRight size={20} color="rgba(255,255,255,0.8)" />
              </LinearGradient>
            </Pressable>

            <View style={[styles.stepsCard, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.stepsTitle, { color: colors.textSecondary }]}>HOW IT WORKS</Text>
              <Step number="1" text="Tap Sign in with Microsoft above" colors={colors} />
              <Step number="2" text="Log in with your Microsoft account credentials" colors={colors} />
              <Step number="3" text='When you reach Rewards, tap "Save Account"' colors={colors} />
              <Step number="4" text="Automation uses your session cookies to run daily searches" colors={colors} />
            </View>

            <View style={styles.orDivider}>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.orText, { color: colors.textMuted }]}>or</Text>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            </View>

            <Pressable
              onPress={() => setShowManual(true)}
              style={({ pressed }) => [styles.manualBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 }]}
            >
              <Edit3 size={16} color={colors.textSecondary} />
              <Text style={[styles.manualBtnText, { color: colors.textSecondary }]}>Add account without login (no cookies)</Text>
            </Pressable>

            <Text style={[styles.privacyNote, { color: colors.textMuted }]}>
              Cookies are stored locally on your device only. Nothing is sent to external servers.
            </Text>
          </>
        ) : (
          <>
            <Pressable onPress={() => setShowManual(false)} style={styles.backRow}>
              <ArrowLeft size={16} color={colors.tint} />
              <Text style={[styles.backText, { color: colors.tint }]}>Back</Text>
            </Pressable>

            <View style={[styles.warningBox, { backgroundColor: "#FEF3C7" }]}>
              <AlertTriangle size={14} color="#D97706" />
              <Text style={[styles.warningText, { color: "#92400E" }]}>
                Without login cookies, automation cannot authenticate with Microsoft. Use "Sign in with Microsoft" for full functionality.
              </Text>
            </View>

            <Field label="Display Name" error={errors.name} colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: errors.name ? colors.error : colors.border }]}
                value={name}
                onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: undefined })); }}
                placeholder="e.g. My Main Account"
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
                autoCapitalize="words"
              />
            </Field>

            <Field label="Microsoft Email" error={errors.email} colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: errors.email ? colors.error : colors.border }]}
                value={email}
                onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); }}
                placeholder="account@outlook.com"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>

            <Pressable
              onPress={validateAndSaveManual}
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}
            >
              <UserPlus size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Add Account</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ number, text, colors }: { number: string; text: string; colors: any }) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepNum, { backgroundColor: colors.tint + "22" }]}>
        <Text style={[styles.stepNumText, { color: colors.tint }]}>{number}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function Field({ label, error, colors, children }: { label: string; error?: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
      {error && (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  loginCard: { flexDirection: "row", alignItems: "center", padding: 20, borderRadius: 18, gap: 16 },
  msLogo: { width: 44, height: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  msGrid: { width: 28, height: 28, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  msCell: { width: 13, height: 13 },
  loginCardText: { flex: 1, gap: 4 },
  loginCardTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  loginCardSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  stepsCard: { borderRadius: 16, padding: 16, gap: 12 },
  stepsTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 2 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNumText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  stepText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, flex: 1, paddingTop: 3 },
  orDivider: { flexDirection: "row", alignItems: "center", gap: 12 },
  orLine: { flex: 1, height: 1 },
  orText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  manualBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  manualBtnText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  privacyNote: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12 },
  warningText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { padding: 14, borderRadius: 12, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 4 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
