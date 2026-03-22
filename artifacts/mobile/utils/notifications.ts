import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const PENDING_RUN_KEY = "@ms_rewards_pending_run";

type NotificationsModule = typeof import("expo-notifications");

function getNotifications(): NotificationsModule | null {
  try {
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

export async function setupNotificationHandler(): Promise<void> {
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

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Macro Rewards",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
      });
    }
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
          title: "Macro Rewards — Overnight Run",
          body: "Starting your overnight Bing searches...",
          data: { action: "start_run" },
          sound: "default",
          ...(Platform.OS === "android" && { channelId: "default" }),
        },
        trigger: {
          type: "daily",
          hour: slot.hour,
          minute: slot.minute,
          channelId: Platform.OS === "android" ? "default" : undefined,
        } as any,
      });
      count++;
      console.log(`[Notifications] Scheduled daily notification for ${slot.hour}:${String(slot.minute).padStart(2, '0')}`);
    } catch (e) {
      console.log(`[Notifications] Failed to schedule ${slot.hour}:${String(slot.minute).padStart(2, '0')}:`, e);
      try {
        const now = new Date();
        const target = new Date();
        target.setHours(slot.hour, slot.minute, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const seconds = Math.max(60, Math.floor((target.getTime() - now.getTime()) / 1000));
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Macro Rewards — Overnight Run",
            body: "Starting your overnight Bing searches...",
            data: { action: "start_run" },
            sound: "default",
            ...(Platform.OS === "android" && { channelId: "default" }),
          },
          trigger: {
            type: "timeInterval",
            seconds,
            repeats: false,
          } as any,
        });
        count++;
        console.log(`[Notifications] Fallback: scheduled timeInterval ${seconds}s for ${slot.hour}:${String(slot.minute).padStart(2, '0')}`);
      } catch (e2) {
        console.log(`[Notifications] Fallback also failed:`, e2);
      }
    }
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

export function addNotificationReceivedListener(
  callback: (notification: any) => void
): { remove: () => void } {
  const Notifications = getNotifications();
  if (!Notifications) return { remove: () => {} };
  try {
    return Notifications.addNotificationReceivedListener(callback);
  } catch {
    return { remove: () => {} };
  }
}

export async function showRunningNotification(): Promise<string | null> {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Macro Rewards — Searching...",
        body: "Overnight search is running. Tap to open and stop.",
        data: { action: "open_running" },
        sound: false,
        sticky: true,
        ...(Platform.OS === "android" && { channelId: "default" }),
      },
      trigger: null,
    });
    return id;
  } catch {
    return null;
  }
}

export async function dismissRunningNotification(id: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.dismissNotificationAsync(id);
  } catch {}
}

export async function showCompletedNotification(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Macro Rewards — Done!",
        body: "Overnight search completed successfully.",
        data: { action: "run_complete" },
        sound: "default",
        ...(Platform.OS === "android" && { channelId: "default" }),
      },
      trigger: null,
    });
  } catch {}
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
