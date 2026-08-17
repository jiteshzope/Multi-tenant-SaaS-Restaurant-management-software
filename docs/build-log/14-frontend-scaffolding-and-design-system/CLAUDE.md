# Step 14 — Frontend scaffolding & design system

**Depends on:** [13 — Backend hardening & docs](../13-backend-hardening-and-docs/CLAUDE.md)
— the frontend track starts only once the API contract it consumes is
stable and documented.

## What shipped

- `frontend/` via `npm create vite@latest -- --template react-ts`, then
  Tailwind v4 (`tailwindcss` + `@tailwindcss/vite` — no `postcss`, no
  `autoprefixer`, no `tailwind.config.ts`; Tailwind v4 is configured
  entirely in CSS) and `shadcn/ui init`, which wrote `components.json` and
  the `@theme` token block in `src/index.css`.
- The `@/*` path alias set in **both** `tsconfig.json` and `vite.config.ts`
  (`resolve.alias`) before adding any shadcn component — shadcn's generated
  imports depend on it existing first.
- Every design token declared once in `@theme` — a token like
  `--color-status-pending` mechanically generates `bg-status-pending`,
  `text-status-pending`, `border-status-pending`; no component ever
  hardcodes a hex value.
- **Dark is the default.** `<html class="dark">` ships in `index.html` so
  there's no light-mode flash before hydration; `ui.store` (built in step
  15) persists the user's choice. The dark base is a deep indigo-black
  (`oklch(0.16 0.019 266)`), not neutral grey, so saturated status colours
  have something to contrast against.
- Five status hues spread around the color wheel rather than reused from
  the light palette — pending amber, preparing blue, completed green,
  occupied violet, vacant slate — validated by `scripts/validate-palette.mjs`
  (`npm run palette`), which parses the `.dark` block and checks OKLCH
  lightness range, minimum chroma, contrast against `--card`, and
  adjacent-pair separation under normal vision plus three forms of color
  blindness. It exits non-zero, so it's a real CI gate, not a suggestion.
- `AppShell` — the root layout every authenticated route renders inside,
  built here even though no real screen exists yet.
- **The React Compiler decision made once, at this step, and left alone**:
  off by default. The plan explicitly calls out that leaving `useMemo`/
  `useCallback` half-applied (some manual, some compiler-generated) is worse
  than picking a side — so it was picked immediately rather than revisited
  per-component later.

## Key decisions

| Decision | Reason |
|---|---|
| shadcn primitives vendored by hand into `src/components/ui/` instead of run interactively | The generator (`npx shadcn@latest init`/`add`) is interactive and network-bound; the vendored files follow current shadcn output exactly (Radix + CVA + `cn()`, `ref` as a plain prop) and `components.json` is left correct so the real CLI works normally from this point on |
| Tailwind v4's CSS-first config, no `tailwind.config.ts` | This is simply how v4 works — fighting it with a JS config file would be maintaining two sources of truth for the same tokens |
| Dark-first design | The three floor roles (waiter tablet, kitchen wall screen, owner desk) are more often used in dim service environments than a typical admin dashboard |
| Chart palette validated by script, not eyeballed | A color ramp that fails for a form of color blindness is a real accessibility bug, not a style nitpick — worth gating in CI |

## Verified

`npm run dev` renders the shell with the dark theme applied and zero
console errors before any real feature exists. `npm run palette` passes
against the initial `.dark` block. The `@/*` alias resolves correctly for
both TypeScript and the Vite dev server.

## Source of truth

[`frontend/CLAUDE.md`](../../../frontend/CLAUDE.md) → *Design system —
Tailwind + shadcn/ui*, *Design system notes* (under *What was built*), and
*Build order* item 1.
