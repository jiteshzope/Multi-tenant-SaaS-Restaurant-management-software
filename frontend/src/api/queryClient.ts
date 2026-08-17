import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/types/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Never retry a 4xx — a 403 will still be a 403 on the second attempt.
      retry: (failureCount, error) => {
        if (ApiError.isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});
