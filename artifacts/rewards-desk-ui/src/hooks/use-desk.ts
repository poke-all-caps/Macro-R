import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useListAccounts,
  getListAccountsQueryKey,
  useAddAccount,
  useDeleteAccount,
  useRunNow,
  useGetBotStatus,
  getGetBotStatusQueryKey,
  useGetRunLogs,
  getGetRunLogsQueryKey
} from '@workspace/api-client-react';

export function useAccounts() {
  const queryClient = useQueryClient();
  const query = useListAccounts();

  const addAccount = useAddAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      }
    }
  });

  const deleteAccount = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      }
    }
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; email?: string; resync?: boolean } }) => {
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
