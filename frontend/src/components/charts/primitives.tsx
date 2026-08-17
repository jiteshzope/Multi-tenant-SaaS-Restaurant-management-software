import type { CSSProperties, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/States';
import { cn } from '@/lib/cn';

/**
 * Shared chart chrome and the fixed mark specs every chart in the app obeys:
 *
 *   line           2px, round cap/join, no per-point dots
 *   marker         r ≥ 4 with a 2px ring in the surface colour
 *   bar / column   ≤ 24px thick, 4px rounded data-end, square at the baseline
 *   area fill      the series hue at ~10% opacity — a wash, never a block
 *   grid / axes    hairline, solid, one step off the surface, recessive
 *
 * Colours come from the CSS variables, never literals, so light and dark stay
 * in step. Text always wears text tokens — never the series colour.
 */

export const MARK = {
  lineWidth: 2,
  barSize: 24,
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadiusHorizontal: [0, 4, 4, 0] as [number, number, number, number],
  areaOpacity: 0.1,
  activeDot: { r: 4.5, strokeWidth: 2, stroke: 'var(--card)' },
} as const;

export const AXIS_PROPS = {
  stroke: 'var(--muted-foreground)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: 'var(--border)',
  strokeDasharray: '0',
  vertical: false,
} as const;

export function ChartCard({
  title,
  subtitle,
  children,
  loading,
  isEmpty,
  emptyLabel = 'No data in this range',
  className,
  action,
  accent = 'var(--chart-1)',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  action?: ReactNode;
  /** Hue of the series inside, echoed in the title's leading mark. */
  accent?: string;
}) {
  return (
    <Card className={cn('min-w-0 p-4 sm:p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            className="mt-1 h-8 w-1 shrink-0 rounded-full"
            style={{ background: accent }}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>

      {loading ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : isEmpty ? (
        <EmptyState title={emptyLabel} className="border-0 py-12" />
      ) : (
        children
      )}
    </Card>
  );
}

/** One tooltip for every chart, so hover feels identical across the dashboard. */
export function ChartTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: ReactNode;
  rows: { key: string; label: string; value: ReactNode; color?: string }[];
}) {
  if (!active) return null;
  return (
    <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 shadow-xl shadow-black/30 backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      )}
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
            )}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular ml-auto font-medium">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A headline number. The dashboard leads with these rather than a one-bar chart —
 * the number *is* the chart.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  accent = 'var(--chart-1)',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <Card
      style={{ '--tone': accent } as CSSProperties}
      className="toned relative min-w-0 overflow-hidden p-4 sm:p-5"
    >
      <span aria-hidden className="tone-rail absolute inset-y-0 left-0 w-1" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            {label}
          </p>
          {/*
            The number wraps rather than truncating. A stat tile exists to show
            one figure — "₹4,920.0…" is worse than two lines, and at 320px a
            long currency string will not fit on one.
          */}
          <p
            className="mt-1.5 text-2xl leading-tight font-semibold break-words"
            style={{ color: accent }}
          >
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg ring-1"
            style={
              {
                background: `color-mix(in oklch, ${accent} 20%, transparent)`,
                color: accent,
                '--tw-ring-color': `color-mix(in oklch, ${accent} 35%, transparent)`,
              } as CSSProperties
            }
          >
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}
