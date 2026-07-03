import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_BASE } from "@/utils/apiUrl";

export type KycStatus = "none" | "pending" | "verified" | "rejected";

interface KycContextValue {
  inviteCode: string | null;
  kycStatus: KycStatus;
  adminNote: string | null;
  isLoaded: boolean;
  setKycData: (code: string, status: Exclude<KycStatus, "none">, note?: string | null) => Promise<void>;
  clearKyc: () => Promise<void>;
  refreshStatus: () => Promise<{ status: KycStatus; adminNote: string | null }>;
}

const KycContext = createContext<KycContextValue | null>(null);

const STORAGE_CODE = "@kyc_invite_code";
const STORAGE_STATUS = "@kyc_status";
const STORAGE_NOTE = "@kyc_admin_note";

export function KycProvider({ children }: { children: React.ReactNode }) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus>("none");
  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [[, code], [, status], [, note]] = await AsyncStorage.multiGet([
          STORAGE_CODE,
          STORAGE_STATUS,
          STORAGE_NOTE,
        ]);
        setInviteCode(code ?? null);
        setKycStatus((status as KycStatus | null) ?? "none");
        setAdminNote(note ?? null);

        // Re-validate from server if we have a stored pending/verified code
        if (code && status && status !== "none") {
          try {
            const res = await fetch(`${API_BASE}/invite/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.valid && data.kycStatus) {
                const fresh = data.kycStatus as KycStatus;
                const freshNote: string | null = data.adminNote ?? null;
                if (fresh !== status || freshNote !== note) {
                  setKycStatus(fresh);
                  setAdminNote(freshNote);
                  await AsyncStorage.multiSet([
                    [STORAGE_STATUS, fresh],
                    [STORAGE_NOTE, freshNote ?? ""],
                  ]);
                }
              }
            }
          } catch {
            // offline — use cached values
          }
        }
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const setKycData = useCallback(
    async (code: string, status: Exclude<KycStatus, "none">, note?: string | null) => {
      await AsyncStorage.multiSet([
        [STORAGE_CODE, code],
        [STORAGE_STATUS, status],
        [STORAGE_NOTE, note ?? ""],
      ]);
      setInviteCode(code);
      setKycStatus(status);
      setAdminNote(note ?? null);
    },
    [],
  );

  const clearKyc = useCallback(async () => {
    await AsyncStorage.multiRemove([STORAGE_CODE, STORAGE_STATUS, STORAGE_NOTE]);
    setInviteCode(null);
    setKycStatus("none");
    setAdminNote(null);
  }, []);

  const refreshStatus = useCallback(async (): Promise<{ status: KycStatus; adminNote: string | null }> => {
    if (!inviteCode) return { status: "none", adminNote: null };
    try {
      const res = await fetch(`${API_BASE}/invite/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      if (!res.ok) return { status: kycStatus, adminNote };
      const data = await res.json();
      if (!data.valid) return { status: kycStatus, adminNote };

      const fresh: KycStatus = (data.kycStatus as KycStatus | null) ?? kycStatus;
      const freshNote: string | null = data.adminNote ?? null;

      if (fresh !== kycStatus || freshNote !== adminNote) {
        setKycStatus(fresh);
        setAdminNote(freshNote);
        await AsyncStorage.multiSet([
          [STORAGE_STATUS, fresh],
          [STORAGE_NOTE, freshNote ?? ""],
        ]);
      }
      return { status: fresh, adminNote: freshNote };
    } catch {
      return { status: kycStatus, adminNote };
    }
  }, [inviteCode, kycStatus, adminNote]);

  return (
    <KycContext.Provider value={{ inviteCode, kycStatus, adminNote, isLoaded, setKycData, clearKyc, refreshStatus }}>
      {children}
    </KycContext.Provider>
  );
}

export function useKyc(): KycContextValue {
  const ctx = useContext(KycContext);
  if (!ctx) throw new Error("useKyc must be used inside KycProvider");
  return ctx;
}
