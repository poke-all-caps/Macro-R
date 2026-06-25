import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Linking, Platform } from "react-native";

export const PENDING_RUN_KEY = "@ms_rewards_pending_run";
const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

type NotificationsModule = typeof import("expo-notifications");

function getNotifications(): NotificationsModule | null {
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

export function registerBackgroundNotificationTask(): void {
  if (Platform.OS === "web") return;
  try {
    const TaskManager = require("expo-task-manager");
    const Notifications = getNotifications();
    if (!TaskManager || !Notifications) return;

    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
      if (error) {
        console.log("[BackgroundTask] Error:", error);
        return;
      }
      const action = data?.notification?.request?.content?.data?.action;
      if (action === "start_run") {
        console.log("[BackgroundTask] Notification received — running searches in background");
        try {
          const bgSearch = require("./backgroundSearch");
          const run = bgSearch.runBackgroundSearches ?? bgSearch.default?.runBackgroundSearches;
          if (run) {
            await run();
          } else {
            throw new Error("runBackgroundSearches not found in module");
          }
        } catch (e) {
          console.log("[BackgroundTask] Background search failed, falling back to app launch:", e);
          await AsyncStorage.setItem(PENDING_RUN_KEY, "true");
          try {
            await Linking.openURL("mobile://start-run");
          } catch {
            try {
              await Linking.openURL("mobile://");
            } catch {}
          }
        }
      }
    });

    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
    console.log("[Notifications] Background task registered");
  } catch (e) {
    console.log("[Notifications] Failed to register background task:", e);
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
      await Notifications.setNotificationChannelAsync("macro-rewards", {
        name: "Macro Rewards",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        bypassDnd: true,
      });

      try {
        await Notifications.deleteNotificationChannelAsync("default");
      } catch {}
      try {
        await Notifications.deleteNotificationChannelAsync("alarms");
      } catch {}
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

export async function requestExactAlarmPermission(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const IntentLauncher = require("expo-intent-launcher");
    if (IntentLauncher?.startActivityAsync) {
      await IntentLauncher.startActivityAsync("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
    }
  } catch {}
}

export async function promptBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;
  const key = "@ms_rewards_battery_opt_prompted";
  const prompted = await AsyncStorage.getItem(key);
  if (prompted) return;

  await AsyncStorage.setItem(key, "true");
  Alert.alert(
    "Disable Battery Optimization",
    "For scheduled notifications to fire on time, you need to disable battery optimization for this app.\n\nGo to: Settings → Apps → Macro R → Battery → Unrestricted",
    [
      { text: "Later", style: "cancel" },
      {
        text: "Open Settings",
        onPress: () => {
          try {
            Linking.openSettings();
          } catch {}
        },
      },
    ]
  );
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

  

  // Prompt user about battery optimization (once)
  await promptBatteryOptimization();

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}

  const channelId = Platform.OS === "android" ? "macro-rewards" : undefined;
  let count = 0;

  for (const slot of slots) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Macro Rewards — Overnight Run",
          body: "Starting your overnight Bing searches...",
          data: { action: "start_run" },
          sound: "default",
          priority: "max",
          ...(Platform.OS === "android" && { channelId }),
        },
        trigger: {
          type: "daily",
          hour: slot.hour,
          minute: slot.minute,
          channelId,
        } as any,
      });
      count++;
      console.log(`[Notifications] Scheduled daily notification for ${slot.hour}:${String(slot.minute).padStart(2, '0')}`);
    } catch (e) {
      console.log(`[Notifications] daily trigger failed for ${slot.hour}:${String(slot.minute).padStart(2, '0')}:`, e);
      // Fallback: calculate exact seconds until target time
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
            priority: "max",
            ...(Platform.OS === "android" && { channelId }),
          },
          trigger: {
            type: "timeInterval",
            seconds,
            repeats: true,
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
        ...(Platform.OS === "android" && { channelId: "macro-rewards" }),
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
        ...(Platform.OS === "android" && { channelId: "macro-rewards" }),
      },
      trigger: null,
    });
  } catch {}
}

const EXPIRY_NOTIF_IDS_KEY = "@ms_rewards_expiry_notif_ids";

export async function scheduleExpiryNotifications(expiresAt: string): Promise<void> {
  if (Platform.OS === "web") return;
  const Notifications = getNotifications();
  if (!Notifications) return;

  await cancelExpiryNotifications();

  const expiry = new Date(expiresAt).getTime();
  const now = Date.now();
  const channelId = Platform.OS === "android" ? "macro-rewards" : undefined;
  const ids: string[] = [];

  const candidates = [
    {
      offsetDays: 7,
      title: "License Expiring Soon",
      body: "Your Macro R license expires in 7 days. Open the app to renew.",
    },
    {
      offsetDays: 1,
      title: "License Expires Tomorrow",
      body: "Your Macro R license expires tomorrow. Open the app to renew.",
    },
  ];

  for (const { offsetDays, title, body } of candidates) {
    const fireAt = expiry - offsetDays * 24 * 60 * 60 * 1000;
    if (fireAt <= now) continue;
    const seconds = Math.floor((fireAt - now) / 1000);
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { action: "license_expiry" },
          sound: "default",
          ...(Platform.OS === "android" && { channelId }),
        },
        trigger: { type: "timeInterval", seconds, repeats: false } as any,
      });
      ids.push(id);
    } catch (e) {
      console.log(`[Notifications] Failed to schedule expiry notif (${offsetDays}d):`, e);
    }
  }

  if (ids.length > 0) {
    await AsyncStorage.setItem(EXPIRY_NOTIF_IDS_KEY, JSON.stringify(ids));
    console.log(`[Notifications] Scheduled ${ids.length} expiry notification(s)`);
  }
}

export async function cancelExpiryNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    const stored = await AsyncStorage.getItem(EXPIRY_NOTIF_IDS_KEY);
    if (!stored) return;
    const ids: string[] = JSON.parse(stored);
    for (const id of ids) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    }
    await AsyncStorage.removeItem(EXPIRY_NOTIF_IDS_KEY);
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
