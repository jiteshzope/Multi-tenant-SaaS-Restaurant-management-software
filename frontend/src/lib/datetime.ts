import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Iso } from '@/types/domain';

/**
 * The server sends UTC. "Today's revenue" means today in the restaurant's
 * timezone, not the browser's — so every formatter takes one.
 */

export function formatTime(iso: Iso | null | undefined, tz: string): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), tz, 'HH:mm');
}

export function formatDateTime(iso: Iso | null | undefined, tz: string): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), tz, 'd MMM yyyy, HH:mm');
}

export function formatDate(iso: Iso | null | undefined, tz: string): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), tz, 'd MMM yyyy');
}

export function formatDayShort(iso: Iso | null | undefined, tz: string): string {
  if (!iso) return '';
  return formatInTimeZone(new Date(iso), tz, 'd MMM');
}

/** "24 min", "1 h 05 m" — for elapsed timers driven by server `ageSeconds`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Compact form for kitchen cards where space is tight.
 *
 * Under an hour this is the mm:ss stopwatch a kitchen reads at a glance. Past
 * an hour it switches to `4h 39m`: a plain minute count keeps counting up
 * forever, and "279:40" is not a number anyone can convert to "how late is
 * this" in the middle of service.
 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 3600) {
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function elapsedSince(iso: Iso): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

/** `yyyy-MM-dd` in local time — the shape the report endpoints expect. */
export function toDateParam(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
