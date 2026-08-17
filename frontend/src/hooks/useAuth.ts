import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { authApi } from '@/api/resources';
import { ROLE_HOME } from '@/lib/constants';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { disconnectSocket } from '@/lib/socket';
import type { LoginInput, RegisterRestaurantInput } from '@/schemas';

export function useAuth() {
  const { accessToken, refreshToken, me, setSession, clear } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const login = useCallback(
    async (input: LoginInput) => {
      const res = await authApi.login(input);
      setSession(res.accessToken, res.refreshToken, res.user);
      return res.user;
    },
    [setSession],
  );

  const register = useCallback(
    async (input: RegisterRestaurantInput) => {
      const res = await authApi.register({
        restaurantName: input.restaurantName,
        slug: input.slug,
        phone: input.phone || undefined,
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        ownerPassword: input.ownerPassword,
      });
      setSession(res.accessToken, res.refreshToken, res.user);
      return res.user;
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    const token = useAuthStore.getState().refreshToken;
    try {
      await authApi.logout(token ?? undefined);
    } catch {
      // The local session is cleared either way — a failed logout call must
      // never strand the user in a half-authenticated state.
    }
    disconnectSocket();
    queryClient.clear();
    useCartStore.getState().clearAll();
    clear();
    navigate('/login', { replace: true });
  }, [clear, navigate, queryClient]);

  return {
    user: me?.user ?? null,
    restaurant: me?.restaurant ?? null,
    role: me?.role ?? null,
    isAuthenticated: Boolean(accessToken && me),
    hasRefreshToken: Boolean(refreshToken),
    home: me ? ROLE_HOME[me.role] : '/login',
    login,
    register,
    logout,
  };
}

/** The restaurant's timezone drives every date the user sees. */
export function useTimezone(): string {
  return useAuthStore((s) => s.me?.restaurant.timezone) ?? 'Asia/Kolkata';
}

export function useCurrency(): string {
  return useAuthStore((s) => s.me?.restaurant.currency) ?? 'INR';
}
