# Step 12 — Reports module

**Depends on:** [09 — Orders module](../09-orders-module/CLAUDE.md) and
[10 — Kitchen module](../10-kitchen-module/CLAUDE.md) (there has to be order
history and status timestamps for a report to aggregate).

## What shipped

`ReportsModule` — all `OWNER`-only: `GET /reports/summary`, `/daily`,
`/top-items`, `/waiters`, `/prep-time`, `/hourly`. Every one of them runs
hand-written `$queryRaw` aggregate SQL rather than Prisma's query builder —
the aggregations (per-day revenue, per-item totals, per-waiter performance,
average/worst prep time, hourly load) are exactly the kind of `GROUP BY` +
`ROUND` work Prisma's builder doesn't express cleanly, and the queries were
already specified in step 01's example-query set.

- The status timestamps recorded on `orders` since step 03
  (`placed_at`/`preparing_at`/`completed_at`/`cancelled_at`) are what make
  `/reports/prep-time` (average and worst kitchen turnaround) computable
  with no extra columns — it was a deliberate design payoff from the
  original schema, not a retrofit.
- Money in report responses serializes as a **string** and counts as a
  **number** — the same `Prisma.Decimal`/`bigint` handling the
  `TransformInterceptor` already applies everywhere else (see step 13),
  exercised here for the first time against raw aggregate query results
  rather than ORM-shaped ones.

## Key decisions

| Decision | Reason |
|---|---|
| `$queryRaw` instead of Prisma's query builder for every report | Multi-table aggregates with `ROUND`, date-bucketing and `GROUP BY` are what SQL is actually good at; forcing them through an ORM builder would be less readable, not more type-safe |
| Tagged-template `$queryRaw` only, never `$queryRawUnsafe` | Every value in these queries is still parameterized — reporting is not an exemption from the SQL-injection rule the rest of the backend follows |
| Reports scoped `OWNER`-only | A waiter or kitchen handler has no legitimate reason to see restaurant-wide revenue |

## Verified

Report responses were checked against the same scripted order-placement
history used to verify the orders/kitchen modules — revenue totals and
counts matched hand-computed sums over the same seed data, and money fields
arrived as strings (`"820.00"`) while count fields arrived as JSON numbers,
confirming the raw-query result went through the same serialization path as
every other endpoint rather than a separate one.

## Source of truth

[`backend/CLAUDE.md`](../../../backend/CLAUDE.md) → *API endpoints*
(`/api/reports`), *Services & critical transactions* row for `ReportService`,
and *Build order* item 11; [`database/CLAUDE.md`](../../../database/CLAUDE.md)
→ *Example queries — Reports*.
