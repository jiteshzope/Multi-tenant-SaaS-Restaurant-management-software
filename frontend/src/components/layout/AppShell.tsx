import {
  BarChart3,
  ChefHat,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Settings,
  Sun,
  UtensilsCrossed,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConnectionIndicator } from '@/components/common/ConnectionIndicator';
import { RoleBadge } from '@/components/common/StatusBadge';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/store/ui.store';
import type { UserRole } from '@/types/enums';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };

const NAV: Record<UserRole, NavItem[]> = {
  OWNER: [
    { to: '/owner', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/owner/tables', label: 'Tables', icon: LayoutDashboard },
    { to: '/owner/menu', label: 'Menu', icon: UtensilsCrossed },
    { to: '/owner/staff', label: 'Staff', icon: Users },
    { to: '/owner/kitchen', label: 'Kitchen', icon: ChefHat },
    { to: '/owner/reports', label: 'Reports', icon: BarChart3 },
    { to: '/owner/settings', label: 'Settings', icon: Settings },
  ],
  WAITER: [{ to: '/waiter', label: 'My tables', icon: LayoutDashboard, end: true }],
  KITCHEN: [{ to: '/kitchen', label: 'Kitchen board', icon: ChefHat, end: true }],
};

export function AppShell() {
  const { role, restaurant, user, logout, home } = useAuth();
  const connection = useSocket();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const items = role ? NAV[role] : [];

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — owner works at a desk; waiter and kitchen do not. */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <Brand to={home} collapsed={collapsed} name={restaurant?.name} slug={restaurant?.slug} />

        <nav className="flex-1 space-y-1 px-3 py-3">
          {items.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
            {!collapsed && <span className="text-xs">Collapse</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 animate-in flex-col border-r bg-sidebar duration-200 slide-in-from-left">
            <div className="flex items-center justify-between pr-2">
              <Brand to={home} collapsed={false} name={restaurant?.name} slug={restaurant?.slug} />
              <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-3" onClick={() => setMobileOpen(false)}>
              {items.map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={false} />
              ))}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          The topbar packs a menu button, two lines of text, three controls and
          an avatar. At 360px that used to squeeze the restaurant name down to
          "Spice Ga…". The sound and theme toggles are secondary — they move
          into the account menu below `sm`, which buys the name its width back.
        */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon className="size-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{restaurant?.name ?? 'Restaurant'}</p>
            <p className="truncate text-xs text-muted-foreground">{crumb(location.pathname)}</p>
          </div>

          <ConnectionIndicator state={connection} />
          <span className="hidden items-center sm:flex">
            <SoundToggle />
            <ThemeToggle />
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-accent sm:px-2"
                aria-label="Account menu"
              >
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary/25 to-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/25">
                  {(user?.name ?? '?').charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-left lg:block">
                  <span className="block text-sm leading-tight">{user?.name}</span>
                  <span className="block text-xs leading-tight text-muted-foreground">
                    {role?.toLowerCase()}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-56">
              <DropdownMenuLabel className="flex items-center justify-between gap-3">
                <span className="truncate">{user?.email}</span>
                {role && <RoleBadge role={role} />}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* The two toggles that leave the bar on small screens live here. */}
              <div className="flex items-center justify-between gap-2 px-2 py-1 sm:hidden">
                <span className="text-xs text-muted-foreground">Sound · theme</span>
                <span className="flex items-center">
                  <SoundToggle />
                  <ThemeToggle />
                </span>
              </div>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function Brand({
  to,
  collapsed,
  name,
  slug,
}: {
  to: string;
  collapsed: boolean;
  name?: string;
  slug?: string;
}) {
  return (
    <NavLink to={to} className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-rose-500 text-lg shadow-lg shadow-primary/35">
        🍲
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight font-semibold">
            {name ?? 'Spice'}
          </span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">
            {slug ?? 'operations'}
          </span>
        </span>
      )}
    </NavLink>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-gradient-to-r from-primary/22 to-transparent text-primary ring-1 ring-primary/25'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span
              aria-hidden
              className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary"
            />
          )}
          <Icon className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {theme === 'dark' ? 'light' : 'dark'} mode</TooltipContent>
    </Tooltip>
  );
}

function SoundToggle() {
  const on = useUiStore((s) => s.soundEnabled);
  const set = useUiStore((s) => s.setSoundEnabled);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => set(!on)}
          aria-label={on ? 'Mute new-order sound' : 'Unmute new-order sound'}
        >
          {on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{on ? 'New-order sound on' : 'New-order sound off'}</TooltipContent>
    </Tooltip>
  );
}

function crumb(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'Home';
  return parts
    .map((p) => (p.length > 20 ? '…' : p.replace(/-/g, ' ')))
    .join(' › ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        {back}
        {/* Wraps rather than truncates — a page title is not disposable text. */}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
      )}
    </div>
  );
}
