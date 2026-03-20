import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const PENDING_RUN_KEY = "@ms_rewards_pending_run";

// expo-notifications was removed from Expo Go in SDK 53.
// All functions here are safe to call — they no-op gracefully when the module
// is unavailable, so the rest of the app never crashes.

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
    // If the module loaded but throws on first use, catch it
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

interface ScheduleTime {
  hour: number;
  minute: number;
}

export async function scheduleRewardsNotifications(
  firstRun: ScheduleTime,
  retryTimes: ScheduleTime[]
): Promise<{ scheduled: number }> {
  if (Platform.OS === "web") return { scheduled: 0 };
  const Notifications = getNotifications();
  if (!Notifications) return { scheduled: 0 };

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}

  const allTimes = [firstRun, ...retryTimes];
  let count = 0;

  for (const t of allTimes) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "MS Rewards — Daily Run",
          body: "Tap to automatically run your daily Bing searches and earn points.",
          data: { action: "start_run" },
          sound: true,
        },
        trigger: {
          hour: t.hour,
          minute: t.minute,
          repeats: true,
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
