# Company Identity (CI) — Motiv

The single reference for Motiv's **fonts and colours**. Use these tokens
everywhere instead of hard-coding hex or picking ad-hoc fonts, so the app stays
visually consistent in light and dark mode.

> Sources of truth in code: `tailwind.config.ts` (brand palette), `app/globals.css`
> (surface/text CSS vars), `lib/utils.ts` (status/priority badge colours),
> `lib/categoryVisual.ts` (maintenance-category icon colours).

---

## Typography

**Primary typeface: Geist** (Vercel's `geist` npm package, self-hosted via
`next/font` — no external request, so it's CSP-safe). Loaded once in
`app/layout.tsx` (`GeistSans` + `GeistMono` as CSS-var classes on `<html>`) and
wired into Tailwind's `fontFamily` in `tailwind.config.ts`, so plain `font-sans`
(the default) is Geist everywhere. It falls back to the system UI stack
(Segoe UI / San Francisco / Roboto) until the font paints.

- **Body / UI:** `font-sans` → Geist Sans (default — no class needed).
- **Weights in use:** `font-medium` (500), `font-semibold` (600), `font-bold` (700).
- **Monospace:** `font-mono` → Geist Mono (`var(--font-geist-mono)`).

> To change the typeface, swap the `next/font` import in `app/layout.tsx` and the
> `fontFamily` vars in `tailwind.config.ts` — do **not** add a `<link>` to Google
> Fonts (the strict CSP blocks external hosts). Prefer a self-hosting package
> (like `geist`) or `next/font/google` (which self-hosts at build time).

---

## Colour

### Brand palette — navy & gold (`tailwind.config.ts` → `brand-*`)

Deep navy is the primary/structural colour (nav bars, headers); the golds are the
warm brand accent.

| Token | Hex | Use |
|-------|-----|-----|
| `brand-50` | `#f8f5ed` | lightest cream tint |
| `brand-100` | `#e8dfc4` | pale gold tint |
| `brand-300` | `#c9b99a` | muted gold |
| `brand-400` | `#b5a07d` | muted gold (darker) |
| `brand-500` | `#1a3347` | mid navy |
| `brand-600` | `#0d1f2d` | **primary navy** — nav bars, chrome (light + dark) |
| `brand-700` | `#0a1922` | navy border/hover |
| `brand-900` | `#060f15` | deepest navy |

### Gold accent

| Value | Use |
|-------|-----|
| `#C6A35D` | **Brand gold** — active nav tab, avatar chip, highlights, "AI" pill. Used inline as `text-[#C6A35D]` / `bg-[#C6A35D]`. |

### Surface & text — theme CSS vars (`app/globals.css`)

Always reference these `var(--…)` tokens (never a raw hex) so the light/dark
toggle works. `Card` in `components/exec/ui.tsx` is the shared surface.

| Var | Light | Dark |
|-----|-------|------|
| `--app-bg` | `#eef2f7` | `#0a0e17` |
| `--surface` | `#ffffff` | `#1f2937` |
| `--surface-2` | `#f8fafc` | `#0e1422` |
| `--border` | `rgba(15,23,42,.10)` | `rgba(255,255,255,.07)` |
| `--hover` | `rgba(15,23,42,.045)` | `rgba(255,255,255,.05)` |
| `--input-bg` | `#f1f5f9` | `rgba(0,0,0,.22)` |
| `--text` | `#0f172a` | `#f8fafc` |
| `--text-muted` | `#475569` | `#94a3b8` |
| `--text-faint` | `#64748b` | `#64748b` |

### Semantic / action colours (Tailwind scales)

| Role | Colour | Where |
|------|--------|-------|
| Primary action / links | `blue-600` | Start Quick Log, Next, links |
| Success / submit / "clear" | `emerald-600` | Submit ticket, on-track KPIs |
| Needs attention / has-work | `amber-500/600` | KPI cards with a count, input-needed |
| Urgent / overdue / error | `red-500/600` | SLA breach, urgent, form errors |
| Scheduled | `indigo-500` | visits, scheduled status |

Status and priority **badge** classes are centralised in `lib/utils.ts`
(`STATUS_COLORS`, `PRIORITY_COLORS`, …) — reuse them, don't re-derive.

### Maintenance-category colours (`lib/categoryVisual.ts`)

Each trade has a fixed icon + hue, shared by the ticket wizard and the work
queue: Electrical = amber, Plumbing = blue, HVAC = cyan, Refrigeration = sky,
Gas = orange, Structural = slate, Shopfront = violet, Cleaning = teal,
General/Other = grey, Multiple (multi-trade) = purple.

---

## Rules of thumb

1. Reference tokens, not hex: `bg-[var(--surface)]`, `text-brand-600`, `text-[#C6A35D]`.
2. Style **both** light and dark — every surface/text colour has a dark counterpart.
3. Nav bars are always `brand-600` navy in both themes.
4. New status/priority/category colours go in the central maps, not inline.
