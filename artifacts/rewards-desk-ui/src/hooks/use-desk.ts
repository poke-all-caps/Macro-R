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

  return {
    accounts: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    addAccount,
    deleteAccount,
  };
}

export function useBotStatus() {
  const query = useGetBotStatus({
    query: {
      queryKey: getGetBotStatusQueryKey(),
      refetchInterval: 2000,
    }
  });

  const runNow = useRunNow();

  return {
    status: query.data,
    isLoading: query.isLoading,
    runNow,
  };
}

export function useRunLogs() {
  const query = useGetRunLogs({
    query: {
      queryKey: getGetRunLogsQueryKey(),
      refetchInterval: 3000,
    }
  });

  return {
    logs: query.data || [],
    isLoading: query.isLoading,
  };
}
