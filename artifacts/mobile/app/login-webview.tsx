import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewNavigation, WebViewMessageEvent } from "react-native-webview";

import Colors from "@/constants/colors";
import { useAccounts } from "@/context/AccountsContext";

// accountId param = update existing; no param = create new
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

const LOGIN_URL = "https://login.live.com/login.srf?wa=wsignin1.0&wreply=https://rewards.bing.com/";

const REWARDS_DOMAINS = ["rewards.bing.com", "bing.com/rewards"];

const INJECT_COOKIES_JS = `
(function() {
  try {
    var data = {
      cookies: document.cookie,
      url: window.location.href,
      title: document.title,
      username: '',
    };

    // Try to get account name from page
    var nameEl = document.querySelector('[data-testid="user-name"], .id_accountName, #mHamburgerFlyout .id_accountName, .ms-Icon--Contact');
    if (nameEl) data.username = nameEl.innerText || nameEl.textContent || '';

    // Try meta tags
    var metaUser = document.querySelector('meta[name="og:title"], meta[property="og:title"]');
    if (metaUser) data.username = metaUser.getAttribute('content') || '';

    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cookies', data: data }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.message }));
  }
})();
true;
`;

type LoginStatus = "loading" | "browsing" | "loggedIn";

export default function LoginWebViewScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { addAccount, updateAccount, accounts } = useAccounts();
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const existingAccount = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const webViewRef = useRef<WebView>(null);

  const [status, setStatus] = useState<LoginStatus>("loading");
  const [pageUrl, setPageUrl] = useState(LOGIN_URL);
  const [isLoading, setIsLoading] = useState(true);
  const [capturedCookies, setCapturedCookies] = useState<Record<string, string>>({});
  const [detectedEmail, setDetectedEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);

  const bannerAnim = useRef(new Animated.Value(0)).current;

  const showSuccessBanner = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(bannerAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();
  }, []);

  const parseCookieString = (cookieStr: string): Record<string, string> => {
    const cookies: Record<string, string> = {};
    cookieStr.split(";").forEach((pair) => {
      const [key, ...rest] = pair.trim().split("=");
      if (key) cookies[key.trim()] = rest.join("=").trim();
    });
    return cookies;
  };

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      setPageUrl(navState.url);
      setIsLoading(navState.loading);

      const isOnRewards = REWARDS_DOMAINS.some((d) => navState.url.includes(d));

      if (isOnRewards && status !== "loggedIn") {
        setStatus("loggedIn");
        showSuccessBanner();
        // Inject JS to capture cookies + detect email
        webViewRef.current?.injectJavaScript(INJECT_COOKIES_JS);
      } else if (!navState.loading && status === "loading") {
        setStatus("browsing");
      }
    },
    [status, showSuccessBanner]
  );

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "cookies" && msg.data) {
        const parsed = parseCookieString(msg.data.cookies || "");
        setCapturedCookies(parsed);

        // Try to detect email from URL or cookies
        const url = msg.data.url || "";
        const emailMatch = url.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) setDetectedEmail(emailMatch[0]);

        // Set name from title or username
        if (msg.data.username && !accountName) {
          setAccountName(msg.data.username.split(" ")[0] || "My Account");
        }
      }
    } catch {}
  }, [accountName]);

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (existingAccount) {
      // Update existing account's cookies
      updateAccount(existingAccount.id, {
        cookies: capturedCookies,
        email: detectedEmail.trim() || existingAccount.email,
      });
      router.back();
      return;
    }

    // Create new account
    const name = accountName.trim() || "MS Rewards Account";
    const email = detectedEmail.trim() || "user@outlook.com";

    addAccount({
      name,
      email,
      searchCount: 30,
      dailySetEnabled: true,
      lastRun: null,
      cookies: capturedCookies,
    });

    router.back();
  };

  const handleSavePress = () => {
    // If updating existing account, save directly — no name input needed
    if (existingAccount) {
      handleSave();
      return;
    }
    setShowNameInput(true);
  };

  // Web fallback — WebView not supported on web
  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.webFallbackHeader, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Feather name="x" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.webFallback}>
          <View style={[styles.webFallbackIcon, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="smartphone" size={36} color={colors.tint} />
          </View>
          <Text style={[styles.webFallbackTitle, { color: colors.text }]}>
            Open on your Android device
          </Text>
          <Text style={[styles.webFallbackSub, { color: colors.textSecondary }]}>
            The Microsoft login requires Expo Go on your Android device to capture session cookies. Scan the QR code from the Expo CLI to open the app on your phone.
          </Text>
          <View style={[styles.webFallbackNote, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="info" size={14} color={colors.tint} />
            <Text style={[styles.webFallbackNoteText, { color: colors.textSecondary }]}>
              WebView login is only supported on Android and iOS
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            if (status === "loggedIn") {
              Alert.alert(
                "Leave without saving?",
                "Your login session will be lost.",
                [
                  { text: "Stay", style: "cancel" },
                  { text: "Leave", style: "destructive", onPress: () => router.back() },
                ]
              );
            } else {
              router.back();
            }
          }}
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>

        <View style={styles.urlBar}>
          <Feather
            name={pageUrl.startsWith("https") ? "lock" : "unlock"}
            size={12}
            color={pageUrl.startsWith("https") ? "#4ADE80" : "#FCD34D"}
          />
          <Text style={styles.urlText} numberOfLines={1}>
            {pageUrl.replace(/^https?:\/\//, "").split("?")[0]}
          </Text>
        </View>

        {isLoading && (
          <ActivityIndicator size="small" color="#60A5FA" />
        )}
        {!isLoading && <View style={{ width: 20 }} />}
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: LOGIN_URL }}
        userAgent={MOBILE_USER_AGENT}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        style={styles.webView}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        allowsBackForwardNavigationGestures
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading Microsoft login...</Text>
          </View>
        )}
      />

      {/* Success Banner */}
      {status === "loggedIn" && !showNameInput && (
        <Animated.View
          style={[
            styles.banner,
            {
              transform: [
                {
                  translateY: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [120, 0],
                  }),
                },
              ],
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <LinearGradient colors={["#166534", "#15803D"]} style={styles.bannerGradient}>
            <View style={styles.bannerTop}>
              <View style={styles.bannerTitleRow}>
                <View style={styles.successDot} />
                <Text style={styles.bannerTitle}>
                  {existingAccount ? "Session refreshed!" : "Logged in successfully!"}
                </Text>
              </View>
              <Text style={styles.bannerSub}>
                {existingAccount
                  ? `Cookies captured for "${existingAccount.name}". Tap Update to save.`
                  : detectedEmail
                  ? `Account: ${detectedEmail} — tap Save to continue.`
                  : "Session cookies captured. Tap Save to add this account."}
              </Text>
            </View>
            <Pressable
              onPress={handleSavePress}
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Feather name={existingAccount ? "refresh-cw" : "user-plus"} size={18} color="#15803D" />
              <Text style={styles.saveBtnText}>
                {existingAccount ? "Update Cookies" : "Save Account"}
              </Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Name Input Sheet */}
      {showNameInput && (
        <View style={[styles.nameSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.nameSheetHandle} />
          <Text style={[styles.nameSheetTitle, { color: colors.text }]}>Name this account</Text>
          {detectedEmail ? (
            <Text style={[styles.nameSheetEmail, { color: colors.textSecondary }]}>
              {detectedEmail}
            </Text>
          ) : null}
          <TextInput
            style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            value={accountName}
            onChangeText={setAccountName}
            placeholder="e.g. My Main Account"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="check" size={18} color="#fff" />
            <Text style={styles.confirmText}>Add Account</Text>
          </Pressable>
          <Pressable onPress={() => setShowNameInput(false)} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Back to browser</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: "#0F172A",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  urlBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  urlText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
    fontFamily: "Inter_400Regular",
  },
  banner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bannerGradient: {
    margin: 12,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  bannerTop: { gap: 6 },
  bannerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4ADE80",
  },
  bannerTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  bannerSub: {
    color: "#BBF7D0",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: {
    color: "#15803D",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  nameSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  nameSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 6,
  },
  nameSheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  nameSheetEmail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: -8,
  },
  nameInput: {
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  confirmText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  // Web fallback
  webFallbackHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  webFallbackIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  webFallbackTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  webFallbackSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  webFallbackNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  webFallbackNoteText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
