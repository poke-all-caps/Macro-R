import AsyncStorage from "@react-native-async-storage/async-storage";

const OVERNIGHT_FEATURE_KEY = "@ms_rewards_overnight_feature_enabled";

export async function isOvernightFeatureEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(OVERNIGHT_FEATURE_KEY);
    if (val === null) return true; // default: enabled
    return val === "true";
  } catch {
    return true;
  }
}

export async function setOvernightFeatureEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(OVERNIGHT_FEATURE_KEY, enabled ? "true" : "false");
  } catch {}
}
