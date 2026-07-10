import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ArrowLeft, Check, CreditCard, Crown, Link as LinkIcon, Loader, Sparkles } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

import { useCustomAlert } from "@/components/CustomAlert";
import Colors from "@/constants/colors";
import { API_BASE, useLicense } from "@/context/LicenseContext";

interface Tier {
  id: string;
  label: string;
  price: number;
  currency: string;
  period: string;
  features: string[];
}

interface PaymentMethod {
  id: string;
  label: string;
  details: string;
}

interface UpgradeRequest {
  id: string;
  requestedTier: string;
  status: "pending" | "approved" | "rejected";
  transactionId: string | null;
  receiptLink: string | null;
  adminNote: string | null;
  createdAt: string;
}

export default function UpgradeScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { licenseData, revalidate } = useLicense();
  const { showAlert, AlertComponent } = useCustomAlert();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);

  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [receiptLink, setReceiptLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentTier = licenseData?.keyType ?? "trial";
  const isTrial = currentTier === "trial";

  const loadConfigAndStatus = React.useCallback(async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const [configResp, statusResp] = await Promise.all([
        fetch(`${API_BASE}/config`),
        licenseData?.key
          ? fetch(`${API_BASE}/upgrade/status?key=${encodeURIComponent(licenseData.key)}`)
          : Promise.resolve(null),
      ]);
      if (!configResp.ok) throw new Error("Failed to load plans");
      const configData = await configResp.json();
      setTiers(configData.tiers ?? []);
      setPaymentMethods(configData.paymentMethods ?? []);
      if (statusResp && statusResp.ok) {
        const statusData = await statusResp.json();
        const fetchedRequests: UpgradeRequest[] = statusData.requests ?? [];
        setRequests(fetchedRequests);
        // If a request was approved since we last checked, our cached license
        // tier is stale — revalidate immediately so features/tier unlock
        // without waiting for the next natural revalidation cycle.
        if (fetchedRequests.some((r) => r.status === "approved") && licenseData?.keyType === "trial") {
          revalidate().catch(() => {});
        }
      }
    } catch (e: any) {
      setConfigError(e?.message || "Could not connect to server");
    } finally {
      setLoadingConfig(false);
    }
  }, [licenseData?.key]);

  useEffect(() => {
    loadConfigAndStatus();
  }, [loadConfigAndStatus]);

  const pendingRequest = requests.find((r) => r.status === "pending");

  const submitUpgrade = async () => {
    if (!licenseData?.key || !selectedTier) return;
    if (!transactionId.trim() && !receiptLink.trim()) {
      showAlert("Missing Proof of Payment", "Enter a Transaction ID or a Receipt Link so we can verify your payment.", [{ text: "OK" }]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/upgrade/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: licenseData.key,
          requestedTier: selectedTier,
          transactionId: transactionId.trim() || undefined,
          receiptLink: receiptLink.trim() || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        showAlert("Request Failed", data.error || "Could not submit upgrade request", [{ text: "OK" }]);
        return;
      }
      setTransactionId("");
      setReceiptLink("");
      setSelectedTier(null);
      await loadConfigAndStatus();
      showAlert("Request Submitted", "We've received your upgrade request. It will be reviewed shortly.", [{ text: "OK" }]);
    } catch {
      showAlert("Network Error", "Could not reach the server. Please try again.", [{ text: "OK" }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={({ pressed }) => [styles.backBtn, { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 }]}
          >
            <ArrowLeft size={18} color={colors.text} />
          </Pressable>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Upgrade Plan</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Current plan: <Text style={{ fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{currentTier}</Text>
            </Text>
          </View>
        </View>

        {!isTrial && (
          <View style={[styles.banner, { backgroundColor: "#16a34a15", borderColor: "#16a34a33" }]}>
            <Crown size={18} color="#16a34a" />
            <Text style={[styles.bannerText, { color: colors.text }]}>
              You're already on the {currentTier} plan. Contact support if you'd like to change plans.
            </Text>
          </View>
        )}

        {isTrial && pendingRequest && (
          <View style={[styles.banner, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b33" }]}>
            <Loader size={18} color="#f59e0b" />
            <Text style={[styles.bannerText, { color: colors.text }]}>
              Your request to upgrade to <Text style={{ fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{pendingRequest.requestedTier}</Text> is pending review.
            </Text>
          </View>
        )}

        {isTrial && requests.some((r) => r.status === "rejected") && !pendingRequest && (
          <View style={[styles.banner, { backgroundColor: "#ef444415", borderColor: "#ef444433" }]}>
            <Text style={[styles.bannerText, { color: colors.text }]}>
              Your last upgrade request was rejected
              {requests.find((r) => r.status === "rejected")?.adminNote
                ? `: ${requests.find((r) => r.status === "rejected")?.adminNote}`
                : "."}
              {" "}You can submit a new request below.
            </Text>
          </View>
        )}

        {loadingConfig ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : configError ? (
          <View style={{ paddingVertical: 40, alignItems: "center", paddingHorizontal: 24 }}>
            <Text style={{ color: colors.error, textAlign: "center", fontFamily: "Inter_500Medium" }}>{configError}</Text>
            <Pressable onPress={loadConfigAndStatus} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.tint, fontFamily: "Inter_600SemiBold" }}>Try Again</Text>
            </Pressable>
          </View>
        ) : isTrial ? (
          <>
            <Section title="CHOOSE A PLAN" colors={colors}>
              {tiers.map((tier) => {
                const selected = selectedTier === tier.id;
                return (
                  <Pressable
                    key={tier.id}
                    disabled={!!pendingRequest}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedTier(tier.id);
                    }}
                    style={({ pressed }) => [
                      styles.tierCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: selected ? colors.tint : colors.border,
                        borderWidth: selected ? 2 : 1,
                        opacity: pendingRequest ? 0.5 : pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Sparkles size={16} color={colors.tint} />
                        <Text style={[styles.tierLabel, { color: colors.text }]}>{tier.label}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.tierPrice, { color: colors.tint }]}>
                          {tier.currency} {tier.price}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>/ {tier.period}</Text>
                      </View>
                    </View>
                    <View style={{ marginTop: 10, gap: 5 }}>
                      {tier.features?.map((f, i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Check size={13} color={colors.success} />
                          <Text style={{ fontSize: 12.5, color: colors.textSecondary, fontFamily: "Inter_400Regular" }}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </Section>

            {paymentMethods.length > 0 && (
              <Section title="PAYMENT METHODS" colors={colors}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {paymentMethods.map((pm, i) => (
                    <View key={pm.id}>
                      <View style={styles.paymentRow}>
                        <CreditCard size={16} color={colors.tint} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.settingTitle, { color: colors.text }]}>{pm.label}</Text>
                          <Text style={[styles.settingDesc, { color: colors.textSecondary }]} selectable>
                            {pm.details}
                          </Text>
                        </View>
                      </View>
                      {i < paymentMethods.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    </View>
                  ))}
                </View>
              </Section>
            )}

            {!pendingRequest && (
              <Section title="SUBMIT PROOF OF PAYMENT" colors={colors}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 14, gap: 12 }]}>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Transaction ID</Text>
                    <TextInput
                      value={transactionId}
                      onChangeText={setTransactionId}
                      placeholder="e.g. TXN123456789"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.textInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                      autoCapitalize="characters"
                    />
                  </View>
                  <View>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Receipt Link</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <LinkIcon size={14} color={colors.textMuted} />
                      <TextInput
                        value={receiptLink}
                        onChangeText={setReceiptLink}
                        placeholder="https://..."
                        placeholderTextColor={colors.textMuted}
                        style={[styles.textInput, { flex: 1, color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                        autoCapitalize="none"
                        keyboardType="url"
                      />
                    </View>
                  </View>
                  <Pressable
                    disabled={!selectedTier || submitting}
                    onPress={submitUpgrade}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      {
                        backgroundColor: !selectedTier ? colors.border : pressed ? colors.tintDark : colors.tint,
                        opacity: submitting ? 0.7 : 1,
                      },
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.submitBtnText}>
                        {selectedTier ? `Request ${selectedTier} Upgrade` : "Select a plan above"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </Section>
            )}
          </>
        ) : null}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
      {AlertComponent}
    </KeyboardAvoidingView>
  );
}

function Section({ title, colors, children }: { title: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  tierCard: { borderRadius: 14, padding: 16, marginBottom: 10 },
  tierLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  tierPrice: { fontSize: 18, fontFamily: "Inter_700Bold" },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  paymentRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  settingTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  settingDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { height: 1, marginHorizontal: 14 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6 },
  textInput: { height: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
