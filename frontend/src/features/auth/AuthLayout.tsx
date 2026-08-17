import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function AuthLayout({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      {/* Ambient wash — the login screen is the first impression. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-10 -left-24 size-72 rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute -right-20 bottom-0 size-80 rounded-full bg-status-preparing/20 blur-[110px]" />
      </div>

      <div className={wide ? 'relative w-full max-w-xl' : 'relative w-full max-w-md'}>
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-orange-500 text-xl shadow-lg shadow-primary/30">
            🍲
          </span>
          <div>
            <p className="text-lg leading-tight font-semibold">Spice</p>
            <p className="text-xs leading-tight text-muted-foreground">Restaurant operations</p>
          </div>
        </div>

        <Card className="p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div className="mb-6 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
}
