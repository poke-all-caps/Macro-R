import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Crypto from "expo-crypto";

const LICENSE_KEY_STORAGE = "@ms_rewards_license_key";
const LICENSE_DATA_STORAGE = "@ms_rewards_license_data";
const ADMIN_SECRET_STORAGE = "@ms_rewards_admin_secret";
const DEVICE_ID_STORAGE = "@ms_rewards_device_id";
const API_BASE = process.env.EXPO_PUBLIC_API_URL || "";

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

interface LicenseData {
  key: string;
  maxAccounts: number;
  expiresAt: string;
  label: string | null;
  validatedAt: number;
}

interface LicenseContextValue {
  isLicensed: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  licenseData: LicenseData | null;
  adminSecret: string | null;
  error: string | null;
  activateKey: (key: string) => Promise<boolean>;
  removeLicense: () => Promise<void>;
  revalidate: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue>({
  isLicensed: false,
  isAdmin: false,
  isLoading: true,
  licenseData: null,
  adminSecret: null,
  error: null,
  activateKey: async () => false,
  removeLicense: async () => {},
  revalidate: async () => {},
});

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [isLicensed, setIsLicensed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateKey = useCallback(async (key: string): Promise<{ valid: boolean; error?: string; maxAccounts?: number; expiresAt?: string; label?: string; offline?: boolean }> => {
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

  const loadStoredLicense = useCallback(async () => {
    try {
      const storedAdminSecret = await AsyncStorage.getItem(ADMIN_SECRET_STORAGE);
      if (storedAdminSecret) {
        const result = await validateAdmin(storedAdminSecret);
        if (result.valid) {
          setAdminSecret(storedAdminSecret);
          setIsAdmin(true);
          setIsLicensed(true);
          setIsLoading(false);
          return;
        } else if (result.offline) {
          setAdminSecret(storedAdminSecret);
          setIsAdmin(true);
          setIsLicensed(true);
          setIsLoading(false);
          return;
        } else {
          await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
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
          setIsLoading(false);
          return;
        }
      }

      const result = await validateKey(storedKey);
      if (result.valid) {
        const data: LicenseData = {
          key: storedKey,
          maxAccounts: result.maxAccounts!,
          expiresAt: result.expiresAt!,
          label: result.label ?? null,
          validatedAt: Date.now(),
        };
        await AsyncStorage.setItem(LICENSE_DATA_STORAGE, JSON.stringify(data));
        setLicenseData(data);
        setIsLicensed(true);
        setError(null);
      } else if (result.offline && storedData) {
        const data: LicenseData = JSON.parse(storedData);
        if (new Date(data.expiresAt).getTime() > Date.now()) {
          setLicenseData(data);
          setIsLicensed(true);
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
        }
      }
    }
    setIsLoading(false);
  }, [validateKey, validateAdmin]);

  useEffect(() => {
    loadStoredLicense();
  }, [loadStoredLicense]);

  const activateKey = useCallback(async (key: string): Promise<boolean> => {
    setError(null);
    const trimmed = key.trim();

    const adminResult = await validateAdmin(trimmed);
    if (adminResult.valid) {
      await AsyncStorage.setItem(ADMIN_SECRET_STORAGE, trimmed);
      await AsyncStorage.removeItem(LICENSE_KEY_STORAGE);
      await AsyncStorage.removeItem(LICENSE_DATA_STORAGE);
      setAdminSecret(trimmed);
      setIsAdmin(true);
      setIsLicensed(true);
      setLicenseData(null);
      return true;
    }

    const upperKey = trimmed.toUpperCase();
    const result = await validateKey(upperKey);

    if (!result.valid) {
      setError(result.error || "Invalid key");
      return false;
    }

    const data: LicenseData = {
      key: upperKey,
      maxAccounts: result.maxAccounts!,
      expiresAt: result.expiresAt!,
      label: result.label ?? null,
      validatedAt: Date.now(),
    };

    await AsyncStorage.setItem(LICENSE_KEY_STORAGE, upperKey);
    await AsyncStorage.setItem(LICENSE_DATA_STORAGE, JSON.stringify(data));
    await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
    setLicenseData(data);
    setIsLicensed(true);
    setIsAdmin(false);
    setAdminSecret(null);
    return true;
  }, [validateKey, validateAdmin]);

  const removeLicense = useCallback(async () => {
    await AsyncStorage.removeItem(LICENSE_KEY_STORAGE);
    await AsyncStorage.removeItem(LICENSE_DATA_STORAGE);
    await AsyncStorage.removeItem(ADMIN_SECRET_STORAGE);
    setLicenseData(null);
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
    <LicenseContext.Provider value={{ isLicensed, isAdmin, isLoading, licenseData, adminSecret, error, activateKey, removeLicense, revalidate }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
