# Step 17 — Owner shell & staff UI

**Depends on:** [16 — Auth flow & routing](../16-frontend-auth-and-routing/CLAUDE.md)
(needs an authenticated `OWNER` route to render inside) and the backend's
staff module ([step 05](../05-rbac-restaurant-and-staff/CLAUDE.md)).

## What shipped

The full owner shell (`Sidebar`, `Topbar` with restaurant name/user/role
badge/connection dot/logout, `PageHeader`) and, inside it, `/owner/staff` —
built deliberately as **the first full CRUD screen**, because every later
data-table-plus-dialogs screen in the app copies its pattern rather than
inventing a new one:

- `StaffTable` — the shared `DataTable<TData>` (TanStack Table v8 wrapped
  once in `components/common/`, so feature files only ever declare
  `ColumnDef<T>[]`) with sort, role filter, and global search.
- `AddStaffDialog` (name, email, password, role) and `ResetPasswordDialog` —
  both RHF + Zod against `createStaffSchema`/`resetPasswordSchema`, which
  mirror the backend's `CreateStaffDto`/`ResetStaffPasswordDto` field for
  field.
- `ToggleActiveSwitch` — the owner's own row is never deactivatable in the
  UI (matching the backend's own refusal); the `KITCHEN` role option in
  `AddStaffDialog` is disabled with an explanatory hint once an active
  kitchen handler already exists, while the form **still** handles the
  server's `409 KITCHEN_EXISTS` if that check is ever stale, mapping it onto
  the role field rather than a bare toast.

## Key decisions

| Decision | Reason |
|---|---|
| Staff chosen as the first screen, not the dashboard or a simpler read-only page | It exercises the full pattern — table, create dialog, edit, destructive-action confirmation, server-error-to-field mapping — once, so every later screen is "the same shape, different columns," not new plumbing each time |
| Client-side "kitchen slot already taken" hint **and** server error handling for the same case | The hint is UX; the 409 handling is correctness. Disabling a button is not a substitute for handling the response if the disable logic is ever wrong or stale |
| Server field errors mapped via `setError('email', …)` | A bare toast for "email taken" makes the user hunt for which field was wrong; inline field errors don't |

## Verified

Creating a waiter and a kitchen handler through the dialog succeeded and
both appeared in the table without a manual refresh (TanStack Query
invalidation on the mutation). Attempting to add a second kitchen handler
showed the disabled option with its hint; forcing the request anyway (via
the API directly) surfaced the server's `409 KITCHEN_EXISTS` as an inline
field error, confirming both layers actually work. Deactivating a waiter
removed their row's active styling; attempting to deactivate the owner's own
row had no such control to click.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Screens & components
→ Owner — Staff*, *Forms — RHF + Zod*, *TanStack Table usage*, and *Build
order* item 4.
