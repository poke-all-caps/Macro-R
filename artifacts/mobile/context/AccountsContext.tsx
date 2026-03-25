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

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : "");
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
}

const AccountsContext = createContext<AccountsContextType | null>(null);

const ACCOUNTS_KEY = "@ms_rewards_accounts";
const LOGS_KEY = "@ms_rewards_logs";
const MAX_LOGS = 200;

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const loadFromStorage = useCallback(async () => {
    try {
      const [accsRaw, logsRaw] = await Promise.all([
        AsyncStorage.getItem(ACCOUNTS_KEY),
        AsyncStorage.getItem(LOGS_KEY),
      ]);
      if (accsRaw) {
        const parsed: Account[] = JSON.parse(accsRaw);
        setAccounts(
          parsed.map((a) => ({
            ...a,
            dailySetEnabled: a.dailySetEnabled ?? true,
          }))
        );
      }
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
      }
    } catch (e) {
      console.warn("[SyncCookies] Failed to sync cookies to server:", e);
    }
  }, []);

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
