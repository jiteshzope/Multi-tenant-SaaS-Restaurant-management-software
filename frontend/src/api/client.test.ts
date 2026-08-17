import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, client, setSessionLostHandler, toApiError } from './client';
import { useAuthStore } from '@/store/auth.store';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: { ...actual.default, post: vi.fn() },
  };
});

const mockedPost = vi.mocked(axios.post);

/**
 * The refresh must be single-flight: N parallel 401s trigger exactly ONE
 * /auth/refresh. Without that, five queries would fire five rotations and four
 * of them would look like token reuse to the backend.
 */
describe('api client — single-flight refresh', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    useAuthStore.getState().setTokens('expired-access', 'valid-refresh');
    mockedPost.mockReset();
    setSessionLostHandler(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends exactly one /auth/refresh for two parallel 401s', async () => {
    mockedPost.mockResolvedValue({
      data: { data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' } },
    });

    let call = 0;
    const adapter = vi.fn(async (config: { headers?: Record<string, unknown> }) => {
      call += 1;
      // The first two calls are the original requests; the retries carry the new token.
      if (String(config.headers?.Authorization).includes('fresh-access')) {
        return { status: 200, data: { data: { ok: call }, requestId: 'r' }, headers: {}, config };
      }
      throw Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: {
          status: 401,
          data: { error: { code: 'TOKEN_EXPIRED', message: 'expired' }, requestId: 'r' },
        },
      });
    });

    client.defaults.adapter = adapter as never;

    const [a, b] = await Promise.all([
      api.get<{ ok: number }>('/one'),
      api.get<{ ok: number }>('/two'),
    ]);

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toContain('/auth/refresh');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(useAuthStore.getState().accessToken).toBe('fresh-access');
  });

  it('clears the store and notifies when the refresh itself fails', async () => {
    const onLost = vi.fn();
    setSessionLostHandler(onLost);

    mockedPost.mockRejectedValue(
      Object.assign(new Error('nope'), {
        isAxiosError: true,
        response: { status: 401, data: { error: { code: 'TOKEN_REUSED', message: 'reused' } } },
      }),
    );

    client.defaults.adapter = (async (config: unknown) => {
      throw Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: {
          status: 401,
          data: { error: { code: 'TOKEN_EXPIRED', message: 'expired' }, requestId: 'r' },
        },
      });
    }) as never;

    await expect(api.get('/protected')).rejects.toThrow();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(onLost).toHaveBeenCalled();
  });
});

describe('toApiError', () => {
  it('lifts the backend error body into a typed ApiError', () => {
    const err = toApiError({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: { code: 'ORDER_ALREADY_MOVED', message: 'Someone already moved this order' },
          requestId: 'r',
        },
      },
    });

    expect(err.code).toBe('ORDER_ALREADY_MOVED');
    expect(err.status).toBe(409);
    expect(err.message).toBe('Someone already moved this order');
  });

  it('carries `details` through so the UI can mark the offending lines', () => {
    const err = toApiError({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: 'ITEM_UNAVAILABLE',
            message: 'unavailable',
            details: { menuItemIds: ['abc'] },
          },
        },
      },
    });

    expect(err.details).toEqual({ menuItemIds: ['abc'] });
  });

  it('turns a network failure into a NETWORK code, not a crash', () => {
    const err = toApiError({ isAxiosError: true, message: 'Network Error' });
    expect(err.code).toBe('NETWORK');
    expect(err.status).toBe(0);
  });
});
