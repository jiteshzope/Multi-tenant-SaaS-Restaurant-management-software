# Step 24 — Reports UI

**Depends on:** [23 — Frontend realtime integration](../23-frontend-realtime-integration/CLAUDE.md)
(built last among the data screens since it's the least operationally
urgent — nobody needs a revenue chart to run service) and the backend's
reports module ([step 12](../12-reports-module/CLAUDE.md)).

## What shipped

`/owner/reports` (and the dashboard's `StatCards` at `/owner`), lazy-loaded
via route-level `React.lazy` specifically because Recharts is the single
heaviest chunk in the app (~113kB gzipped) — a waiter on a tablet or a
kitchen handler on a wall screen never downloads it, since neither role's
route ever imports this file.

- `StatCards` — today's revenue, orders, open tables, average bill.
- `RevenueLineChart` (`GET /reports/daily`), `TopItemsBarChart` (horizontal,
  `GET /reports/top-items`), `HourlyLoadChart` (`GET /reports/hourly`),
  `WaiterPerformanceTable` (`GET /reports/waiters`, sortable by revenue).
- `PrepTimeCard` — three stat tiles (average, worst, count), **not** a chart.
  The plan originally called for a stat-card-plus-area-chart, but
  `/reports/prep-time` returns three scalars with no time series to plot —
  charting two numbers would just be a one-bar bar chart wearing a
  different name, so the simpler, more honest presentation was built
  instead.
- `DateRangePicker` (Today / 7d / 30d / custom presets) — the selected range
  is part of the TanStack Query key, so switching it is a normal cache-keyed
  refetch, not manual state juggling.
- Every chart sits inside a shared `ChartCard` (title, range subtitle,
  loading skeleton, `EmptyState` for no data) and every chart is a
  **single-series** plot, so none of them carries a legend — the card title
  plus a leading color mark in the series color communicates what's drawn.

## Key decisions

| Decision | Reason |
|---|---|
| Route-level lazy loading for the whole reports branch | Recharts is the heaviest dependency in the app and is used by exactly one role — shipping it to the other two would be pure waste |
| Prep-time shown as stat tiles instead of forcing a chart | The plan's original shape didn't match the actual payload shape; a chart with nothing meaningful to plot is worse UX than three clearly-labeled numbers |
| Chart colors sourced from CSS custom properties, not literals | The same validated dark-mode chart ramp from step 14 must be what every chart actually renders with, not a chart-library default that was never checked for contrast or color-blind separation |
| Money converted from its `Money` string type to a number exactly once, at the chart boundary | Charting libraries need numbers to plot; nothing outside that single conversion point is allowed to treat money as a number |

## Verified

The build's vendor-split output confirmed Recharts (~113kB gzip) loads only
when `/owner` or `/owner/reports` is visited — checked by inspecting the
network panel while navigating as a `WAITER` and a `KITCHEN` user and
confirming the chunk never loads for either. Switching date range presets
produced correctly re-keyed requests and matching chart updates. Numbers
shown in `WaiterPerformanceTable` matched the backend's `$queryRaw`
aggregate output from step 12's own verification.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Owner — Dashboard & Reports*, *Recharts usage*, the *Deploying* section's
chunk-size table, and *Build order* item 11.
