import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const PENDING_RUN_KEY = "@ms_rewards_pending_run";

// expo-notifications was removed from Expo Go in SDK 53.
// All functions here are safe to call — they no-op gracefully when the module
// is unavailable, so the rest of the app never crashes.
// In a dev build or production build, scheduling works fully.

type NotificationsModule = typeof import("expo-notifications");

function getNotifications(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

export function isNotificationsAvailable(): boolean {
  if (Platform.OS === "web") return false;
  const mod = getNotifications();
  if (!mod) return false;
  try {
    mod.getPermissionsAsync;
    return true;
  } catch {
    return false;
  }
}

export function setupNotificationHandler(): void {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const Notifications = getNotifications();
  if (!Notifications) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export interface ScheduleSlot {
  hour: number;
  minute: number;
}

export async function scheduleOvernightNotifications(
  slots: ScheduleSlot[]
): Promise<{ scheduled: number }> {
  if (Platform.OS === "web") return { scheduled: 0 };
  const Notifications = getNotifications();
  if (!Notifications) return { scheduled: 0 };

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}

  let count = 0;

  for (const slot of slots) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "MS Rewards — Overnight Run",
          body: "Tap to start your overnight Bing searches and earn points.",
          data: { action: "start_run" },
          sound: true,
        },
        trigger: {
          type: "daily",
          hour: slot.hour,
          minute: slot.minute,
        } as any,
      });
      count++;
    } catch {}
  }

  return { scheduled: count };
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export function addNotificationResponseListener(
  callback: (response: any) => void
): { remove: () => void } {
  const Notifications = getNotifications();
  if (!Notifications) return { remove: () => {} };
  try {
    return Notifications.addNotificationResponseReceivedListener(callback);
  } catch {
    return { remove: () => {} };
  }
}

export async function setPendingRun(): Promise<void> {
  await AsyncStorage.setItem(PENDING_RUN_KEY, "true");
}

export async function consumePendingRun(): Promise<boolean> {
  const val = await AsyncStorage.getItem(PENDING_RUN_KEY);
  if (val === "true") {
    await AsyncStorage.removeItem(PENDING_RUN_KEY);
    return true;
  }
  return false;
}
