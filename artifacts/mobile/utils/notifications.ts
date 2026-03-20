import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const PENDING_RUN_KEY = "@ms_rewards_pending_run";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
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

  await Notifications.cancelAllScheduledNotificationsAsync();

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
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledCount(): Promise<number> {
  if (Platform.OS === "web") return 0;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.length;
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
