import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Lock,
  KeyRound,
  ScanLine,
  Image as ImageIcon,
  X,
  Download,
} from "lucide-react-native";
import { CameraView, Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Updates from "expo-updates";
import { useLicense } from "@/context/LicenseContext";
import Colors from "@/constants/colors";

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const license = useLicense();
  const { isLicensed, isLoading, error, activateKey } = license;
  const scheme = useColorScheme() ?? "dark";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
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
              placeholder="XsXXX-XXXX-XXXX-XXXX1s"
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
                <Text style={[styles.scanButtonText, { color: colors.text }]}>
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
                <Text style={[styles.scanButtonText, { color: colors.text }]}>
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
    </KeyboardAvoidingView>
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
});
