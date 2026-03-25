import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Crypto from "expo-crypto";

const LICENSE_KEY_STORAGE = "@ms_rewards_license_key";
const LICENSE_DATA_STORAGE = "@ms_rewards_license_data";
const ADMIN_SECRET_STORAGE = "@ms_rewards_admin_secret";
const ADMIN_VALIDATED_AT_STORAGE = "@ms_rewards_admin_validated_at";
const DEVICE_ID_STORAGE = "@ms_rewards_device_id";
const ADMIN_VISIBLE_STORAGE = "@ms_rewards_admin_visible";
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : "");
export const OWNER_MODE = false;

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
}

const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  keyType: "basic",
  maxAccounts: 2,
  maxSearches: 20,
  minDelaySeconds: 5,
  backgroundEnabled: false,
  customQueriesEnabled: false,
  dailySetEnabled: true,
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
  setAdminPanelVisible: (visible: boolean) => Promise<void>;
  activateKey: (key: string) => Promise<boolean>;
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
  setAdminPanelVisible: async () => {},
  activateKey: async () => false,
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
};

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [isLicensed, setIsLicensed] = useState(OWNER_MODE);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(!OWNER_MODE);
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [featureConfig, setFeatureConfig] = useState<FeatureConfig>(OWNER_MODE ? OWNER_FEATURE_CONFIG : DEFAULT_FEATURE_CONFIG);
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminPanelVisible, setAdminPanelVisibleState] = useState(false);

  useEffect(() => {
    if (OWNER_MODE) {
      AsyncStorage.getItem(ADMIN_VISIBLE_STORAGE).then((val) => {
        if (val === "true") setAdminPanelVisibleState(true);
      });
    }
  }, []);

  const setAdminPanelVisible = useCallback(async (visible: boolean) => {
    setAdminPanelVisibleState(visible);
    await AsyncStorage.setItem(ADMIN_VISIBLE_STORAGE, visible ? "true" : "false");
  }, []);

  const validateKey = useCallback(async (key: string): Promise<{ valid: boolean; error?: string; maxAccounts?: number; expiresAt?: string; label?: string; keyType?: string; featureConfig?: FeatureConfig; offline?: boolean }> => {
    try {
      const deviceId = await getDeviceId();
      const resp = await fetch(`${API_BASE}/validate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, deviceId }),
      });
      return await resp.json();
    } catch {
      return { valid: false, error: "Could not connect to server", offline: true };
    }
  }, []);

  const validateAdmin = useCallback(async (secret: string): Promise<{ valid: boolean; offline?: boolean }> => {
    try {
      const resp = await fetch(`${API_BASE}/validate-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!resp.ok) return { valid: false };
      const data = await resp.json();
      return { valid: data.valid === true };
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

  const saveFeatureConfig = useCallback(async (cfg: FeatureConfig) => {
    setFeatureConfig(cfg);
    await AsyncStorage.setItem(FEATURE_CONFIG_STORAGE, JSON.stringify(cfg));
  }, []);


  const loadStoredLicense = useCallback(async () => {
    if (OWNER_MODE) {
      setIsLicensed(true);
      setIsLoading(false);
      return;
    }
    try {
      if (Platform.OS === "web") {
        await AsyncStorage.multiRemove([
          ADMIN_SECRET_STORAGE, ADMIN_VALIDATED_AT_STORAGE,
          LICENSE_KEY_STORAGE, LICENSE_DATA_STORAGE,
          FEATURE_CONFIG_STORAGE, ADMIN_VISIBLE_STORAGE,
        ]);
      }
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

      if (!storedKey) {
        setIsLoading(false);
        return;
      }

      if (storedData) {
        const data: LicenseData = JSON.parse(storedData);
        const now = Date.now();
        const expiresAt = new Date(data.expiresAt).getTime();

        if (expiresAt < now) {
          setError("License key has expired");
          setIsLicensed(false);
          setIsLoading(false);
          return;
        }

        const hoursSinceValidation = (now - data.validatedAt) / (1000 * 60 * 60);
        if (hoursSinceValidation < 24) {
          setLicenseData(data);
          setIsLicensed(true);
          if (data.keyType === "admin") {
            setIsAdmin(true);
            setFeatureConfig(OWNER_FEATURE_CONFIG);
          } else {
            await loadCachedFeatureConfig();
          }
          setIsLoading(false);
          validateKey(storedKey).then(async (r) => {
            if (r.valid && r.featureConfig && data.keyType !== "admin") {
              await saveFeatureConfig(r.featureConfig);
            }
          }).catch(() => {});
          return;
        }
      }

      const result = await validateKey(storedKey);
      if (result.valid) {
        if (!result.maxAccounts || !result.expiresAt) {
          setError("Server returned incomplete license data");
          setIsLicensed(false);
          setIsLoading(false);
          return;
        }
        const isOwnerKey = result.keyType === "admin";
        const data: LicenseData = {
          key: storedKey,
          maxAccounts: result.maxAccounts,
          expiresAt: result.expiresAt,
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
        if (isOwnerKey) {
          setFeatureConfig(OWNER_FEATURE_CONFIG);
        } else if (result.featureConfig) {
          await saveFeatureConfig(result.featureConfig);
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
  }, [validateKey, validateAdmin, loadCachedFeatureConfig, saveFeatureConfig]);

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
      setAdminSecret(trimmed);
      setIsAdmin(true);
      setIsLicensed(true);
      setLicenseData(null);
      setFeatureConfig(OWNER_FEATURE_CONFIG);
      return true;
    }

    const upperKey = trimmed.toUpperCase();
    const result = await validateKey(upperKey);

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
    setLicenseData(data);
    setIsLicensed(true);
    setIsAdmin(isOwnerKey);
    setAdminSecret(null);
    if (isOwnerKey) setFeatureConfig(OWNER_FEATURE_CONFIG);
    return true;
  }, [validateKey, validateAdmin, saveFeatureConfig]);

  const removeLicense = useCallback(async () => {
    await AsyncStorage.removeItem(LICENSE_KEY_STORAGE);
    await AsyncStorage.removeItem(LICENSE_DATA_STORAGE);
    await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
    await AsyncStorage.removeItem(ADMIN_VALIDATED_AT_STORAGE);
    await AsyncStorage.removeItem(FEATURE_CONFIG_STORAGE);
    setLicenseData(null);
    setFeatureConfig(DEFAULT_FEATURE_CONFIG);
    setIsLicensed(false);
    setIsAdmin(false);
    setAdminSecret(null);
    setError(null);
  }, []);

  const revalidate = useCallback(async () => {
    setIsLoading(true);
    await loadStoredLicense();
  }, [loadStoredLicense]);

  return (
    <LicenseContext.Provider value={{ isLicensed, isAdmin, isOwnerMode: OWNER_MODE, isLoading, licenseData, featureConfig, adminSecret, error, adminPanelVisible, setAdminPanelVisible, activateKey, removeLicense, revalidate }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
