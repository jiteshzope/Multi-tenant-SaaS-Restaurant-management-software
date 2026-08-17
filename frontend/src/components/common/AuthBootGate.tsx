import { useEffect, useState, type ReactNode } from 'react';
import { refreshSession } from '@/api/client';
import { authApi } from '@/api/resources';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth.store';

/**
 * Boot sequence, before the router renders:
 *
 *   1. read the persisted refresh token
 *   2. none      → render (lands on /login)
 *   3. present   → refresh the pair
 *      ├─ ok     → GET /auth/me, render
 *      └─ fail   → clear the store, render (lands on /login)
 *
 * The full-page skeleton is what stops the login screen flashing and vanishing.
 *
 * The refresh goes through `refreshSession()` — the client's single-flight latch
 * — rather than a bare axios call. StrictMode invokes this effect twice in
 * development, and two rotations of the same token would make the second one
 * look like a stolen-token replay and revoke the whole family.
 */
export function AuthBootGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { refreshToken, setMe, clear } = useAuthStore.getState();
      if (!refreshToken) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        await refreshSession();
        setMe(await authApi.me());
      } catch {
        clear();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <BootSkeleton />;
  return <>{children}</>;
}

function BootSkeleton() {
  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
