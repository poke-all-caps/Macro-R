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
      // Handle both the new silent bg trigger and legacy start_run action
      if (action === "bg_search_trigger" || action === "start_run") {
        console.log("[BackgroundTask] Overnight trigger received — auto-running background searches");
        try {
          const bgSearch = require("./backgroundSearch");
          const run = bgSearch.runBackgroundSearches ?? bgSearch.default?.runBackgroundSearches;
          if (run) {
            await run();
          } else {
            throw new Error("runBackgroundSearches not found in module");
          }
        } catch (e) {
          console.log("[BackgroundTask] Background search failed, setting pending flag:", e);
          await AsyncStorage.setItem(PENDING_RUN_KEY, "true");
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
      // General channel — status updates, completion notices
      await Notifications.setNotificationChannelAsync("macro-rewards", {
        name: "Macro Rewards — Status",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        bypassDnd: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // Alarm channel — overnight schedule triggers; bypasses DND, full lock-screen
      await Notifications.setNotificationChannelAsync("macro-rewards-alarm", {
        name: "Macro Rewards — Overnight Alarm",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        enableVibrate: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
      });

      // Persistent channel — always-on overnight status indicator (silent, no vibration)
      // Must be DEFAULT importance so Android honours the ongoing/non-dismissable flag.
      await Notifications.setNotificationChannelAsync("macro-rewards-persistent", {
        name: "Macro Rewards — Schedule Status",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: undefined,
        enableVibrate: false,
        bypassDnd: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: false,
      });

      try { await Notifications.deleteNotificationChannelAsync("default"); } catch {}
      try { await Notifications.deleteNotificationChannelAsync("alarms"); } catch {}
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

  // Use the silent persistent channel — these are background wake triggers, NOT user-facing alarms.
  // They fire at the scheduled time and wake up the background task to auto-run searches silently.
  const channelId = Platform.OS === "android" ? "macro-rewards-persistent" : undefined;
  let count = 0;

  const triggerContent = {
    title: "Macro Rewards — Running overnight searches",
    body: "Background searches are running automatically.",
    data: { action: "bg_search_trigger" },
    sound: false,
    ...(Platform.OS === "android" && {
      channelId,
      priority: "low",
      sticky: false,
    }),
  };

  for (const slot of slots) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: triggerContent,
        trigger: {
          type: "daily",
          hour: slot.hour,
          minute: slot.minute,
          channelId,
        } as any,
      });
      count++;
      console.log(`[Notifications] Scheduled bg trigger for ${slot.hour}:${String(slot.minute).padStart(2, '0')}`);
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
          content: triggerContent,
          trigger: {
            type: "timeInterval",
            seconds,
            repeats: true,
          } as any,
        });
        count++;
        console.log(`[Notifications] Fallback trigger: ${seconds}s for ${slot.hour}:${String(slot.minute).padStart(2, '0')}`);
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
        title: "Macro Rewards — Searches Running",
        body: "Tap to return to the search screen and monitor progress.",
        data: { action: "open_running" },
        sound: false,
        sticky: true,
        priority: "max",
        ...(Platform.OS === "android" && {
          channelId: "macro-rewards",
          // Show notification content on lock screen (not just "1 notification")
          lockscreenVisibility: 1, // VISIBILITY_PUBLIC
        }),
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

export async function getInitialNotificationResponse(): Promise<any | null> {
  const Notifications = getNotifications();
  if (!Notifications) return null;
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

// ── Persistent 24/7 overnight status notification ───────────────────────────
const PERSISTENT_NOTIF_ID_KEY = "@ms_rewards_persistent_notif_id";
const OVERNIGHT_CATEGORY = "overnight-controls";

async function setupOvernightNotificationCategory(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS === "web") return;
  try {
    await Notifications.setNotificationCategoryAsync(OVERNIGHT_CATEGORY, [
      {
        identifier: "search_now",
        buttonTitle: "Search Now",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "edit_schedule",
        buttonTitle: "Edit Schedule",
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.log("[Notifications] Failed to set overnight category:", e);
  }
}

export async function showOvernightPersistentNotification(slots?: Array<{ hour: number; minute: number }>): Promise<void> {
  if (Platform.OS === "web") return;
  const Notifications = getNotifications();
  if (!Notifications) return;

  await dismissOvernightPersistentNotification();
  await setupOvernightNotificationCategory();

  let scheduleText = "Searches will run automatically at scheduled times.";
  if (slots && slots.length > 0) {
    const fmt = (h: number, m: number) => {
      const ampm = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    scheduleText = "Next runs: " + slots.map((s) => fmt(s.hour, s.minute)).join(" · ");
  }

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "🌙 Overnight Schedule Active",
        body: scheduleText,
        data: { action: "overnight_status" },
        // sticky: true → sets FLAG_ONGOING_EVENT + FLAG_NO_CLEAR on Android
        // so the user cannot swipe this notification away.
        sticky: true,
        sound: false,
        categoryIdentifier: OVERNIGHT_CATEGORY,
        ...(Platform.OS === "android" && {
          channelId: "macro-rewards-persistent",
          color: "#6366F1",
        }),
      },
      trigger: null,
    });
    await AsyncStorage.setItem(PERSISTENT_NOTIF_ID_KEY, id);
    console.log("[Notifications] Persistent overnight notification shown:", id);
  } catch (e) {
    console.log("[Notifications] Failed to show persistent notification:", e);
  }
}

export async function dismissOvernightPersistentNotification(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    const id = await AsyncStorage.getItem(PERSISTENT_NOTIF_ID_KEY);
    if (id) {
      try { await Notifications.dismissNotificationAsync(id); } catch {}
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
      await AsyncStorage.removeItem(PERSISTENT_NOTIF_ID_KEY);
    }
  } catch {}
}

export async function hasPersistentNotification(): Promise<boolean> {
  const id = await AsyncStorage.getItem(PERSISTENT_NOTIF_ID_KEY);
  return !!id;
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
