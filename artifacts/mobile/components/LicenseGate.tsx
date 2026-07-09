import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Lock,
  KeyRound,
  ScanLine,
  Image as ImageIcon,
  X,
  Download,
  ShieldCheck,
  UserPlus,
  Ticket,
  Clock,
  CheckCircle2,
  ChevronRight,
  IdCard,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
} from "lucide-react-native";
import { CameraView, Camera as ExpoCamera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Updates from "expo-updates";
import { useLicense } from "@/context/LicenseContext";
import { useAccounts } from "@/context/AccountsContext";
import { useKyc, type KycStatus } from "@/context/KycContext";
import { API_BASE } from "@/utils/apiUrl";
import Colors from "@/constants/colors";

type GateStep =
  | "gateway"
  | "invite"
  | "kyc-form"
  | "kyc-pending"
  | "kyc-resolved"
  | "license";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const license = useLicense();
  const { isLicensed, isLoading, error, activateKey, pinRequired, pinIsNew, submitPin } = license;
  const { hydrateFromServer } = useAccounts();
  const kyc = useKyc();
  const scheme = useColorScheme() ?? "dark";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  // ── existing license / PIN state ────────────────────────────────────────────
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // ── gateway / KYC state ─────────────────────────────────────────────────────
  const [gateStep, setGateStep] = useState<GateStep>("gateway");
  const [gateReady, setGateReady] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteValidating, setInviteValidating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [kycEmail, setKycEmail] = useState("");
  const [kycFullName, setKycFullName] = useState("");
  const [kycFatherName, setKycFatherName] = useState("");
  const [kycMotherName, setKycMotherName] = useState("");
  const [kycGrandfatherName, setKycGrandfatherName] = useState("");
  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycRefreshing, setKycRefreshing] = useState(false);

  // ── initialise gate step from stored KYC status ─────────────────────────────
  useEffect(() => {
    if (!kyc.isLoaded) return;
    if (kyc.kycStatus === "pending") setGateStep("kyc-pending");
    else if (kyc.kycStatus === "rejected") setGateStep("kyc-pending");
    else if (kyc.kycStatus === "verified") setGateStep("kyc-resolved");
    setGateReady(true);
  }, [kyc.isLoaded]);

  // ── update check ────────────────────────────────────────────────────────────
  const handleCheckUpdate = async () => {
    if (checkingUpdate || Platform.OS === "web") return;
    setCheckingUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          "Update Available",
          "A new version is ready. Download and install now?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Update Now",
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  await Updates.reloadAsync();
                } catch {
                  Alert.alert("Error", "Failed to download update. Try again later.");
                }
              },
            },
          ],
        );
      } else {
        Alert.alert("Up to Date", "You're already running the latest version.");
      }
    } catch {
      Alert.alert("Error", "Could not check for updates. Try again later.");
    }
    setCheckingUpdate(false);
  };

  // ── loading ──────────────────────────────────────────────────────────────────
  if (isLoading || !gateReady) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (isLicensed) return <>{children}</>;

  // ── PIN step ─────────────────────────────────────────────────────────────────
  const handleSubmitPin = async () => {
    if (pinInput.length !== 4 || pinSubmitting) return;
    setPinSubmitting(true);
    setPinError(null);
    const result = await submitPin(pinInput);
    if (result.success) {
      if (result.serverAccounts && result.serverAccounts.length > 0) {
        await hydrateFromServer(result.serverAccounts);
      }
    } else {
      setPinError(result.error ?? "Invalid PIN");
    }
    setPinSubmitting(false);
  };

  if (pinRequired) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.iconContainer, { backgroundColor: "#3b82f620" }]}>
              <ShieldCheck size={40} color="#3b82f6" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              {pinIsNew ? "Create Your PIN" : "Enter Your PIN"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {pinIsNew
                ? "Set a 4-digit PIN to protect your license key. This PIN will be required on future logins."
                : "Enter your 4-digit PIN to unlock the app."}
            </Text>
            <View style={[styles.inputContainer, { marginBottom: 0 }]}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: pinError ? "#ef4444" : colors.border,
                    borderRadius: 12,
                    color: colors.text,
                    letterSpacing: 12,
                    fontSize: 28,
                    textAlign: "center",
                    fontWeight: "700",
                    height: 60,
                    paddingHorizontal: 0,
                  },
                ]}
                placeholder="••••"
                placeholderTextColor={colors.textSecondary}
                value={pinInput}
                onChangeText={(t) => { setPinInput(t.replace(/\D/g, "").slice(0, 4)); setPinError(null); }}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSubmitPin}
              />
            </View>
            {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: pinInput.length === 4 ? "#3b82f6" : colors.border, opacity: pressed ? 0.85 : 1, marginTop: 20 },
              ]}
              onPress={handleSubmitPin}
              disabled={pinInput.length !== 4 || pinSubmitting}
            >
              {pinSubmitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>{pinIsNew ? "Set PIN & Continue" : "Unlock"}</Text>
              }
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── invite code validation ───────────────────────────────────────────────────
  const handleValidateInvite = async () => {
    const code = inviteInput.trim().toUpperCase();
    if (!code || inviteValidating) return;
    setInviteValidating(true);
    setInviteError(null);
    try {
      const res = await fetch(`${API_BASE}/invite/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.valid) {
        setInviteError(data.error ?? "Invalid invite code");
        return;
      }
      if (data.status === "unused") {
        setGateStep("kyc-form");
      } else if (data.kycStatus === "pending") {
        await kyc.setKycData(code, "pending");
        setGateStep("kyc-pending");
      } else if (data.kycStatus === "verified") {
        await kyc.setKycData(code, "verified");
        setGateStep("kyc-resolved");
      } else if (data.kycStatus === "rejected") {
        await kyc.setKycData(code, "rejected", data.adminNote ?? null);
        setGateStep("kyc-pending");
      } else {
        setInviteError("This code has already been used.");
      }
    } catch {
      setInviteError("Network error. Check your connection and try again.");
    } finally {
      setInviteValidating(false);
    }
  };

  // ── KYC image picker ─────────────────────────────────────────────────────────
  // Only PNG/JPEG source images are accepted, and every photo is re-encoded
  // as a resized, compressed JPEG before it ever gets set into state or sent
  // to the server. This keeps request payloads small (protects the API's body
  // size limit and the DB) and guarantees a single, predictable image format.
  const ALLOWED_PICKER_TYPES = ["image/png", "image/jpeg", "image/jpg"];
  const MAX_ID_IMAGE_DIMENSION = 1600;

  const compressIdImage = async (uri: string, mimeType?: string): Promise<string | null> => {
    if (mimeType && !ALLOWED_PICKER_TYPES.includes(mimeType.toLowerCase())) {
      Alert.alert("Unsupported File Type", "Please select a PNG or JPEG image.");
      return null;
    }
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_ID_IMAGE_DIMENSION } }],
        {
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );
      if (!manipulated.base64) return null;
      return `data:image/jpeg;base64,${manipulated.base64}`;
    } catch {
      Alert.alert("Image Error", "Could not process that image. Please try another one.");
      return null;
    }
  };

  const pickIdImage = (side: "front" | "back") => {
    Alert.alert("Add ID Photo", `Select source for the ${side} of your ID`, [
      {
        text: "Take Photo",
        onPress: async () => {
          if (Platform.OS !== "web") {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Required", "Camera access is needed to take a photo.");
              return;
            }
          }
          const result = await ImagePicker.launchCameraAsync({
            quality: 0.7,
            allowsEditing: true,
          });
          const asset = result.assets?.[0];
          if (!result.canceled && asset?.uri) {
            const uri = await compressIdImage(asset.uri, asset.mimeType);
            if (!uri) return;
            if (side === "front") setIdFront(uri);
            else setIdBack(uri);
          }
        },
      },
      {
        text: "Choose from Gallery",
        onPress: async () => {
          if (Platform.OS !== "web") {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Required", "Gallery access is needed to select a photo.");
              return;
            }
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.7,
            allowsEditing: true,
          });
          const asset = result.assets?.[0];
          if (!result.canceled && asset?.uri) {
            const uri = await compressIdImage(asset.uri, asset.mimeType);
            if (!uri) return;
            if (side === "front") setIdFront(uri);
            else setIdBack(uri);
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // ── KYC form submission ──────────────────────────────────────────────────────
  const handleKycSubmit = async () => {
    if (!kycEmail.trim() || !kycFullName.trim() || !kycFatherName.trim() || !kycMotherName.trim() || !kycGrandfatherName.trim()) {
      setKycError("All fields, including your email, are required.");
      return;
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(kycEmail.trim())) {
      setKycError("Please enter a valid email address.");
      return;
    }
    if (!idFront || !idBack) {
      setKycError("Both front and back ID photos are required.");
      return;
    }
    setKycSubmitting(true);
    setKycError(null);
    try {
      const res = await fetch(`${API_BASE}/invite/kyc-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: inviteInput.trim().toUpperCase(),
          email: kycEmail.trim().toLowerCase(),
          fullName: kycFullName.trim(),
          fatherName: kycFatherName.trim(),
          motherName: kycMotherName.trim(),
          grandfatherName: kycGrandfatherName.trim(),
          idFront,
          idBack,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKycError(data.error ?? "Submission failed. Please try again.");
        return;
      }
      await kyc.setKycData(inviteInput.trim().toUpperCase(), "pending");
      setGateStep("kyc-pending");
    } catch {
      setKycError("Network error. Check your connection and try again.");
    } finally {
      setKycSubmitting(false);
    }
  };

  // ── KYC status refresh ───────────────────────────────────────────────────────
  const handleRefreshKycStatus = async () => {
    setKycRefreshing(true);
    const { status } = await kyc.refreshStatus();
    if (status === "verified") setGateStep("kyc-resolved");
    setKycRefreshing(false);
  };

  // ── license entry handlers ───────────────────────────────────────────────────
  const handleActivate = async () => {
    if (!keyInput.trim() || submitting) return;
    setSubmitting(true);
    await activateKey(keyInput);
    setSubmitting(false);
  };

  const activateScanned = async (key: string) => {
    const cleaned = key.trim().toUpperCase();
    setKeyInput(cleaned);
    setSubmitting(true);
    await activateKey(cleaned);
    setSubmitting(false);
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setShowScanner(false);
    activateScanned(data);
  };

  const openScanner = async () => {
    if (Platform.OS !== "web") {
      const { granted } = await ExpoCamera.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access in your device settings to scan QR codes.",
          [{ text: "OK" }],
        );
        return;
      }
    }
    setScanned(false);
    setShowScanner(true);
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      Alert.alert(
        "QR Code from Image",
        "Please enter the license key shown in the QR code image manually, or use the camera scanner for automatic detection.",
        [{ text: "OK" }],
      );
    } catch {
      Alert.alert("Error", "Failed to open gallery");
    }
  };

  // ── GATEWAY step ─────────────────────────────────────────────────────────────
  if (gateStep === "gateway") {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: "#3b82f620" }]}>
            <Lock size={44} color="#3b82f6" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Welcome</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            How would you like to get started?
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.gatewayCard,
              { backgroundColor: "#3b82f6", opacity: pressed ? 0.85 : 1, marginBottom: 12 },
            ]}
            onPress={() => setGateStep("invite")}
          >
            <View style={styles.gatewayCardIcon}>
              <UserPlus size={22} color="#fff" />
            </View>
            <View style={styles.gatewayCardText}>
              <Text style={styles.gatewayCardTitle}>I'm a New User</Text>
              <Text style={styles.gatewayCardSub}>Register with an invite code</Text>
            </View>
            <ChevronRight size={20} color="#ffffffaa" />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.gatewayCard,
              { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => setGateStep("license")}
          >
            <View style={[styles.gatewayCardIcon, { backgroundColor: "#3b82f620" }]}>
              <KeyRound size={22} color="#3b82f6" />
            </View>
            <View style={styles.gatewayCardText}>
              <Text style={[styles.gatewayCardTitle, { color: colors.text }]}>I'm an Existing User</Text>
              <Text style={[styles.gatewayCardSub, { color: colors.textSecondary }]}>Enter your license key</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── INVITE CODE step ─────────────────────────────────────────────────────────
  if (gateStep === "invite") {
    return (
      <>
        <Pressable
          style={[styles.backBtnFloating, { top: insets.top + 12 }]}
          onPress={() => setGateStep("gateway")}
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
          <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
        </Pressable>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: "#8b5cf620" }]}>
              <Ticket size={40} color="#8b5cf6" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Enter Invite Code</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              You need a valid invite code to register
            </Text>

            <View style={styles.inputContainer}>
              <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: inviteError ? "#ef4444" : colors.border }]}>
                <Ticket size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="XXXXXXXX"
                  placeholderTextColor={colors.textSecondary}
                  value={inviteInput}
                  onChangeText={(t) => { setInviteInput(t.toUpperCase()); setInviteError(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleValidateInvite}
                />
              </View>
              {inviteError ? <Text style={styles.errorText}>{inviteError}</Text> : null}
              <Pressable
                onPress={handleValidateInvite}
                disabled={inviteValidating || !inviteInput.trim()}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: "#8b5cf6", opacity: (inviteValidating || !inviteInput.trim()) ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                {inviteValidating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.buttonText}>Verify Code</Text>}
              </Pressable>
            </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </>
    );
  }

  // ── KYC FORM step ────────────────────────────────────────────────────────────
  if (gateStep === "kyc-form") {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.backBtn} onPress={() => setGateStep("invite")}>
            <ArrowLeft size={20} color={colors.textSecondary} />
            <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
          </Pressable>

          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <View style={[styles.iconContainer, { backgroundColor: "#10b98120" }]}>
              <IdCard size={40} color="#10b981" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Identity Verification</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Please provide your details and a photo of your national ID
            </Text>
          </View>

          <View style={{ marginBottom: 14 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email Address</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                value={kycEmail}
                onChangeText={setKycEmail}
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
            <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>
              We'll email you your license key here once approved
            </Text>
          </View>

          {[
            { label: "Full Name", value: kycFullName, setter: setKycFullName, placeholder: "As it appears on your ID" },
            { label: "Father's Name", value: kycFatherName, setter: setKycFatherName, placeholder: "Father's full name" },
            { label: "Mother's Name", value: kycMotherName, setter: setKycMotherName, placeholder: "Mother's full name" },
            { label: "Grandfather's Name", value: kycGrandfatherName, setter: setKycGrandfatherName, placeholder: "Grandfather's full name" },
          ].map(({ label, value, setter, placeholder }) => (
            <View key={label} style={{ marginBottom: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textSecondary}
                  value={value}
                  onChangeText={setter}
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>
          ))}

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 8 }]}>ID Photo — Front</Text>
          <Pressable
            style={({ pressed }) => [
              styles.photoBox,
              { backgroundColor: colors.card, borderColor: idFront ? "#10b981" : colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => pickIdImage("front")}
          >
            {idFront ? (
              <Image source={{ uri: idFront }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <>
                <IdCard size={32} color={colors.textSecondary} />
                <Text style={[styles.photoBoxText, { color: colors.textSecondary }]}>Tap to add front photo</Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>ID Photo — Back</Text>
          <Pressable
            style={({ pressed }) => [
              styles.photoBox,
              { backgroundColor: colors.card, borderColor: idBack ? "#10b981" : colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => pickIdImage("back")}
          >
            {idBack ? (
              <Image source={{ uri: idBack }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <>
                <IdCard size={32} color={colors.textSecondary} />
                <Text style={[styles.photoBoxText, { color: colors.textSecondary }]}>Tap to add back photo</Text>
              </>
            )}
          </Pressable>

          {kycError ? <Text style={[styles.errorText, { marginTop: 12 }]}>{kycError}</Text> : null}

          <Pressable
            onPress={handleKycSubmit}
            disabled={kycSubmitting}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: "#10b981", marginTop: 20, opacity: kycSubmitting ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            {kycSubmitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.buttonText}>Submit Application</Text>}
          </Pressable>
        </ScrollView>
      </TouchableWithoutFeedback>
    );
  }

  // ── KYC PENDING / REJECTED step ──────────────────────────────────────────────
  if (gateStep === "kyc-pending") {
    const isRejected = kyc.kycStatus === "rejected";
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: isRejected ? "#ef444420" : "#f59e0b20" }]}>
            {isRejected
              ? <AlertCircle size={44} color="#ef4444" />
              : <Clock size={44} color="#f59e0b" />}
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {isRejected ? "Application Rejected" : "Application Under Review"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {isRejected
              ? "Your application was not approved. Please see the reason below."
              : "We're reviewing your information. This typically takes 24–48 hours."}
          </Text>

          {isRejected && kyc.adminNote ? (
            <View style={[styles.noteBox, { backgroundColor: "#ef444415", borderColor: "#ef4444" }]}>
              <Text style={[styles.noteTitle, { color: "#ef4444" }]}>Reason</Text>
              <Text style={[styles.noteBody, { color: colors.text }]}>{kyc.adminNote}</Text>
            </View>
          ) : null}

          {!isRejected ? (
            <Pressable
              onPress={handleRefreshKycStatus}
              disabled={kycRefreshing}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: "#f59e0b", opacity: kycRefreshing ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {kycRefreshing
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <RefreshCw size={18} color="#fff" />
                    <Text style={styles.buttonText}>Check Status</Text>
                  </View>
                )}
            </Pressable>
          ) : null}

          <Pressable
            onPress={async () => {
              await kyc.clearKyc();
              setInviteInput("");
              setGateStep("gateway");
            }}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
              {isRejected ? "Start Over" : "Use a Different Code"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── KYC RESOLVED / VERIFIED step ─────────────────────────────────────────────
  if (gateStep === "kyc-resolved") {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: "#10b98120" }]}>
            <CheckCircle2 size={44} color="#10b981" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Identity Verified!</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Your KYC has been approved. Please enter your license key to access the app.
          </Text>
          <Pressable
            onPress={() => setGateStep("license")}
            style={({ pressed }) => [styles.button, { backgroundColor: "#10b981", opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.buttonText}>Enter License Key</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── LICENSE ENTRY step (gateStep === "license" or default) ───────────────────
  return (
    <>
      <Pressable
        style={[styles.backBtnFloating, { top: insets.top + 12 }]}
        onPress={() => setGateStep("gateway")}
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
        <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
      </Pressable>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.content}>
            <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
              <Lock size={48} color="#3b82f6" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>License Required</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Enter your license key or scan a QR code
            </Text>

            <View style={styles.inputContainer}>
              <View
                style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: error ? "#ef4444" : colors.border }]}
              >
                <KeyRound size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="XX88XX-XXXX-XXXX-XXXX"
                  placeholderTextColor={colors.textSecondary}
                  value={keyInput}
                  onChangeText={setKeyInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleActivate}
                />
                {Platform.OS !== "web" && (
                  <Pressable onPress={openScanner} style={{ padding: 4 }}>
                    <ScanLine size={22} color="#3b82f6" />
                  </Pressable>
                )}
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}

              <Pressable
                onPress={handleActivate}
                disabled={submitting || !keyInput.trim()}
                style={({ pressed }) => [
                  styles.button,
                  { opacity: submitting || !keyInput.trim() ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.buttonText}>Activate</Text>}
              </Pressable>

              {Platform.OS !== "web" && (
                <View style={styles.scanRow}>
                  <Pressable
                    onPress={openScanner}
                    style={({ pressed }) => [
                      styles.scanButton,
                      { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1, flex: 1 },
                    ]}
                  >
                    <ScanLine size={18} color="#3b82f6" />
                    <Text style={[styles.scanButtonText, { color: colors.text }]}>Scan QR</Text>
                  </Pressable>
                  <Pressable
                    onPress={pickFromGallery}
                    style={({ pressed }) => [
                      styles.scanButton,
                      { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1, flex: 1 },
                    ]}
                  >
                    <ImageIcon size={18} color="#3b82f6" />
                    <Text style={[styles.scanButtonText, { color: colors.text }]}>Gallery</Text>
                  </Pressable>
                </View>
              )}

              {Platform.OS !== "web" && (
                <Pressable
                  onPress={handleCheckUpdate}
                  disabled={checkingUpdate}
                  style={({ pressed }) => [
                    styles.updateButton,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || checkingUpdate ? 0.7 : 1 },
                  ]}
                >
                  {checkingUpdate
                    ? <ActivityIndicator size="small" color="#059669" />
                    : <Download size={16} color="#059669" />}
                  <Text style={[styles.updateButtonText, { color: colors.textSecondary }]}>
                    {checkingUpdate ? "Checking…" : "Update App"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      <Modal visible={showScanner} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.scannerContainer, { backgroundColor: "#000" }]}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.scannerTitle}>Scan License QR Code</Text>
            <Pressable onPress={() => setShowScanner(false)} style={styles.closeBtn}>
              <X size={24} color="#fff" />
            </Pressable>
          </View>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
          </View>
          <Text style={styles.scanHint}>Point your camera at the QR code</Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  content: { width: "100%", maxWidth: 360, paddingHorizontal: 24, alignItems: "center" },
  iconContainer: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 8 },
  subtitle: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    textAlign: "center", marginBottom: 32,
  },
  inputContainer: { width: "100%" },
  inputWrapper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50,
  },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", letterSpacing: 1 },
  errorText: {
    color: "#ef4444", fontSize: 13, fontFamily: "Inter_400Regular",
    marginTop: 8, textAlign: "center",
  },
  button: {
    backgroundColor: "#3b82f6", borderRadius: 12, height: 50,
    justifyContent: "center", alignItems: "center", marginTop: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  scanRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  scanButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, height: 50, borderWidth: 1,
  },
  scanButtonText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  updateButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, height: 44, borderWidth: 1, marginTop: 10,
  },
  updateButtonText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  scannerContainer: { flex: 1 },
  scannerHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 12, zIndex: 10,
  },
  scannerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff" },
  closeBtn: { padding: 8 },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: "#3b82f6", borderRadius: 20 },
  scanHint: {
    color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular",
    textAlign: "center", paddingBottom: 40, paddingTop: 12,
  },
  // Gateway step
  gatewayCard: {
    width: "100%", flexDirection: "row", alignItems: "center",
    borderRadius: 16, padding: 16, gap: 12,
  },
  gatewayCardIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#ffffff22",
    justifyContent: "center", alignItems: "center",
  },
  gatewayCardText: { flex: 1 },
  gatewayCardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff", marginBottom: 2 },
  gatewayCardSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#ffffffcc" },
  // Back button
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", marginBottom: 20, paddingVertical: 4,
  },
  backBtnFloating: {
    position: "absolute", left: 24, zIndex: 10,
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 4,
  },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  // KYC form fields
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, letterSpacing: 0.5 },
  fieldHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6 },
  photoBox: {
    height: 120, borderRadius: 12, borderWidth: 1, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center", marginBottom: 4, overflow: "hidden",
  },
  photoPreview: { width: "100%", height: "100%" },
  photoBoxText: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },
  // Pending step
  noteBox: {
    width: "100%", borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16,
  },
  noteTitle: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 6 },
  noteBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  secondaryBtn: {
    marginTop: 12, borderWidth: 1, borderRadius: 12, height: 44,
    justifyContent: "center", alignItems: "center", width: "100%",
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
