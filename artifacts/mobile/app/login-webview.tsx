import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Info, Lock, RefreshCw, Smartphone, Unlock, UserPlus, X } from "lucide-react-native";
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCustomAlert } from "@/components/CustomAlert";
import Colors from "@/constants/colors";
import { useAccounts } from "@/context/AccountsContext";
import { useLicense, API_BASE } from "@/context/LicenseContext";

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

// When adding a NEW account, always start with a sign-out so the WebView doesn't
// silently reuse an existing session from a previous account login.
const SIGNOUT_URL =
  "https://login.live.com/logout.srf?ct=1&rver=7&uaid=&lc=1033&mkt=EN-US&lru=" +
  encodeURIComponent(
    "https://login.live.com/login.srf?wa=wsignin1.0&wreply=https://rewards.bing.com/"
  );
const LOGIN_URL = "https://login.live.com/login.srf?wa=wsignin1.0&wreply=https://rewards.bing.com/";


// Injected on every page load — captures cookies for that domain and any detectable account info
const INJECT_COOKIES_JS = `
(function() {
  try {
    var data = {
      cookies: document.cookie,
      url: window.location.href,
      domain: window.location.hostname,
      username: '',
      email: '',
      avatarUrl: '',
      localStorageTokens: {},
    };
    // Detect account name — covers rewards.bing.com me-control AND bing.com header
    var nameSelectors = [
      '#mectrl_currentAccount_name', '.mectrl_accountinfo_name', '.mectrl_name',
      '[data-testid="user-name"]', '.id_accountName',
      '#mHamburgerFlyout .id_accountName',
      '#id_n', '.profile-name', '.display-name',
      '#meControl [aria-label]', '.mectrl_header_text',
      '#id_b', '.b_topbarAccount .id_accountName',
      '#id_a', '.b_accountName', '.headerUserName',
      '[data-bi-dhp="account-name"]', '.ms-PersonaBase-text',
    ];
    for (var ns = 0; ns < nameSelectors.length; ns++) {
      var el = document.querySelector(nameSelectors[ns]);
      if (el && el.innerText && el.innerText.trim().length > 1) { data.username = el.innerText.trim(); break; }
    }
    // Detect email
    var emailSelectors = [
      '#mectrl_currentAccount_subtitle', '.mectrl_accountinfo_email',
      '.id_email', '[data-testid="user-email"]',
      '.account-header-email', '#id_e',
      '.profile-email', '.b_topbarAccount .id_email',
    ];
    for (var es = 0; es < emailSelectors.length; es++) {
      var ee = document.querySelector(emailSelectors[es]);
      if (ee && ee.innerText && ee.innerText.indexOf('@') !== -1) { data.email = ee.innerText.trim(); break; }
    }
    // Also try to find email in any visible text on the page
    if (!data.email) {
      var allSpans = document.querySelectorAll('span, div, p, a');
      for (var si = 0; si < allSpans.length; si++) {
        var txt = (allSpans[si].innerText || '').trim();
        if (txt.indexOf('@') !== -1 && txt.indexOf('.') !== -1 && txt.length < 60 && !txt.match(/\\s/)) {
          data.email = txt;
          break;
        }
      }
    }
    // Detect profile picture — covers rewards.bing.com me-control AND bing.com header
    var avatarSelectors = [
      '#mectrl_currentAccount_picture img',
      '.mectrl_accountpic img',
      '.mectrl_profilepic img',
      'img.mectrl_accountpic',
      'img.id_avatar',
      '#id_p img',
      '#meControl img[alt]',
      '.c-image-account img',
      'img[data-testid="user-avatar"]',
      '#mectrl_main_trigger img',
      '.mectrl_trigger img',
      '#id_a img',
      '.b_avatar img',
      '.hplogo img',
      'img#id_avatar',
      '[aria-label="Your account"] img',
      '.headerUserInfoAvatar img',
    ];
    for (var as = 0; as < avatarSelectors.length; as++) {
      var ae = document.querySelector(avatarSelectors[as]);
      if (ae && ae.src &&
          ae.src.indexOf('data:') !== 0 &&
          ae.src.indexOf('default') === -1 &&
          ae.src.indexOf('1x1') === -1 &&
          ae.src.indexOf('pixel') === -1) {
        data.avatarUrl = ae.src;
        break;
      }
    }
    if (!data.avatarUrl) {
      var allImgs = document.querySelectorAll('img');
      for (var ai = 0; ai < allImgs.length; ai++) {
        var img = allImgs[ai];
        var s = img.src || '';
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (s.indexOf('data:') === 0 || s.indexOf('1x1') !== -1 || s.indexOf('pixel') !== -1) continue;
        if ((s.indexOf('graph.microsoft.com') !== -1 && s.indexOf('photo') !== -1) ||
            s.indexOf('profile.live.com') !== -1 ||
            s.indexOf('dsimages-') !== -1 ||
            s.indexOf('cgi-bin/picture') !== -1 ||
            (s.indexOf('bing.com') !== -1 && w >= 20 && w <= 150 && h >= 20 && h <= 150 && s.indexOf('http') === 0)) {
          data.avatarUrl = s;
          break;
        }
      }
    }
    // Relevant localStorage tokens
    try {
      var lsKeys = Object.keys(localStorage);
      for (var i = 0; i < lsKeys.length; i++) {
        var k = lsKeys[i];
        var kl = k.toLowerCase();
        if (kl.indexOf('token') !== -1 || kl.indexOf('auth') !== -1 ||
            kl.indexOf('muid') !== -1 || kl.indexOf('session') !== -1 ||
            kl.indexOf('rewards') !== -1) {
          var val = localStorage.getItem(k);
          if (val && val.length < 4000) data.localStorageTokens[k] = val;
        }
      }
    } catch(lsErr) {}
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cookies', data: data }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.message }));
  }
})();
true;
`;

function getCookieManager(): any {
  try {
    const mod = require("@react-native-cookies/cookies");
    return mod.default || mod;
  } catch {
    return null;
  }
}

type LoginStatus = "loading" | "browsing" | "loggedIn";

export default function LoginWebViewScreen() {
  const scheme = useColorScheme() ?? "light";
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { addAccount, updateAccount, accounts } = useAccounts();
  const { licenseData, featureConfig } = useLicense();
  const maxAccounts = licenseData?.maxAccounts ?? featureConfig?.maxAccounts ?? 999;
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const existingAccount = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const webViewRef = useRef<WebView>(null);
  const { showAlert, AlertComponent } = useCustomAlert();

  const [status, setStatus] = useState<LoginStatus>("loading");
  const [pageUrl, setPageUrl] = useState(LOGIN_URL);
  const [isLoading, setIsLoading] = useState(true);
  const [capturedCookies, setCapturedCookies] = useState<Record<string, string>>({});
  const [detectedEmail, setDetectedEmail] = useState("");
  const [detectedAvatar, setDetectedAvatar] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [cookiesReady, setCookiesReady] = useState(!!existingAccount);
  const [isSaving, setIsSaving] = useState(false);

  // Refs so handleSave always sees the latest detected values (state is stale in closures)
  const detectedAvatarRef = useRef("");
  const detectedEmailRef = useRef("");
  const accountNameRef = useRef("");

  React.useEffect(() => {
    if (!existingAccount) {
      const cm = getCookieManager();
      if (cm) {
        cm.clearAll(true)
          .then(() => setCookiesReady(true))
          .catch(() => setCookiesReady(true));
      } else {
        setCookiesReady(true);
      }
    }
  }, []);

  const bannerAnim = useRef(new Animated.Value(0)).current;

  const showSuccessBanner = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
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
      if (!navState.loading && navState.url.startsWith("http")) {
        webViewRef.current?.injectJavaScript(INJECT_COOKIES_JS);
      }
      let isOnRewards = false;
      try {
        const parsed = new URL(navState.url);
        isOnRewards =
          parsed.hostname === "rewards.bing.com" ||
          (parsed.hostname === "www.bing.com" && parsed.pathname.startsWith("/rewards")) ||
          (parsed.hostname === "bing.com" && parsed.pathname.startsWith("/rewards"));
      } catch {}
      if (isOnRewards && !navState.loading && status !== "loggedIn") {
        setStatus("loggedIn");
        showSuccessBanner();
        // Click the me-control to open the account flyout (reveals profile pic, name, email)
        try {
          webViewRef.current?.injectJavaScript(`
            (function() {
              try {
                var trigger = document.querySelector('#mectrl_main_trigger') || document.querySelector('.mectrl_trigger') || document.querySelector('#id_l');
                if (trigger) trigger.click();
                setTimeout(function() {
                  ${INJECT_COOKIES_JS}
                }, 1500);
                setTimeout(function() {
                  ${INJECT_COOKIES_JS}
                }, 3000);
              } catch(e) {}
            })();
            true;
          `);
        } catch {}
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
        const lsTokens: Record<string, string> = msg.data.localStorageTokens || {};
        const lsPrefixed: Record<string, string> = {};
        Object.entries(lsTokens).forEach(([k, v]) => { lsPrefixed[`_ls_${k}`] = v; });
        // Merge: never discard previously captured cookies — accumulate across all visited domains
        setCapturedCookies((prev) => ({ ...prev, ...parsed, ...lsPrefixed }));
        // Pick up email — sync ref too
        const email = (msg.data.email || "").trim();
        if (email && email.includes("@")) {
          setDetectedEmail(email);
          if (!detectedEmailRef.current) detectedEmailRef.current = email;
        }
        // Pick up username — sync ref too
        const username = (msg.data.username || "").trim();
        if (username) {
          setAccountName((prev) => prev || username);
          if (!accountNameRef.current) accountNameRef.current = username;
        }
        // Pick up avatar URL — sync ref too; accept any http URL, prefer non-blob
        const avatar = (msg.data.avatarUrl || "").trim();
        if (avatar && avatar.startsWith("http")) {
          setDetectedAvatar((prev) => prev || avatar);
          if (!detectedAvatarRef.current) detectedAvatarRef.current = avatar;
        }
      }
    } catch {}
  }, []);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Navigate WebView to www.bing.com to:
    // 1. Trigger auth redirect that sets the _U cookie
    // 2. Let Bing header render so we can capture the profile avatar from it
    try {
      webViewRef.current?.injectJavaScript(`window.location.href = 'https://www.bing.com';true;`);
      // Wait for bing.com to load, then inject avatar/profile detection
      await new Promise<void>((r) => setTimeout(r, 2500));
      webViewRef.current?.injectJavaScript(INJECT_COOKIES_JS);
      // Give the message handler time to receive and process the injected script result
      await new Promise<void>((r) => setTimeout(r, 1500));
    } catch {}

    // Capture native cookies (including httpOnly) via CookieManager
    // document.cookie only sees non-httpOnly — the real auth tokens are httpOnly
    let nativeCookies: Record<string, string> = {};
    const cm = getCookieManager();
    if (cm) {
      const domains = [
        "https://www.bing.com",
        "https://bing.com",
        "https://rewards.bing.com",
        "https://rewards.microsoft.com",
        "https://login.live.com",
        "https://login.microsoftonline.com",
        "https://account.microsoft.com",
        "https://www.microsoft.com",
      ];
      for (const domain of domains) {
        try {
          const cookies = await cm.get(domain, true);
          if (cookies && typeof cookies === "object") {
            for (const [name, cookie] of Object.entries(cookies)) {
              if (cookie && typeof cookie === "object" && "value" in (cookie as any)) {
                nativeCookies[name] = (cookie as any).value;
              } else if (typeof cookie === "string") {
                nativeCookies[name] = cookie;
              }
            }
          }
        } catch {}
      }
    }

    const allCookies = { ...capturedCookies, ...nativeCookies };

    const jsCount = Object.keys(capturedCookies).length;
    const nativeCount = Object.keys(nativeCookies).length;
    const totalCount = Object.keys(allCookies).length;
    const hasU = "_U" in allCookies;
    const hasMUID = "MUID" in allCookies;
    const nativeNames = Object.keys(nativeCookies).sort().join(", ");

    console.log(`[CookieCapture] JS: ${jsCount} | Native: ${nativeCount} | Total: ${totalCount}`);
    console.log(`[CookieCapture] _U: ${hasU ? "YES" : "MISSING"} | MUID: ${hasMUID ? "YES" : "MISSING"}`);
    console.log(`[CookieCapture] Native names: ${nativeNames}`);

    // Use refs for avatar/email (may be updated by WebView injection during the bing.com wait above)
    // Use accountName state directly for name — it reflects what the user typed in the name sheet
    let finalAvatar = detectedAvatarRef.current;
    let finalEmail = detectedEmailRef.current.trim();
    let finalName = accountName.trim() || accountNameRef.current.trim();

    // Always try fetching profile info from Bing rewards dashboard API
    try {
      const cookieStr = Object.entries(allCookies)
        .filter(([k]) => !k.startsWith("_ls_"))
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      const resp = await fetch("https://rewards.bing.com/api/getuserinfo?type=1", {
        credentials: "omit",
        headers: {
          Cookie: cookieStr,
          "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        },
      });
      if (resp.ok) {
        const info = await resp.json();
        console.log(`[Profile] getuserinfo raw keys:`, Object.keys(info || {}));

        // Check multiple possible response shapes
        const dashboard = info?.dashboard;
        const userStatus = info?.userStatus;
        const userInfo = info?.userInfo;

        // Name — try every known field across all response shapes
        const nameFields = [
          dashboard?.firstName, dashboard?.userName, dashboard?.displayName,
          userStatus?.displayName, userStatus?.firstName, userStatus?.userName,
          userInfo?.firstName, userInfo?.displayName, userInfo?.userName,
          info?.firstName, info?.displayName, info?.userName,
        ];
        for (const n of nameFields) {
          if (!finalName && n && typeof n === "string" && n.trim()) { finalName = n.trim(); break; }
        }

        // Email
        const emailFields = [
          dashboard?.email, userStatus?.email, userInfo?.email, info?.email,
        ];
        for (const e of emailFields) {
          if (!finalEmail && e && typeof e === "string" && e.includes("@")) { finalEmail = e.trim(); break; }
        }

        // Avatar — try every known field across all response shapes
        const avatarFields = [
          dashboard?.userProfileUrl, dashboard?.imageUrl, dashboard?.profileImageUrl,
          userStatus?.profileImageUrl, userStatus?.imageUrl,
          userInfo?.profileImageUrl, userInfo?.imageUrl,
          info?.profileImageUrl, info?.imageUrl,
        ];
        for (const a of avatarFields) {
          if (!finalAvatar && a && typeof a === "string" && a.startsWith("http")) { finalAvatar = a.trim(); break; }
        }

        console.log(`[Profile] Resolved — name: "${finalName}", email: "${finalEmail}", avatar: ${finalAvatar ? "YES" : "NO"}`);
      }
    } catch (e) {
      console.log("[Profile] Rewards API fetch failed:", e);
    }

    // Second attempt: try the profile endpoint
    if (!finalName || !finalEmail) {
      try {
        const cookieStr = Object.entries(allCookies)
          .filter(([k]) => !k.startsWith("_ls_"))
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        const resp2 = await fetch("https://rewards.bing.com/api/getprofile", {
          credentials: "omit",
          headers: {
            Cookie: cookieStr,
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
          },
        });
        if (resp2.ok) {
          const profile = await resp2.json();
          if (!finalName && profile?.firstName) finalName = profile.firstName;
          if (!finalName && profile?.displayName) finalName = profile.displayName;
          if (!finalEmail && profile?.email) finalEmail = profile.email;
          console.log(`[Profile] Fetched from profile API — name: ${profile?.firstName || profile?.displayName}, email: ${profile?.email}`);
        }
      } catch (e2) {
        console.log("[Profile] Profile API fetch failed:", e2);
      }
    }

    if (!("_U" in allCookies) || !allCookies["_U"]) {
      setIsSaving(false);
      showAlert(
        "Session Incomplete",
        "The critical auth cookie (_U) was not captured. Please make sure you fully signed in and landed on the Bing Rewards page before saving.",
        [{ text: "OK" }]
      );
      return;
    }

    // ── System 2: server-side slot enforcement ───────────────────────────────
    // Call /add-account before saving locally so the server can enforce the limit.
    // On 403 the server blocked the add; stop and show the server error message.
    try {
      const storedKey = await AsyncStorage.getItem("@ms_rewards_license_key");
      const storedDeviceId = await AsyncStorage.getItem("@ms_rewards_device_id");
      if (storedKey) {
        const addResp = await fetch(`${API_BASE}/add-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: storedKey,
            deviceId: storedDeviceId,
            account: {
              email: finalEmail || "user@outlook.com",
              name: finalName || "Macro Rewards Account",
              cookies: allCookies,
            },
          }),
        });
        if (addResp.status === 403) {
          const body = await addResp.json();
          setIsSaving(false);
          showAlert("Account Limit Reached", body.error || `Your license allows up to ${maxAccounts} account${maxAccounts > 1 ? "s" : ""}.`, [{ text: "OK" }]);
          return;
        }
      }
    } catch {}
    // ─────────────────────────────────────────────────────────────────────────

    if (existingAccount) {
      updateAccount(existingAccount.id, {
        cookies: allCookies,
        email: finalEmail || existingAccount.email,
        avatarUrl: finalAvatar || existingAccount.avatarUrl,
      });
    } else if (accounts.length >= maxAccounts) {
      Alert.alert("Account Limit Reached", `Your license allows up to ${maxAccounts} account${maxAccounts > 1 ? "s" : ""}.`);
      router.back();
      return;
    } else {
      addAccount({
        name: finalName || "Macro Rewards Account",
        email: finalEmail || "user@outlook.com",
        avatarUrl: finalAvatar || undefined,
        searchCount: 30,
        dailySetEnabled: true,
        enabled: true,
        lastRun: null,
        cookies: allCookies,
      });
    }
    router.back();
  };

  const handleSavePress = () => {
    if (existingAccount) { handleSave(); return; }
    setShowNameInput(true);
  };

  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.webFallbackHeader, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.webFallback}>
          <View style={[styles.webFallbackIcon, { backgroundColor: colors.surfaceSecondary }]}>
            <Smartphone size={36} color={colors.tint} />
          </View>
          <Text style={[styles.webFallbackTitle, { color: colors.text }]}>Open on your Android device</Text>
          <Text style={[styles.webFallbackSub, { color: colors.textSecondary }]}>
            The Microsoft login requires Expo Go on your Android device to capture session cookies.
          </Text>
          <View style={[styles.webFallbackNote, { backgroundColor: colors.surfaceSecondary }]}>
            <Info size={14} color={colors.tint} />
            <Text style={[styles.webFallbackNoteText, { color: colors.textSecondary }]}>
              WebView login is only supported on Android and iOS
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const WebViewComponent = require("react-native-webview").default;

  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            if (status === "loggedIn") {
              showAlert("Leave without saving?", "Your login session will be lost.", [
                { text: "Stay", style: "cancel" },
                { text: "Leave", style: "destructive", onPress: () => router.back() },
              ]);
            } else {
              router.back();
            }
          }}
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <X size={22} color="#fff" />
        </Pressable>

        <View style={styles.urlBar}>
          {pageUrl.startsWith("https") ? (
            <Lock size={12} color="#4ADE80" />
          ) : (
            <Unlock size={12} color="#FCD34D" />
          )}
          <Text style={styles.urlText} numberOfLines={1}>
            {pageUrl.replace(/^https?:\/\//, "").split("?")[0]}
          </Text>
        </View>

        {isLoading && <ActivityIndicator size="small" color="#60A5FA" />}
        {!isLoading && <View style={{ width: 20 }} />}
      </View>

      {cookiesReady ? (
        <WebViewComponent
          ref={webViewRef}
          source={{ uri: existingAccount ? LOGIN_URL : SIGNOUT_URL }}
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
      ) : (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Preparing clean session...</Text>
        </View>
      )}

      {status === "loggedIn" && !showNameInput && (
        <Animated.View
          style={[
            styles.banner,
            {
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }],
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
              {existingAccount ? <RefreshCw size={18} color="#15803D" /> : <UserPlus size={18} color="#15803D" />}
              <Text style={styles.saveBtnText}>{existingAccount ? "Update Cookies" : "Save Account"}</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      )}

      {showNameInput && (
        <View style={[styles.nameSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.nameSheetHandle} />
          <Text style={[styles.nameSheetTitle, { color: colors.text }]}>Name this account</Text>
          {detectedEmail ? <Text style={[styles.nameSheetEmail, { color: colors.textSecondary }]}>{detectedEmail}</Text> : null}
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
          <Pressable onPress={handleSave} style={({ pressed }) => [styles.confirmBtn, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}>
            <Check size={18} color="#fff" />
            <Text style={styles.confirmText}>Add Account</Text>
          </Pressable>
          <Pressable onPress={() => setShowNameInput(false)} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Back to browser</Text>
          </Pressable>
        </View>
      )}
      {AlertComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, gap: 10, backgroundColor: "#0F172A" },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  urlBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1E293B", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  urlText: { color: "#CBD5E1", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  webView: { flex: 1 },
  loadingOverlay: { position: "absolute", inset: 0, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: "#6B7280", fontFamily: "Inter_400Regular" },
  banner: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bannerGradient: { margin: 12, borderRadius: 20, padding: 20, gap: 16 },
  bannerTop: { gap: 6 },
  bannerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  successDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4ADE80" },
  bannerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  bannerSub: { color: "#BBF7D0", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  saveBtn: { backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: "#15803D", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  nameSheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  nameSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 6 },
  nameSheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  nameSheetEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  nameInput: { padding: 14, borderRadius: 12, fontSize: 16, fontFamily: "Inter_400Regular", borderWidth: 1 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  confirmText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { alignItems: "center", paddingVertical: 4 },
  cancelText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  webFallbackHeader: { paddingHorizontal: 16, paddingBottom: 8 },
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  webFallbackIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  webFallbackTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  webFallbackSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  webFallbackNote: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderRadius: 12, marginTop: 8 },
  webFallbackNoteText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
});
