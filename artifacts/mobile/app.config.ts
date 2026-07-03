import { ExpoConfig, ConfigContext } from "expo/config";

const IS_OWNER = process.env.EXPO_PUBLIC_OWNER_MODE === "true";

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "Macro R",
  slug: "mobile",
  version: "1.4.03",
  orientation: "portrait",
  icon: "./assets/images/iconn.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0f172a",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.msrewards.automation",
  },
  android: {
    package: "com.msrewards.automation",
    permissions: [
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.VIBRATE",
      "android.permission.WAKE_LOCK",
      "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.CAMERA",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  web: {
    favicon: "./assets/images/icon.png",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: "https://replit.com/",
      },
    ],
    "expo-font",
    "expo-web-browser",
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: "#3B82F6",
        sounds: [],
      },
    ],
    "expo-task-manager",
    "./plugins/withBackgroundActions",
    "expo-updates",
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow Macro R to access your camera to scan QR codes.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Macro R to access your photos to scan QR codes from images.",
        cameraPermission:
          "Allow Macro R to access your camera to scan QR codes.",
      },
    ],
  ],
  updates: {
    url: "https://u.expo.dev/e44f3f61-0e90-468d-9a3d-378d6aaf7c45",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ownerMode: IS_OWNER,
    // apiUrl is read by the app via Constants.expoConfig.extra.apiUrl.
    // Embedding it here (instead of relying on process.env) means EAS Update
    // re-evaluates this file when publishing an OTA update and packages the
    // correct URL into the update manifest — surviving every OTA push.
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ||
      "https://macro-r-631x.onrender.com/api",
    eas: {
      projectId: "e44f3f61-0e90-468d-9a3d-378d6aaf7c45",
    },
  },
  owner: "meoow123",
});
