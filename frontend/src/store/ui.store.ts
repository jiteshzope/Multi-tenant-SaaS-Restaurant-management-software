import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  soundEnabled: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSoundEnabled: (on: boolean) => void;
}

/** Kitchens are often dim — the app ships dark and remembers the choice. */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      soundEnabled: true,

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
    }),
    {
      name: 'resto.ui',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? 'dark'),
    },
  ),
);

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}
