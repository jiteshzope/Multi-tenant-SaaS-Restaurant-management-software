import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '@/lib/env';
import { ApiError, type ApiErrorBody, type ApiResponse, type ErrorCode } from '@/types/api';
import { getAccessToken, getRefreshToken, useAuthStore } from '@/store/auth.store';

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export const client = axios.create({
  baseURL: env.apiUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

/* --- request: attach the access token ------------------------------------ */

client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* --- refresh: single-flight ---------------------------------------------- */

let refreshInFlight: Promise<string> | null = null;

/** Called when the session is unrecoverable. Wired up in main.tsx. */
let onSessionLost: () => void = () => {};
export function setSessionLostHandler(fn: () => void): void {
  onSessionLost = fn;
}

/**
 * The first 401 starts the refresh; every other in-flight 401 awaits the *same*
 * promise. Without this, five parallel queries would fire five rotations and
 * four of them would look like token reuse.
 *
 * Exported because the boot gate needs it too: a bare axios call there would sit
 * outside this latch, and React StrictMode's double-invoked effect would rotate
 * the same token twice — the loser coming back 401 TOKEN_REUSED and killing the
 * whole family. Everything that refreshes goes through here.
 *
 * (The latch is per-tab. Two tabs booting at the same instant still race; the
 * `storage` listener in main.tsx is what keeps them consistent afterwards.)
 */
export async function refreshSession(): Promise<string> {
  return refreshAccessToken();
}

async function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new ApiError('TOKEN_EXPIRED', 'No refresh token', 401);

    try {
      // A bare axios call: never the instrumented instance, or a failing
      // refresh would recurse into itself.
      const res = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
        `${env.apiUrl}/auth/refresh`,
        { refreshToken },
        { timeout: 15_000, headers: { 'Content-Type': 'application/json' } },
      );
      const pair = res.data.data;
      useAuthStore.getState().setTokens(pair.accessToken, pair.refreshToken);
      return pair.accessToken;
    } catch (e) {
      useAuthStore.getState().clear();
      onSessionLost();
      throw toApiError(e);
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/* --- response: unwrap the envelope, normalize every failure --------------- */

client.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    // Nothing downstream knows the { data, requestId } envelope exists.
    return response.data?.data as never;
  },
  async (error: unknown) => {
    const err = error as AxiosError<ApiErrorBody>;
    const config = err.config as RetriableConfig | undefined;
    const status = err.response?.status;

    const isRefreshCall = config?.url?.includes('/auth/refresh');
    const code = err.response?.data?.error?.code;

    // TOKEN_REUSED means the family is dead — refreshing again is pointless.
    if (status === 401 && config && !config._retried && !isRefreshCall && code !== 'TOKEN_REUSED') {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return client.request(config);
      } catch {
        throw toApiError(err);
      }
    }

    if (status === 401 || code === 'TOKEN_REUSED') {
      useAuthStore.getState().clear();
      onSessionLost();
    }

    throw toApiError(err);
  },
);

export function toApiError(e: unknown): ApiError {
  if (ApiError.isApiError(e)) return e;

  const err = e as AxiosError<ApiErrorBody>;
  const body = err.response?.data;

  if (body?.error) {
    return new ApiError(
      body.error.code,
      body.error.message,
      err.response?.status ?? 0,
      body.error.details,
    );
  }

  if (err.response) {
    return new ApiError(
      statusToCode(err.response.status),
      err.response.statusText || 'Request failed',
      err.response.status,
    );
  }

  return new ApiError('NETWORK', 'Cannot reach the server. Check your connection.', 0);
}

function statusToCode(status: number): ErrorCode {
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'DUPLICATE';
  if (status === 403) return 'FORBIDDEN_ROLE';
  if (status === 401) return 'TOKEN_EXPIRED';
  if (status === 400) return 'VALIDATION_FAILED';
  return 'INTERNAL';
}

/* --- typed verbs: `client.get<T>` returns T, not AxiosResponse<T> --------- */

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => client.get<never, T>(url, config),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    client.post<never, T>(url, body, config),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    client.patch<never, T>(url, body, config),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    client.put<never, T>(url, body, config),
  delete: <T>(url: string, config?: AxiosRequestConfig) => client.delete<never, T>(url, config),
};
