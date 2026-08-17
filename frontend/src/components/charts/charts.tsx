import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCurrency, useTimezone } from '@/hooks/useAuth';
import { formatDayShort } from '@/lib/datetime';
import { formatMoney, moneyToChartNumber } from '@/lib/money';
import type { DailyRow, HourlyRow, TopItemRow } from '@/types/domain';
import { AXIS_PROPS, ChartTooltip, GRID_PROPS, MARK } from './primitives';

/**
 * Every chart here plots a single series, so none carries a legend — the card
 * title already names what is drawn. Money becomes a number exactly once, at
 * this boundary, because charts cannot plot strings.
 */

export function RevenueAreaChart({ data }: { data: DailyRow[] }) {
  const tz = useTimezone();
  const currency = useCurrency();

  const points = data.map((row) => ({
    day: formatDayShort(row.day, tz),
    revenue: moneyToChartNumber(row.revenue),
    orders: row.orders,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="revenueWash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={MARK.areaOpacity * 2} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="day" {...AXIS_PROPS} minTickGap={24} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={(v: number) => compact(v, currency)} />
        <Tooltip
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label as string}
              rows={[
                {
                  key: 'revenue',
                  label: 'Revenue',
                  color: 'var(--chart-1)',
                  value: formatMoney(((payload?.[0]?.value as number) ?? 0).toFixed(2), currency),
                },
                {
                  key: 'orders',
                  label: 'Orders',
                  value: (payload?.[0]?.payload as { orders?: number } | undefined)?.orders ?? 0,
                },
              ]}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--chart-1)"
          strokeWidth={MARK.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="url(#revenueWash)"
          activeDot={{ ...MARK.activeDot, fill: 'var(--chart-1)' }}
          /*
            A line needs two points to be a line. With a single day in range —
            a restaurant on its first day — the series drew nothing at all and
            the card looked broken, so that one day gets a visible marker.
          */
          dot={
            points.length === 1
              ? { r: 4.5, strokeWidth: 2, stroke: 'var(--card)', fill: 'var(--chart-1)' }
              : false
          }
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars — item names are long, and reading them across is easier. */
export function TopItemsBarChart({ data }: { data: TopItemRow[] }) {
  const currency = useCurrency();
  const narrow = useNarrowViewport();

  /*
    The category axis is the one thing that can starve this chart. At a fixed
    120px it took a third of a phone-width card, leaving the bars almost no
    room to say anything. On a narrow screen the axis gets 84px and the labels
    are elided to fit; the tooltip still carries the full name.
  */
  const axisWidth = narrow ? 84 : 120;
  const maxChars = narrow ? 11 : 18;

  const points = [...data]
    .slice(0, 10)
    .reverse()
    .map((row) => ({
      name: row.itemName,
      units: row.unitsSold,
      revenue: moneyToChartNumber(row.revenue),
    }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, points.length * 34)}>
      <BarChart data={points} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          {...AXIS_PROPS}
          width={axisWidth}
          /*
            A custom tick, not `tickFormatter`. Recharts' default tick is a
            `<Text>` that word-wraps to the axis width, so "Paneer Tikka" broke
            across two lines and collided with its neighbours. One `<text>` node
            with an ellipsis stays on one line at any width.
          */
          tick={<CategoryTick maxChars={maxChars} />}
        />
        <Tooltip
          cursor={{ fill: 'var(--accent)', fillOpacity: 0.4 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label as string}
              rows={[
                {
                  key: 'units',
                  label: 'Units sold',
                  color: 'var(--chart-3)',
                  value: (payload?.[0]?.value as number) ?? 0,
                },
                {
                  key: 'revenue',
                  label: 'Revenue',
                  value: formatMoney(
                    (
                      (payload?.[0]?.payload as { revenue?: number } | undefined)?.revenue ?? 0
                    ).toFixed(2),
                    currency,
                  ),
                },
              ]}
            />
          )}
        />
        {/* One series → one colour for every bar. Never a value-ramp on nominal items. */}
        <Bar
          dataKey="units"
          fill="var(--chart-3)"
          radius={MARK.barRadiusHorizontal}
          maxBarSize={MARK.barSize}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HourlyBarChart({ data }: { data: HourlyRow[] }) {
  const points = data.map((row) => ({
    hour: `${String(row.hourOfDay).padStart(2, '0')}:00`,
    orders: row.orders,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="hour" {...AXIS_PROPS} interval={2} />
        <YAxis {...AXIS_PROPS} width={44} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--accent)', fillOpacity: 0.4 }}
          content={({ active, label, payload }) => (
            <ChartTooltip
              active={active}
              label={label as string}
              rows={[
                {
                  key: 'orders',
                  label: 'Orders',
                  color: 'var(--chart-2)',
                  value: (payload?.[0]?.value as number) ?? 0,
                },
              ]}
            />
          )}
        />
        <Bar
          dataKey="orders"
          fill="var(--chart-2)"
          radius={MARK.barRadius}
          maxBarSize={MARK.barSize}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-line, ellipsised category tick. Recharts passes x/y/payload in. */
function CategoryTick({
  x,
  y,
  payload,
  maxChars,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  maxChars: number;
}) {
  const name = payload?.value ?? '';
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--muted-foreground)" fontSize={11}>
      {name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name}
    </text>
  );
}

/**
 * Recharts axis widths are numbers, not CSS — a media query is the only way to
 * give a chart a different axis budget on a phone than on a desk.
 */
function useNarrowViewport(query = '(max-width: 640px)'): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    setNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return narrow;
}

/** Axis ticks: clean, compact numbers — they carry the values not directly labelled. */
function compact(value: number, currency: string): string {
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return formatMoney(value.toFixed(2), currency).replace(/\.00$/, '');
}
