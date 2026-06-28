import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Crypto from "expo-crypto";
import { scheduleExpiryNotifications, cancelExpiryNotifications } from "@/utils/notifications";
import { API_BASE } from "@/utils/apiUrl";
export { API_BASE } from "@/utils/apiUrl";

export const LICENSING_ENABLED = true;

const LICENSE_KEY_STORAGE = "@ms_rewards_license_key";
const LICENSE_DATA_STORAGE = "@ms_rewards_license_data";
const ADMIN_SECRET_STORAGE = "@ms_rewards_admin_secret";
const ADMIN_VALIDATED_AT_STORAGE = "@ms_rewards_admin_validated_at";
const DEVICE_ID_STORAGE = "@ms_rewards_device_id";
const ADMIN_VISIBLE_STORAGE = "@ms_rewards_admin_visible";
const PIN_STORAGE = "@ms_rewards_pin";
export const SERVER_HYDRATION_STORAGE = "@ms_rewards_server_hydration";

export const OWNER_MODE =
  process.env.EXPO_PUBLIC_OWNER_MODE === "true";

const ADMIN_OFFLINE_GRACE_DAYS = 7;

async function getDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE);
  if (stored) return stored;

  let id: string;
  if (Platform.OS === "android") {
    id = Application.getAndroidId() || Crypto.randomUUID();
  } else {
    id = Crypto.randomUUID();
  }
  await AsyncStorage.setItem(DEVICE_ID_STORAGE, id);
  return id;
}

export interface FeatureConfig {
  keyType: string;
  maxAccounts: number;
  maxSearches: number;
  minDelaySeconds: number;
  backgroundEnabled: boolean;
  customQueriesEnabled: boolean;
  dailySetEnabled: boolean;
  pcSearchEnabled: boolean;
}

export interface ServerAccount {
  email: string;
  name: string;
  cookies: Record<string, string>;
}

const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  keyType: "basic",
  maxAccounts: 2,
  maxSearches: 20,
  minDelaySeconds: 5,
  backgroundEnabled: false,
  customQueriesEnabled: false,
  dailySetEnabled: true,
  pcSearchEnabled: false,
};

const FEATURE_CONFIG_STORAGE = "@ms_rewards_feature_config";

interface LicenseData {
  key: string;
  maxAccounts: number;
  expiresAt: string;
  label: string | null;
  keyType: string;
  validatedAt: number;
  featureConfig?: FeatureConfig | null;
}

interface LicenseContextValue {
  isLicensed: boolean;
  isAdmin: boolean;
  isOwnerMode: boolean;
  isLoading: boolean;
  licenseData: LicenseData | null;
  featureConfig: FeatureConfig;
  adminSecret: string | null;
  error: string | null;
  adminPanelVisible: boolean;
  pinRequired: boolean;
  pinIsNew: boolean;
  setAdminPanelVisible: (visible: boolean) => Promise<void>;
  activateKey: (key: string) => Promise<boolean>;
  submitPin: (pin: string) => Promise<{ success: boolean; error?: string; serverAccounts?: ServerAccount[] }>;
  removeLicense: () => Promise<void>;
  revalidate: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue>({
  isLicensed: false,
  isAdmin: false,
  isOwnerMode: false,
  isLoading: true,
  licenseData: null,
  featureConfig: DEFAULT_FEATURE_CONFIG,
  adminSecret: null,
  error: null,
  adminPanelVisible: false,
  pinRequired: false,
  pinIsNew: false,
  setAdminPanelVisible: async () => {},
  activateKey: async () => false,
  submitPin: async () => ({ success: false }),
  removeLicense: async () => {},
  revalidate: async () => {},
});

const OWNER_FEATURE_CONFIG: FeatureConfig = {
  keyType: "admin",
  maxAccounts: 999,
  maxSearches: 999,
  minDelaySeconds: 1,
  backgroundEnabled: true,
  customQueriesEnabled: true,
  dailySetEnabled: true,
  pcSearchEnabled: true,
};

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  if (!LICENSING_ENABLED) {
    return (
      <LicenseContext.Provider value={{
        isLicensed: true,
        isAdmin: true,
        isOwnerMode: true,
        isLoading: false,
        licenseData: null,
        featureConfig: OWNER_FEATURE_CONFIG,
        adminSecret: null,
        error: null,
        adminPanelVisible: false,
        pinRequired: false,
        pinIsNew: false,
        setAdminPanelVisible: async () => {},
        activateKey: async () => true,
        submitPin: async () => ({ success: true }),
        removeLicense: async () => {},
        revalidate: async () => {},
      }}>
        {children}
      </LicenseContext.Provider>
    );
  }

  const [isLicensed, setIsLicensed] = useState(OWNER_MODE);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(!OWNER_MODE);
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [featureConfig, setFeatureConfig] = useState<FeatureConfig>(OWNER_MODE ? OWNER_FEATURE_CONFIG : DEFAULT_FEATURE_CONFIG);
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminPanelVisible, setAdminPanelVisibleState] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinIsNew, setPinIsNew] = useState(false);
  const pendingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ADMIN_VISIBLE_STORAGE).then((val) => {
      if (val === "true") setAdminPanelVisibleState(true);
    });
  }, []);

  const setAdminPanelVisible = useCallback(async (visible: boolean) => {
    setAdminPanelVisibleState(visible);
    await AsyncStorage.setItem(ADMIN_VISIBLE_STORAGE, visible ? "true" : "false");
  }, []);

  const validateKey = useCallback(async (key: string, pin?: string): Promise<{
    valid: boolean;
    requiresPin?: boolean;
    pinSet?: boolean;
    error?: string;
    maxAccounts?: number;
    expiresAt?: string;
    label?: string;
    keyType?: string;
    featureConfig?: FeatureConfig;
    accounts?: ServerAccount[];
    offline?: boolean;
  }> => {
    try {
      const deviceId = await getDeviceId();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const body: Record<string, any> = { key, deviceId };
        if (pin !== undefined && pin !== null) body.pin = pin;
        const resp = await fetch(`${API_BASE}/validate-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        return await resp.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      const timedOut = e?.name === "AbortError";
      return {
        valid: false,
        error: timedOut
          ? "Server is starting up — please try again in a moment"
          : "Could not connect to server",
        offline: true,
      };
    }
  }, []);

  const validateAdmin = useCallback(async (secret: string): Promise<{ valid: boolean; offline?: boolean }> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const resp = await fetch(`${API_BASE}/validate-admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return { valid: false };
        const data = await resp.json();
        return { valid: data.valid === true };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { valid: false, offline: true };
    }
  }, []);

  const loadCachedFeatureConfig = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(FEATURE_CONFIG_STORAGE);
      if (cached) {
        setFeatureConfig(JSON.parse(cached));
      }
    } catch {}
  }, []);

  const appendTierChangeLog = useCallback(async (oldTier: string, newTier: string, keyRef: string): Promise<void> => {
    try {
      const entry = {
        id: `tier-change-${Date.now()}`,
        accountId: "system",
        accountName: "System",
        timestamp: new Date().toISOString(),
        searchesDone: 0,
        dailySetDone: false,
        pointsEarned: 0,
        status: "success" as const,
        errorMessage: `License tier changed: ${oldTier.toUpperCase()} → ${newTier.toUpperCase()} (Key: ...${keyRef.slice(-9)})`,
      };
      const raw = await AsyncStorage.getItem("@ms_rewards_logs");
      const logs = raw ? JSON.parse(raw) : [];
      logs.unshift(entry);
      if (logs.length > 200) logs.length = 200;
      await AsyncStorage.setItem("@ms_rewards_logs", JSON.stringify(logs));
    } catch {}
  }, []);

  const saveFeatureConfig = useCallback(async (cfg: FeatureConfig) => {
    setFeatureConfig(cfg);
    await AsyncStorage.setItem(FEATURE_CONFIG_STORAGE, JSON.stringify(cfg));
  }, []);

  const applyValidResult = useCallback(async (
    storedKey: string,
    result: { maxAccounts?: number; expiresAt?: string; label?: string; keyType?: string; featureConfig?: FeatureConfig | null },
    prevData: LicenseData | null
  ) => {
    if (prevData?.keyType && result.keyType && prevData.keyType !== result.keyType) {
      await appendTierChangeLog(prevData.keyType, result.keyType, storedKey);
    }
    const isOwnerKey = result.keyType === "admin";
    const data: LicenseData = {
      key: storedKey,
      maxAccounts: result.maxAccounts!,
      expiresAt: result.expiresAt!,
      label: result.label ?? null,
      keyType: result.keyType ?? "basic",
      validatedAt: Date.now(),
      featureConfig: result.featureConfig ?? null,
    };
    await AsyncStorage.setItem(LICENSE_DATA_STORAGE, JSON.stringify(data));
    setLicenseData(data);
    setIsLicensed(true);
    setIsAdmin(isOwnerKey);
    setError(null);
    setPinRequired(false);
    if (isOwnerKey) {
      setFeatureConfig(OWNER_FEATURE_CONFIG);
    } else if (result.featureConfig) {
      await saveFeatureConfig(result.featureConfig);
    }
    scheduleExpiryNotifications(result.expiresAt!).catch(() => {});
  }, [appendTierChangeLog, saveFeatureConfig]);

  const loadStoredLicense = useCallback(async () => {
    if (OWNER_MODE) {
      setIsLicensed(true);
      setIsLoading(false);
      return;
    }
    try {
      const storedAdminSecret = await AsyncStorage.getItem(ADMIN_SECRET_STORAGE);
      if (storedAdminSecret) {
        const result = await validateAdmin(storedAdminSecret);
        if (result.valid) {
          await AsyncStorage.setItem(ADMIN_VALIDATED_AT_STORAGE, Date.now().toString());
          setAdminSecret(storedAdminSecret);
          setIsAdmin(true);
          setIsLicensed(true);
          setFeatureConfig(OWNER_FEATURE_CONFIG);
          setIsLoading(false);
          return;
        } else if (result.offline) {
          const validatedAtStr = await AsyncStorage.getItem(ADMIN_VALIDATED_AT_STORAGE);
          const validatedAt = validatedAtStr ? parseInt(validatedAtStr, 10) : 0;
          const daysSince = (Date.now() - validatedAt) / (1000 * 60 * 60 * 24);
          if (daysSince <= ADMIN_OFFLINE_GRACE_DAYS) {
            setAdminSecret(storedAdminSecret);
            setIsAdmin(true);
            setIsLicensed(true);
            setFeatureConfig(OWNER_FEATURE_CONFIG);
            setIsLoading(false);
            return;
          }
          await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
          await AsyncStorage.removeItem(ADMIN_VALIDATED_AT_STORAGE);
        } else {
          await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
          await AsyncStorage.removeItem(ADMIN_VALIDATED_AT_STORAGE);
        }
      }

      const storedKey = await AsyncStorage.getItem(LICENSE_KEY_STORAGE);
      const storedData = await AsyncStorage.getItem(LICENSE_DATA_STORAGE);
      const storedPin = await AsyncStorage.getItem(PIN_STORAGE);

      if (!storedKey) {
        setIsLoading(false);
        return;
      }

      const result = await validateKey(storedKey, storedPin ?? undefined);

      if (result.valid) {
        if (!result.maxAccounts || !result.expiresAt) {
          setError("Server returned incomplete license data");
          setIsLicensed(false);
          setIsLoading(false);
          return;
        }
        const prevData = storedData ? (JSON.parse(storedData) as LicenseData) : null;
        await applyValidResult(storedKey, result, prevData);
        // Write server accounts to AsyncStorage so AccountsContext can merge them on hydration
        if (result.accounts && result.accounts.length > 0) {
          await AsyncStorage.setItem(SERVER_HYDRATION_STORAGE, JSON.stringify(result.accounts));
        }
      } else if (result.requiresPin) {
        // PIN required but not stored locally — ask the user to re-enter
        pendingKeyRef.current = storedKey;
        setPinIsNew(!result.pinSet);
        setPinRequired(true);
        if (storedData) {
          // Fall back to cached data so features/config remain while showing PIN prompt
          const data: LicenseData = JSON.parse(storedData);
          if (new Date(data.expiresAt).getTime() > Date.now()) {
            setLicenseData(data);
            if (data.keyType === "admin") {
              setIsAdmin(true);
              setFeatureConfig(OWNER_FEATURE_CONFIG);
            } else {
              await loadCachedFeatureConfig();
            }
          }
        }
      } else if (result.offline && storedData) {
        const data: LicenseData = JSON.parse(storedData);
        if (new Date(data.expiresAt).getTime() > Date.now()) {
          setLicenseData(data);
          setIsLicensed(true);
          if (data.keyType === "admin") {
            setIsAdmin(true);
            setFeatureConfig(OWNER_FEATURE_CONFIG);
          } else {
            await loadCachedFeatureConfig();
          }
        } else {
          setError("License key has expired");
          setIsLicensed(false);
        }
      } else if (result.offline) {
        setError(result.error || "Could not connect to server");
        setIsLicensed(false);
      } else {
        setError(result.error || "Invalid key");
        setIsLicensed(false);
      }
    } catch {
      const cachedData = await AsyncStorage.getItem(LICENSE_DATA_STORAGE);
      if (cachedData) {
        const data: LicenseData = JSON.parse(cachedData);
        if (new Date(data.expiresAt).getTime() > Date.now()) {
          setLicenseData(data);
          setIsLicensed(true);
          await loadCachedFeatureConfig();
        }
      }
    }
    setIsLoading(false);
  }, [validateKey, validateAdmin, loadCachedFeatureConfig, applyValidResult]);

  useEffect(() => {
    loadStoredLicense();
  }, [loadStoredLicense]);

  const activateKey = useCallback(async (key: string): Promise<boolean> => {
    setError(null);
    const trimmed = key.trim();

    const adminResult = await validateAdmin(trimmed);
    if (adminResult.valid) {
      await AsyncStorage.setItem(ADMIN_SECRET_STORAGE, trimmed);
      await AsyncStorage.setItem(ADMIN_VALIDATED_AT_STORAGE, Date.now().toString());
      await AsyncStorage.removeItem(LICENSE_KEY_STORAGE);
      await AsyncStorage.removeItem(LICENSE_DATA_STORAGE);
      await AsyncStorage.removeItem(PIN_STORAGE);
      cancelExpiryNotifications().catch(() => {});
      setAdminSecret(trimmed);
      setIsAdmin(true);
      setIsLicensed(true);
      setLicenseData(null);
      setFeatureConfig(OWNER_FEATURE_CONFIG);
      setPinRequired(false);
      return true;
    }

    const upperKey = trimmed.toUpperCase();
    // First call without PIN — server will tell us if PIN is required
    const result = await validateKey(upperKey);

    if (result.requiresPin) {
      // Key is valid; PIN step needed before granting access
      pendingKeyRef.current = upperKey;
      await AsyncStorage.setItem(LICENSE_KEY_STORAGE, upperKey);
      setPinIsNew(!result.pinSet);
      setPinRequired(true);
      setError(null);
      return false;
    }

    if (!result.valid) {
      setError(result.error || "Invalid key");
      return false;
    }

    if (!result.maxAccounts || !result.expiresAt) {
      setError("Server returned incomplete license data");
      return false;
    }

    const isOwnerKey = result.keyType === "admin";
    const data: LicenseData = {
      key: upperKey,
      maxAccounts: result.maxAccounts,
      expiresAt: result.expiresAt,
      label: result.label ?? null,
      keyType: result.keyType ?? "basic",
      validatedAt: Date.now(),
      featureConfig: result.featureConfig ?? null,
    };

    await AsyncStorage.setItem(LICENSE_KEY_STORAGE, upperKey);
    await AsyncStorage.setItem(LICENSE_DATA_STORAGE, JSON.stringify(data));
    await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
    await AsyncStorage.removeItem(ADMIN_VALIDATED_AT_STORAGE);
    const effectiveConfig = isOwnerKey ? OWNER_FEATURE_CONFIG : (result.featureConfig ?? null);
    if (effectiveConfig) {
      await saveFeatureConfig(effectiveConfig);
    }
    scheduleExpiryNotifications(result.expiresAt).catch(() => {});
    setLicenseData(data);
    setIsLicensed(true);
    setIsAdmin(isOwnerKey);
    setAdminSecret(null);
    setPinRequired(false);
    if (isOwnerKey) setFeatureConfig(OWNER_FEATURE_CONFIG);
    return true;
  }, [validateKey, validateAdmin, saveFeatureConfig]);

  const submitPin = useCallback(async (pin: string): Promise<{ success: boolean; error?: string; serverAccounts?: ServerAccount[] }> => {
    const key = pendingKeyRef.current;
    if (!key) return { success: false, error: "No pending key" };

    const result = await validateKey(key, pin);

    if (result.valid && result.maxAccounts && result.expiresAt) {
      // PIN accepted — save it locally for future revalidations
      await AsyncStorage.setItem(PIN_STORAGE, pin);
      const prevDataRaw = await AsyncStorage.getItem(LICENSE_DATA_STORAGE);
      const prevData = prevDataRaw ? (JSON.parse(prevDataRaw) as LicenseData) : null;
      await applyValidResult(key, result, prevData);
      pendingKeyRef.current = null;
      return { success: true, serverAccounts: result.accounts ?? [] };
    }

    if (result.error) {
      setError(result.error);
      return { success: false, error: result.error };
    }

    setError("Authentication failed");
    return { success: false, error: "Authentication failed" };
  }, [validateKey, applyValidResult]);

  const removeLicense = useCallback(async () => {
    cancelExpiryNotifications().catch(() => {});
    await AsyncStorage.removeItem(LICENSE_KEY_STORAGE);
    await AsyncStorage.removeItem(LICENSE_DATA_STORAGE);
    await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
    await AsyncStorage.removeItem(ADMIN_VALIDATED_AT_STORAGE);
    await AsyncStorage.removeItem(FEATURE_CONFIG_STORAGE);
    await AsyncStorage.removeItem(PIN_STORAGE);
    await AsyncStorage.removeItem(SERVER_HYDRATION_STORAGE);
    pendingKeyRef.current = null;
    setLicenseData(null);
    setFeatureConfig(DEFAULT_FEATURE_CONFIG);
    setIsLicensed(false);
    setIsAdmin(false);
    setAdminSecret(null);
    setError(null);
    setPinRequired(false);
  }, []);

  const revalidate = useCallback(async () => {
    setIsLoading(true);
    await loadStoredLicense();
  }, [loadStoredLicense]);

  return (
    <LicenseContext.Provider value={{
      isLicensed, isAdmin, isOwnerMode: OWNER_MODE || isAdmin, isLoading,
      licenseData, featureConfig, adminSecret, error, adminPanelVisible,
      pinRequired, pinIsNew,
      setAdminPanelVisible, activateKey, submitPin, removeLicense, revalidate,
    }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
