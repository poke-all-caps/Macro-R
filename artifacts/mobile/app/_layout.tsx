import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AccountsProvider } from "@/context/AccountsContext";
import { QueriesProvider } from "@/context/QueriesContext";
import { SettingsProvider } from "@/context/SettingsContext";
import {
  addNotificationResponseListener,
  addNotificationReceivedListener,
  setupNotificationHandler,
  setPendingRun,
} from "@/utils/notifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function NotificationHandler() {
  useEffect(() => {
    setupNotificationHandler();

    const responseSub = addNotificationResponseListener(async (response: any) => {
      const action = response?.notification?.request?.content?.data?.action;
      if (action === "start_run" || action === "open_running") {
        await setPendingRun();
        router.navigate("/(tabs)/");
      }
    });

    const receivedSub = addNotificationReceivedListener(async (notification: any) => {
      const action = notification?.request?.content?.data?.action;
      if (action === "start_run") {
        await setPendingRun();
        router.navigate("/(tabs)/");
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
          options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, headerShown: false }}
        />
        <Stack.Screen name="login-webview" options={{ presentation: "fullScreenModal", headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="search-runner" options={{ presentation: "transparentModal", headerShown: false, animation: "slide_from_bottom", gestureEnabled: false }} />
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AccountsProvider>
                <QueriesProvider>
                  <SettingsProvider>
                    <RootLayoutNav />
                  </SettingsProvider>
                </QueriesProvider>
              </AccountsProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
