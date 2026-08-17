import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/store/auth.store';
import type { UserRole } from '@/types/enums';

/**
 * UI gating is convenience only — the server enforces access. A hidden button
 * is never a permission.
 */

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => Boolean(s.accessToken && s.me));
  const location = useLocation();

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export function RoleGate({ allow, children }: { allow: UserRole[]; children?: ReactNode }) {
  const role = useAuthStore((s) => s.me?.role);

  if (!role) return <Navigate to="/login" replace />;
  if (!allow.includes(role)) return <Navigate to="/403" replace />;

  return <>{children ?? <Outlet />}</>;
}
