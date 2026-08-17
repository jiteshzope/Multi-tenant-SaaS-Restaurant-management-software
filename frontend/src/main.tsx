import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { queryClient } from '@/api/queryClient';
import { setSessionLostHandler } from '@/api/client';
import { AuthBootGate } from '@/components/common/AuthBootGate';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { applyTheme, useUiStore } from '@/store/ui.store';
import './index.css';

applyTheme(useUiStore.getState().theme);

/** A hard 401 anywhere: drop the socket and land on the login screen. */
setSessionLostHandler(() => {
  disconnectSocket();
  queryClient.clear();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login?reason=expired');
  }
});

/** Two tabs share localStorage — logging out in one logs out the other. */
window.addEventListener('storage', (event) => {
  if (event.key !== 'resto.auth') return;
  const stored = event.newValue
    ? (JSON.parse(event.newValue) as { state?: { refreshToken?: string } })
    : null;
  if (!stored?.state?.refreshToken) {
    useAuthStore.getState().clear();
    useCartStore.getState().clearAll();
    disconnectSocket();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <AuthBootGate>
          <App />
        </AuthBootGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
