import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { ApiError } from '@/types/api';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-10 text-center sm:px-6 sm:py-14',
        className,
      )}
    >
      <div className="rounded-full bg-muted/60 p-3 text-muted-foreground">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div className="space-y-1">
        <p className="font-medium text-balance">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function LoadingGrid({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

export function LoadingRows({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

/** Never a blank screen — a 5xx or a dropped connection gets a retry card. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = ApiError.isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong';

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-10 text-center sm:px-6 sm:py-12',
        className,
      )}
    >
      <div className="rounded-full bg-destructive/15 p-3 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">Could not load this</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      )}
    </div>
  );
}
