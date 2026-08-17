import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute, RoleGate } from '@/components/common/guards';
import { RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import { LoadingRows } from '@/components/common/States';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { OwnerDashboardPage } from '@/features/owner/DashboardPage';
import { OwnerTablesPage } from '@/features/owner/TablesPage';
import { OwnerMenuPage } from '@/features/owner/MenuPage';
import { OwnerStaffPage } from '@/features/owner/StaffPage';
import { OwnerSettingsPage } from '@/features/owner/SettingsPage';
import { MyTablesPage } from '@/features/waiter/MyTablesPage';
import { KitchenBoardPage } from '@/features/kitchen/KitchenBoardPage';
import { TakeOrderScreen } from '@/features/shared/TakeOrderScreen';
import { TableDetail } from '@/features/shared/TableDetail';
import { ForbiddenPage, NotFoundPage } from '@/features/misc/StatusPages';
import { useAuthStore } from '@/store/auth.store';
import { ROLE_HOME } from '@/lib/constants';

// Recharts is the heaviest chunk — only the reports route pays for it.
const OwnerReportsPage = lazy(() =>
  import('@/features/owner/ReportsPage').then((m) => ({ default: m.OwnerReportsPage })),
);

/** `/` sends each role to its own home. */
function RoleHomeRedirect() {
  const me = useAuthStore((s) => s.me);
  return <Navigate to={me ? ROLE_HOME[me.role] : '/login'} replace />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorBoundary /> },
  { path: '/register', element: <RegisterPage />, errorElement: <RouteErrorBoundary /> },
  { path: '/403', element: <ForbiddenPage /> },

  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <RoleHomeRedirect /> },

          {
            path: 'owner',
            element: <RoleGate allow={['OWNER']} />,
            children: [
              { index: true, element: <OwnerDashboardPage /> },
              { path: 'tables', element: <OwnerTablesPage /> },
              { path: 'tables/:tableId', element: <TableDetail /> },
              { path: 'tables/:tableId/order', element: <TakeOrderScreen /> },
              { path: 'menu', element: <OwnerMenuPage /> },
              { path: 'staff', element: <OwnerStaffPage /> },
              { path: 'kitchen', element: <KitchenBoardPage /> },
              {
                path: 'reports',
                element: (
                  <Suspense fallback={<LoadingRows count={6} />}>
                    <OwnerReportsPage />
                  </Suspense>
                ),
              },
              { path: 'settings', element: <OwnerSettingsPage /> },
            ],
          },

          {
            path: 'waiter',
            element: <RoleGate allow={['WAITER']} />,
            children: [
              { index: true, element: <MyTablesPage /> },
              { path: 'tables/:tableId', element: <TableDetail /> },
              { path: 'tables/:tableId/order', element: <TakeOrderScreen /> },
            ],
          },

          {
            path: 'kitchen',
            element: <RoleGate allow={['KITCHEN']} />,
            children: [{ index: true, element: <KitchenBoardPage /> }],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
