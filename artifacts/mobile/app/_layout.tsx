import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LicenseGate } from "@/components/LicenseGate";
import { AccountsProvider, useAccounts } from "@/context/AccountsContext";
import { KycProvider } from "@/context/KycContext";
import { LicenseProvider } from "@/context/LicenseContext";
import { QueriesProvider } from "@/context/QueriesContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import {
  addNotificationResponseListener,
  addNotificationReceivedListener,
  getInitialNotificationResponse,
  setupNotificationHandler,
  setPendingRun,
  registerBackgroundNotificationTask,
  showOvernightPersistentNotification,
  hasPersistentNotification,
  requestNotificationPermission,
  requestBatteryOptimizationExemption,
  requestExactAlarmPermission,
  requestDisplayOverApps,
  requestFullScreenIntent,
} from "@/utils/notifications";
import { registerBackgroundSearchTask, isBackgroundRunning, scheduleBackgroundFetch, isBackgroundFetchEnabled } from "@/utils/backgroundSearch";
import { startKeepAlive } from "@/utils/keepAlive";

// Log all uncaught JS errors before forwarding to the default RN handler.
// Non-fatal errors are logged and swallowed so a single bad async throw
// doesn't crash the whole app. Fatal errors always go to the default handler
// so RN's normal crash/reload path still works.
// Access via globalThis so this doesn't throw on web / non-RN runtimes where
// ErrorUtils is not defined.
const EU = (globalThis as any).ErrorUtils;
if (EU) {
  const defaultHandler = EU.getGlobalHandler?.();
  EU.setGlobalHandler?.((error: any, isFatal: boolean) => {
    console.error("[GlobalError] isFatal:", isFatal, error);
    if (isFatal && defaultHandler) {
      defaultHandler(error, isFatal);
    }
  });
}

SplashScreen.preventAutoHideAsync();
try { registerBackgroundNotificationTask(); } catch (e) { console.log("[Layout] Failed to register bg notification task:", e); }
try { registerBackgroundSearchTask(); } catch (e) { console.log("[Layout] Failed to register bg search task:", e); }

const queryClient = new QueryClient();

function NotificationHandler() {
  const { accounts, isRunning, startRun } = useAccounts();
  const { settings } = useSettings();

  // Keep refs so the notification callback always sees the latest values
  const accountsRef = useRef(accounts);
  const isRunningRef = useRef(isRunning);
  const overnightDailySetRef = useRef(settings.overnightDailySet);

  useEffect(() => { accountsRef.current = accounts; }, [accounts]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { overnightDailySetRef.current = settings.overnightDailySet; }, [settings.overnightDailySet]);

  const startRunRef = useRef(startRun);
  useEffect(() => { startRunRef.current = startRun; }, [startRun]);

  useEffect(() => {
    setupNotificationHandler();
    // Ask for ALL permissions on first launch (once only)
    AsyncStorage.getItem("@ms_rewards_all_perms_asked").then(async (asked) => {
      if (!asked) {
        await AsyncStorage.setItem("@ms_rewards_all_perms_asked", "true");
        await requestNotificationPermission().catch(() => {});
        await requestBatteryOptimizationExemption().catch(() => {});
        await requestExactAlarmPermission().catch(() => {});
        await requestDisplayOverApps().catch(() => {});
        await requestFullScreenIntent().catch(() => {});
      }
    });
    // Re-register background fetch on startup ONLY if the user previously
    // applied a schedule (BG_FETCH_ENABLED_KEY === "true").  This survives
    // app restarts and reinstalls without overriding a cleared schedule.
    isBackgroundFetchEnabled().then((enabled) => {
      if (enabled) {
        scheduleBackgroundFetch().catch((e) =>
          console.log("[Layout] Background fetch re-register failed:", e)
        );
        // Restore the persistent 24/7 notification if it was previously active
        hasPersistentNotification().then((has) => {
          if (!has) {
            showOvernightPersistentNotification().catch(() => {});
          }
        });
      }
    });

    const handleStartRun = async () => {
      const bgRunning = await isBackgroundRunning();
      if (bgRunning) {
        console.log("[NotificationHandler] Background search already running, skipping foreground trigger");
        return;
      }

      // If a foreground run is already in progress, don't interrupt or redirect
      if (isRunningRef.current) {
        console.log("[NotificationHandler] Foreground run already in progress, skipping");
        return;
      }

      if (accountsRef.current.length > 0) {
        startRunRef.current();
        router.navigate({
          pathname: "/search-runner",
          params: {
            accountIds: JSON.stringify(
              accountsRef.current.filter((a) => (a as any).enabled ?? true).map((a) => a.id)
            ),
            mode: overnightDailySetRef.current ? "both" : "searchonly",
          },
        });
      } else {
        await setPendingRun();
      }
    };

    // ── Cold-start: app was killed, user tapped notification ────────────────
    // addNotificationResponseListener only fires for taps that happen AFTER
    // this component mounts. When the app is dead and the notification wakes
    // it, the response is already "used up" before the listener registers.
    // getLastNotificationResponseAsync() retrieves that cold-start response.
    getInitialNotificationResponse().then(async (response) => {
      if (!response) return;
      const action = response?.notification?.request?.content?.data?.action;
      const actionIdentifier = response?.actionIdentifier;

      if (actionIdentifier === "search_now") {
        console.log("[NotificationHandler] Cold-start: Search Now tapped");
        await handleStartRun();
        return;
      }
      if (actionIdentifier === "edit_schedule") {
        console.log("[NotificationHandler] Cold-start: Edit Schedule tapped");
        router.navigate("/overnight");
        return;
      }
      if (action === "start_run" || action === "open_running") {
        console.log("[NotificationHandler] Cold-start notification response — starting run");
        await handleStartRun();
      }
      if (action === "overnight_status") {
        router.navigate("/overnight");
      }
    });

    const responseSub = addNotificationResponseListener(async (response: any) => {
      const action = response?.notification?.request?.content?.data?.action;
      const actionIdentifier = response?.actionIdentifier;

      // Buttons on the persistent overnight notification
      if (actionIdentifier === "search_now") {
        await handleStartRun();
        return;
      }
      if (actionIdentifier === "edit_schedule") {
        router.navigate("/overnight");
        return;
      }

      if (action === "start_run" || action === "open_running") {
        await handleStartRun();
      }
      if (action === "overnight_status") {
        router.navigate("/overnight");
      }
    });

    const receivedSub = addNotificationReceivedListener(async (notification: any) => {
      const action = notification?.request?.content?.data?.action;
      // Scheduled overnight trigger — run searches automatically in background,
      // no user interaction or screen navigation needed.
      if (action === "bg_search_trigger") {
        console.log("[NotificationHandler] Overnight trigger received in foreground — running background search silently");
        try {
          const { runBackgroundSearches, isBackgroundRunning: isBgRunning } = require("@/utils/backgroundSearch");
          const running = await isBgRunning();
          if (!running) await runBackgroundSearches();
        } catch (e) {
          console.log("[NotificationHandler] Foreground bg search failed:", e);
        }
        return;
      }
      if (action === "start_run") {
        await handleStartRun();
      }
    });

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, []);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <NotificationHandler />
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="account/[id]" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen
          name="add-account"
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: false, headerShown: false }}
        />
        <Stack.Screen name="login-webview" options={{ presentation: "fullScreenModal", headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="cookie-browser" options={{ presentation: "fullScreenModal", headerShown: false }} />
        <Stack.Screen name="search-runner" options={{ presentation: "transparentModal", headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="admin-panel" options={{ presentation: "fullScreenModal", headerShown: false }} />
        <Stack.Screen name="daily-set-settings" options={{ headerShown: false }} />
        <Stack.Screen name="overnight" options={{ headerShown: false }} />
        <Stack.Screen name="upgrade" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const stopKeepAlive = startKeepAlive();
    return stopKeepAlive;
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <KycProvider>
              <LicenseProvider>
                <AccountsProvider>
                  <LicenseGate>
                    <QueriesProvider>
                      <SettingsProvider>
                        <RootLayoutNav />
                      </SettingsProvider>
                    </QueriesProvider>
                  </LicenseGate>
                </AccountsProvider>
              </LicenseProvider>
              </KycProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
