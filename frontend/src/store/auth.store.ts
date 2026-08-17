import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Me } from '@/types/domain';
import type { UserRole } from '@/types/enums';

interface AuthState {
  /** 15 min — memory only, deliberately excluded from persistence. */
  accessToken: string | null;
  /** 7 days — persisted, because the boot sequence needs it. */
  refreshToken: string | null;
  me: Me | null;

  setTokens: (accessToken: string, refreshToken: string) => void;
  setMe: (me: Me) => void;
  setSession: (accessToken: string, refreshToken: string, me: Me) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      me: null,

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setMe: (me) => set({ me }),
      setSession: (accessToken, refreshToken, me) => set({ accessToken, refreshToken, me }),
      clear: () => set({ accessToken: null, refreshToken: null, me: null }),
    }),
    {
      name: 'resto.auth',
      storage: createJSONStorage(() => localStorage),
      // The access token never reaches localStorage.
      partialize: (s) => ({ refreshToken: s.refreshToken, me: s.me }),
    },
  ),
);

/* Non-reactive accessors — axios interceptors run outside React. */
export const getAccessToken = () => useAuthStore.getState().accessToken;
export const getRefreshToken = () => useAuthStore.getState().refreshToken;
export const getRole = (): UserRole | null => useAuthStore.getState().me?.role ?? null;
