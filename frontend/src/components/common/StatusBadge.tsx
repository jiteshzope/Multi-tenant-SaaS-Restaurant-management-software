import { Ban, ChefHat, CircleCheck, CircleDot, Clock, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { OrderStatus, TableStatus } from '@/types/enums';

/**
 * The single component that maps an enum value to a design token. No screen
 * writes its own switch over OrderStatus.
 *
 * Status is never conveyed by colour alone — always colour *plus* text.
 */

const ORDER_STYLES: Record<OrderStatus, { label: string; className: string; Icon: typeof Clock }> =
  {
    PENDING: {
      label: 'Pending',
      className: 'bg-status-pending/20 text-status-pending border-status-pending/45',
      Icon: Clock,
    },
    PREPARING: {
      label: 'Preparing',
      className: 'bg-status-preparing/20 text-status-preparing border-status-preparing/45',
      Icon: ChefHat,
    },
    COMPLETED: {
      label: 'Completed',
      className: 'bg-status-completed/20 text-status-completed border-status-completed/45',
      Icon: CircleCheck,
    },
    CANCELLED: {
      label: 'Cancelled',
      className: 'bg-muted text-muted-foreground border-border line-through',
      Icon: Ban,
    },
  };

const TABLE_STYLES: Record<TableStatus, { label: string; className: string; Icon: typeof Clock }> =
  {
    VACANT: {
      label: 'Vacant',
      className: 'bg-status-vacant/20 text-status-vacant border-status-vacant/40',
      Icon: CircleDot,
    },
    OCCUPIED: {
      label: 'Occupied',
      className: 'bg-status-occupied/20 text-status-occupied border-status-occupied/45',
      Icon: Users,
    },
  };

const base =
  'inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium';

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: OrderStatus;
  className?: string;
  showIcon?: boolean;
}) {
  const { label, className: tone, Icon } = ORDER_STYLES[status];
  return (
    <span className={cn(base, tone, className)}>
      {showIcon && <Icon className="size-3" aria-hidden />}
      {label}
    </span>
  );
}

export function TableStatusBadge({
  status,
  className,
}: {
  status: TableStatus;
  className?: string;
}) {
  const { label, className: tone, Icon } = TABLE_STYLES[status];
  return (
    <span className={cn(base, tone, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const tone =
    role === 'OWNER'
      ? 'bg-primary/20 text-primary border-primary/45'
      : role === 'KITCHEN'
        ? 'bg-status-preparing/20 text-status-preparing border-status-preparing/45'
        : 'bg-status-completed/20 text-status-completed border-status-completed/45';
  return (
    <span className={cn(base, tone, 'text-[11px] tracking-wide uppercase', className)}>{role}</span>
  );
}
