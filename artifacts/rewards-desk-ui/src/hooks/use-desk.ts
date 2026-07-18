import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useListAccounts,
  getListAccountsQueryKey,
  useDeleteAccount,
  useRunNow,
  useGetBotStatus,
  getGetBotStatusQueryKey,
  useGetRunLogs,
  getGetRunLogsQueryKey
} from '@workspace/api-client-react';

export interface AccountProxy {
  url?: string;
  port?: number | string;
  username?: string;
  password?: string;
}

export interface AccountInput {
  email: string;
  name: string;
  password: string;
  totpSecret?: string;
  recoveryEmail?: string;
  geoLocale?: string;
  langCode?: string;
  proxy?: AccountProxy;
  saveFingerprint?: { mobile?: boolean; desktop?: boolean };
}

export interface AccountPatch {
  name?: string;
  email?: string;
  password?: string;
  totpSecret?: string;
  recoveryEmail?: string;
  geoLocale?: string;
  langCode?: string;
  proxy?: AccountProxy;
  saveFingerprint?: { mobile?: boolean; desktop?: boolean };
  resync?: boolean;
}

export function useAccounts() {
  const queryClient = useQueryClient();
  const query = useListAccounts();

  const addAccount = useMutation({
    mutationFn: async (data: AccountInput) => {
      const res = await fetch('/api/desk/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    },
  });

  const deleteAccount = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      }
    }
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AccountPatch }) => {
      const res = await fetch(`/api/desk/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    },
  });

  return {
    accounts: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    addAccount,
    deleteAccount,
    updateAccount,
  };
}

export function useBotStatus() {
  const queryClient = useQueryClient();
  const query = useGetBotStatus({
    query: {
      queryKey: getGetBotStatusQueryKey(),
      refetchInterval: 2000,
    }
  });

  const runNow = useRunNow({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      }
    }
  });

  const stopAll = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/desk/stop', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ stopped: boolean; message: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRunLogsQueryKey() });
    },
  });

  return {
    status: query.data,
    isLoading: query.isLoading,
    runNow,
    stopAll,
  };
}

export interface CaptureStatus {
  sessionId: string;
  email: string;
  status: 'opening' | 'waiting' | 'capturing' | 'done' | 'failed';
  cookieCount?: number;
  error?: string;
}

export function useCookieCapture() {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch('/api/desk/capture-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { sessionId: string };
      setSessionId(data.sessionId);
      return data;
    },
  });

  const poll = useQuery({
    queryKey: ['capture-session', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/desk/capture-session/${sessionId}`);
      if (!res.ok) throw new Error('Session not found');
      return res.json() as Promise<CaptureStatus>;
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'done' || s === 'failed' ? false : 1500;
    },
  });

  const abort = useMutation({
    mutationFn: async () => {
      if (!sessionId) return;
      await fetch(`/api/desk/capture-session/${sessionId}`, { method: 'DELETE' });
      setSessionId(null);
      queryClient.removeQueries({ queryKey: ['capture-session', sessionId] });
    },
  });

  const reset = () => {
    if (sessionId) {
      queryClient.removeQueries({ queryKey: ['capture-session', sessionId] });
    }
    setSessionId(null);
  };

  return {
    start,
    abort,
    reset,
    sessionId,
    captureStatus: poll.data ?? null,
    isPolling: !!sessionId && poll.data?.status !== 'done' && poll.data?.status !== 'failed',
  };
}

export function useRunLogs() {
  const query = useGetRunLogs({
    query: {
      queryKey: getGetRunLogsQueryKey(),
      refetchInterval: 3000,
    }
  });

  // Also fetch raw agent logs for live streaming
  const agentLogs = useQuery({
    queryKey: ['agent-logs'],
    queryFn: async () => {
      const res = await fetch('/api/desk/agent-logs');
      if (!res.ok) return [];
      return res.json() as Promise<Array<{
        time: string;
        userName: string;
        level: string;
        platform: string;
        title: string;
        message: string;
      }>>;
    },
    refetchInterval: 2000,
  });

  return {
    logs: query.data || [],
    agentLogs: agentLogs.data || [],
    isLoading: query.isLoading,
  };
}
