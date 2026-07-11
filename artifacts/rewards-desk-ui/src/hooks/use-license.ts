import { useState, useEffect } from 'react';

export interface LicenseData {
  key: string;
  keyType: 'trial' | 'basic' | 'premium' | 'unlimited' | 'admin';
  maxAccounts: number;
  expiresAt: string;
  label?: string | null;
  canInvite?: boolean;
  validatedAt?: string;
}

const STORAGE_KEY = '@ms_rewards_license_data';

export function useLicense() {
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setLicenseData(JSON.parse(raw));
      }
    } catch {
      // localStorage unavailable or bad JSON — leave null
    }
  }, []);

  return { licenseData };
}

export const TIER_META: Record<string, { label: string; color: string; bg: string }> = {
  trial:     { label: 'Trial',     color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  basic:     { label: 'Basic',     color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  premium:   { label: 'Premium',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  unlimited: { label: 'Unlimited', color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  admin:     { label: 'Admin',     color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
};
