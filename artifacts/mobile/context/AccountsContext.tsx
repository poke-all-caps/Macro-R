import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { fetchRewardsPoints } from "@/utils/bingSearch";

import { API_BASE } from "@/utils/apiUrl";
import { SERVER_HYDRATION_STORAGE } from "@/context/LicenseContext";
const LICENSE_KEY_STORAGE = "@ms_rewards_license_key";
const DEVICE_ID_STORAGE = "@ms_rewards_device_id";

export type AccountStatus = "idle" | "running" | "done" | "failed";

export interface Account {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  status: AccountStatus;
  totalPoints: number;
  todayPoints: number;
  lastRun: string | null;
  searchCount: number;
  dailySetEnabled: boolean;
  enabled: boolean;
  cookies: Record<string, string>;
  searchesCompleted: number;
}

export interface RunLog {
  id: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  searchesDone: number;
  dailySetDone: boolean;
  pointsEarned: number;
  status: "success" | "failed";
  errorMessage?: string;
}

export interface ServerAccount {
  email: string;
  name: string;
  cookies: Record<string, string>;
}

interface AccountsContextType {
  accounts: Account[];
  logs: RunLog[];
  isRunning: boolean;
  addAccount: (
    account: Omit<Account, "id" | "status" | "totalPoints" | "todayPoints" | "searchesCompleted">
  ) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  addLog: (log: Omit<RunLog, "id">) => void;
  clearLogs: () => void;
  startRun: () => void;
  stopRun: () => void;
  refreshPoints: () => Promise<void>;
  hydrateFromServer: (serverAccounts: ServerAccount[]) => Promise<void>;
}

const AccountsContext = createContext<AccountsContextType | null>(null);

const ACCOUNTS_KEY = "@ms_rewards_accounts";
const LOGS_KEY = "@ms_rewards_logs";
const MAX_LOGS = 200;

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const accountsRef = useRef<Account[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Keep accountsRef always current so callbacks can read latest accounts without stale closures
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  const hydrateFromServer = useCallback(async (serverAccounts: ServerAccount[]) => {
    if (!serverAccounts || serverAccounts.length === 0) return;
    setAccounts((prev) => {
      const merged = [...prev];
      for (const sa of serverAccounts) {
        const emailLower = sa.email.toLowerCase();
        const idx = merged.findIndex((a) => a.email.toLowerCase() === emailLower);
        if (idx >= 0) {
          merged[idx] = {
            ...merged[idx],
            name: sa.name || merged[idx].name,
            cookies: sa.cookies && Object.keys(sa.cookies).length > 0 ? sa.cookies : merged[idx].cookies,
          };
        } else {
          merged.push({
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            name: sa.name || sa.email,
            email: emailLower,
            status: "idle",
            totalPoints: 0,
            todayPoints: 0,
            searchesCompleted: 0,
            searchCount: 30,
            dailySetEnabled: true,
            enabled: true,
            lastRun: null,
            cookies: sa.cookies || {},
          });
        }
      }
      AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
  }, []);

  const loadFromStorage = useCallback(async () => {
    try {
      const [accsRaw, logsRaw, serverHydrationRaw] = await Promise.all([
        AsyncStorage.getItem(ACCOUNTS_KEY),
        AsyncStorage.getItem(LOGS_KEY),
        AsyncStorage.getItem(SERVER_HYDRATION_STORAGE),
      ]);
      let base: Account[] = [];
      if (accsRaw) {
        const parsed: Account[] = JSON.parse(accsRaw);
        base = parsed.map((a) => ({
          ...a,
          dailySetEnabled: a.dailySetEnabled ?? true,
          enabled: a.enabled ?? true,
        }));
      }
      if (serverHydrationRaw) {
        const serverAccs: ServerAccount[] = JSON.parse(serverHydrationRaw);
        for (const sa of serverAccs) {
          const emailLower = sa.email.toLowerCase();
          const idx = base.findIndex((a) => a.email.toLowerCase() === emailLower);
          if (idx >= 0) {
            base[idx] = {
              ...base[idx],
              name: sa.name || base[idx].name,
              cookies: sa.cookies && Object.keys(sa.cookies).length > 0 ? sa.cookies : base[idx].cookies,
            };
          } else {
            base.push({
              id: Date.now().toString() + Math.random().toString(36).slice(2),
              name: sa.name || sa.email,
              email: emailLower,
              status: "idle",
              totalPoints: 0,
              todayPoints: 0,
              searchesCompleted: 0,
              searchCount: 30,
              dailySetEnabled: true,
              enabled: true,
              lastRun: null,
              cookies: sa.cookies || {},
            });
          }
        }
        await AsyncStorage.removeItem(SERVER_HYDRATION_STORAGE);
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(base));
      }
      setAccounts(base);
      if (logsRaw) setLogs(JSON.parse(logsRaw));
    } catch (e) {
      console.error("Failed to load data", e);
    }
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        loadFromStorage();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [loadFromStorage]);

  const saveAccounts = useCallback(async (accs: Account[]) => {
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accs));
  }, []);

  const syncCookiesToServer = useCallback(async (accs: Account[]) => {
    try {
      if (Platform.OS === "web" || !API_BASE) return;
      const [key, deviceId] = await Promise.all([
        AsyncStorage.getItem(LICENSE_KEY_STORAGE),
        AsyncStorage.getItem(DEVICE_ID_STORAGE),
      ]);
      if (!key || !deviceId) return;
      const accountsWithCookies = accs
        .filter((a) => a.cookies && Object.keys(a.cookies).length > 0)
        .map((a) => ({ email: a.email, name: a.name, cookies: a.cookies }));
      if (accountsWithCookies.length === 0) return;
      const resp = await fetch(`${API_BASE}/sync-cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, deviceId, accounts: accountsWithCookies }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.warn("[SyncCookies] Server rejected sync:", resp.status, body?.error);
      } else {
        await AsyncStorage.setItem("@ms_rewards_last_cookie_sync", Date.now().toString());
      }
    } catch (e) {
      console.warn("[SyncCookies] Failed to sync cookies to server:", e);
    }
  }, []);

  // Keep a ref so the periodic interval always sees the latest accounts without
  // needing accounts in the effect dependency array (which would restart the
  // interval on every account state change during a run).
  const accountsForSyncRef = useRef(accounts);
  useEffect(() => { accountsForSyncRef.current = accounts; }, [accounts]);

  // One-shot sync check immediately after accounts are first hydrated from
  // AsyncStorage — so a user who hasn't synced in 7 days doesn't have to wait
  // up to 6 hours for the next periodic check to fire.
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (accounts.length === 0 || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    const SYNC_INTERVAL = 7 * 24 * 60 * 60 * 1000;
    AsyncStorage.getItem("@ms_rewards_last_cookie_sync").then((lastSync) => {
      const lastSyncTime = lastSync ? parseInt(lastSync, 10) : 0;
      if (Date.now() - lastSyncTime >= SYNC_INTERVAL) {
        syncCookiesToServer(accounts);
      }
    }).catch(() => {});
  }, [accounts, syncCookiesToServer]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const SYNC_INTERVAL = 7 * 24 * 60 * 60 * 1000;
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

    const periodicSync = async () => {
      const lastSync = await AsyncStorage.getItem("@ms_rewards_last_cookie_sync");
      const lastSyncTime = lastSync ? parseInt(lastSync, 10) : 0;
      if (Date.now() - lastSyncTime >= SYNC_INTERVAL) {
        syncCookiesToServer(accountsForSyncRef.current);
      }
    };

    const interval = setInterval(periodicSync, CHECK_INTERVAL);
    return () => clearInterval(interval);
  // accounts intentionally omitted — accountsForSyncRef tracks the latest
  // value so the interval is set up once, not restarted on every account change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCookiesToServer]);

  const saveLogs = useCallback(async (ls: RunLog[]) => {
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(ls));
  }, []);

  const addAccount = useCallback(
    (
      account: Omit<
        Account,
        "id" | "status" | "totalPoints" | "todayPoints" | "searchesCompleted"
      >
    ) => {
      const newAccount: Account = {
        ...account,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        status: "idle",
        totalPoints: 0,
        todayPoints: 0,
        searchesCompleted: 0,
      };
      setAccounts((prev) => {
        const updated = [...prev, newAccount];
        saveAccounts(updated);
        syncCookiesToServer(updated);
        return updated;
      });
    },
    [saveAccounts, syncCookiesToServer]
  );

  const updateAccount = useCallback(
    (id: string, updates: Partial<Account>) => {
      setAccounts((prev) => {
        const updated = prev.map((a) => (a.id === id ? { ...a, ...updates } : a));
        saveAccounts(updated);
        if (updates.cookies) syncCookiesToServer(updated);
        return updated;
      });
    },
    [saveAccounts, syncCookiesToServer]
  );

  const removeAccount = useCallback(
    (id: string) => {
      setAccounts((prev) => {
        const updated = prev.filter((a) => a.id !== id);
        saveAccounts(updated);
        return updated;
      });
    },
    [saveAccounts]
  );

  const addLog = useCallback(
    (log: Omit<RunLog, "id">) => {
      const newLog: RunLog = {
        ...log,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
      };
      setLogs((prev) => {
        const updated = [newLog, ...prev].slice(0, MAX_LOGS);
        saveLogs(updated);
        return updated;
      });
    },
    [saveLogs]
  );

  const clearLogs = useCallback(async () => {
    setLogs([]);
    await AsyncStorage.removeItem(LOGS_KEY);
  }, []);

  const startRun = useCallback(() => {
    setIsRunning(true);
  }, []);

  const stopRun = useCallback(() => {
    setIsRunning(false);
    setAccounts((prev) => {
      const updated = prev.map((a) =>
        a.status === "running" ? { ...a, status: "idle" as AccountStatus } : a
      );
      saveAccounts(updated);
      return updated;
    });
  }, [saveAccounts]);

  // Fetches live points for every account that has cookies and updates them in storage.
  // Safe to call at any time — accounts without cookies are skipped silently.
  const refreshPoints = useCallback(async () => {
    const withCookies = accountsRef.current.filter(
      (a) => a.cookies && Object.keys(a.cookies).length > 0
    );
    if (withCookies.length === 0) return;

    const results = await Promise.allSettled(
      withCookies.map((a) =>
        fetchRewardsPoints(a.cookies).then((pts) => ({ id: a.id, pts }))
      )
    );

    const updates: Record<string, { totalPoints: number; todayPoints: number }> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.pts.available > 0) {
        updates[r.value.id] = {
          totalPoints: r.value.pts.available,
          todayPoints: r.value.pts.today,
        };
      }
    }
    if (Object.keys(updates).length === 0) return;

    setAccounts((current) => {
      const updated = current.map((a) =>
        updates[a.id] ? { ...a, ...updates[a.id] } : a
      );
      saveAccounts(updated);
      return updated;
    });
  }, [saveAccounts]);

  return (
    <AccountsContext.Provider
      value={{
        accounts,
        logs,
        isRunning,
        addAccount,
        updateAccount,
        removeAccount,
        addLog,
        clearLogs,
        startRun,
        stopRun,
        refreshPoints,
        hydrateFromServer,
      }}
    >
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within AccountsProvider");
  return ctx;
}
