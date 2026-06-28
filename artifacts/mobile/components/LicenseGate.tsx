import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
} from "lucide-react-native";
import { CameraView, Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Updates from "expo-updates";
import { useLicense } from "@/context/LicenseContext";
import { useAccounts } from "@/context/AccountsContext";
import { API_BASE } from "@/utils/apiUrl";
import Colors from "@/constants/colors";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const license = useLicense();
  const { isLicensed, isLoading, error, activateKey, pinRequired, pinIsNew, submitPin } = license;
  const { hydrateFromServer } = useAccounts();
  const scheme = useColorScheme() ?? "dark";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

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
              text: "Update Now123",
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  await Updates.reloadAsync();
                } catch {
                  Alert.alert(
                    "Error",
                    "Failed to download update. Try again later.",
                  );
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

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (isLicensed) {
    return <>{children}</>;
  }

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
            {pinError ? (
              <Text style={styles.errorText}>{pinError}</Text>
            ) : null}
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
      const { granted } = await Camera.requestCameraPermissionsAsync();
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
    } catch (e) {
      Alert.alert("Error", "Failed to open gallery");
    }
  };

  return (
    <>
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
            <View
              style={[styles.iconContainer, { backgroundColor: colors.card }]}
            >
              <Lock size={48} color="#3b82f6" />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>
              License Required
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Enter your license key or scan a QR code
            </Text>

            <View style={styles.inputContainer}>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.card,
                    borderColor: error ? "#ef4444" : colors.border,
                  },
                ]}
              >
                <KeyRound
                  size={18}
                  color={colors.textSecondary}
                  style={{ marginRight: 10 }}
                />
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

            {/* ── DEBUG: remove before next release ── */}
            <View style={styles.debugBox}>
              <Text style={styles.debugLabel}>DEBUG — API URL</Text>
              <Text style={styles.debugUrl} selectable>{API_BASE}</Text>
            </View>
            {/* ─────────────────────────────────────── */}

              <Pressable
                onPress={handleActivate}
                disabled={submitting || !keyInput.trim()}
                style={({ pressed }) => [
                  styles.button,
                  {
                    opacity:
                      submitting || !keyInput.trim() ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Activate</Text>
                )}
              </Pressable>

              {Platform.OS !== "web" && (
                <View style={styles.scanRow}>
                  <Pressable
                    onPress={openScanner}
                    style={({ pressed }) => [
                      styles.scanButton,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.85 : 1,
                        flex: 1,
                      },
                    ]}
                  >
                    <ScanLine size={18} color="#3b82f6" />
                    <Text
                      style={[styles.scanButtonText, { color: colors.text }]}
                    >
                      Scan QR
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={pickFromGallery}
                    style={({ pressed }) => [
                      styles.scanButton,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.85 : 1,
                        flex: 1,
                      },
                    ]}
                  >
                    <ImageIcon size={18} color="#3b82f6" />
                    <Text
                      style={[styles.scanButtonText, { color: colors.text }]}
                    >
                      Gallery
                    </Text>
                  </Pressable>
                </View>
              )}

              {Platform.OS !== "web" && (
                <Pressable
                  onPress={handleCheckUpdate}
                  disabled={checkingUpdate}
                  style={({ pressed }) => [
                    styles.updateButton,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: pressed || checkingUpdate ? 0.7 : 1,
                    },
                  ]}
                >
                  {checkingUpdate ? (
                    <ActivityIndicator size="small" color="#059669" />
                  ) : (
                    <Download size={16} color="#059669" />
                  )}
                  <Text
                    style={[
                      styles.updateButtonText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {checkingUpdate ? "Checking…" : "Update App"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      <Modal
        visible={showScanner}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={[styles.scannerContainer, { backgroundColor: "#000" }]}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.scannerTitle}>Scan License QR Code</Text>
            <Pressable
              onPress={() => setShowScanner(false)}
              style={styles.closeBtn}
            >
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
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "100%",
    maxWidth: 360,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 32,
  },
  inputContainer: {
    width: "100%",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  scanRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    height: 50,
    borderWidth: 1,
  },
  scanButtonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    height: 44,
    borderWidth: 1,
    marginTop: 10,
  },
  updateButtonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  scannerContainer: {
    flex: 1,
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  scannerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  closeBtn: {
    padding: 8,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#3b82f6",
    borderRadius: 20,
  },
  scanHint: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingBottom: 40,
    paddingTop: 12,
  },
  debugBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#1e1b4b",
    borderWidth: 2,
    borderColor: "#f59e0b",
    borderRadius: 8,
    width: "100%",
  },
  debugLabel: {
    color: "#f59e0b",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
    letterSpacing: 1,
  },
  debugUrl: {
    color: "#a5f3fc",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineBreakStrategyIOS: "standard",
  },
});
