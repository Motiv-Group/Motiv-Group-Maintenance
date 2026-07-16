# Company Identity (CI) — Motiv

The single reference for Motiv's **fonts and colours**. Use these tokens
everywhere instead of hard-coding hex or picking ad-hoc fonts, so the app stays
visually consistent in light and dark mode.

> Sources of truth in code: `lib/settings.ts` (`BRAND_DEFAULT_HEX` — factory
> palette), `app/globals.css` (brand RGB-channel vars + surface/text CSS vars),
> `tailwind.config.ts` (Tailwind `brand-*` wiring), `lib/utils.ts`
> (status/priority badge colours), `lib/categoryVisual.ts` (maintenance-category
> icon colours).
>
> **The palette is runtime-overridable.** The admin **Customize** tab
> (`/admin/customization`, stored in `app_settings`) can replace every brand
> stop, logo and app name without a redeploy — the values below are the
> **factory defaults**, injected as CSS vars by `app/layout.tsx`.

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

### Brand palette — warm charcoal & gold/cream (factory defaults)

Warm charcoal is the primary/structural colour (dark nav, chrome); the
gold/cream tints are the warm brand accent range. Defined as RGB channels in
`globals.css` (`--brand-*`) so Tailwind opacity modifiers work; hex mirror in
`lib/settings.ts` `BRAND_DEFAULT_HEX`.

| Token | Factory hex | Use |
|-------|-----|-----|
| `brand-50` | `#f8f5ed` | lightest cream tint |
| `brand-100` | `#e8dfc4` | pale gold tint |
| `brand-300` | `#c9b99a` | muted gold |
| `brand-400` | `#b5a07d` | muted gold (darker) |
| `brand-500` | `#1b1d24` | mid charcoal |
| `brand-600` | `#0e1016` | **primary charcoal** — dark-mode nav/chrome, native splash bg |
| `brand-700` | `#090a0e` | charcoal border/hover |
| `brand-900` | `#050608` | deepest charcoal |

> The soft gold (`brand-300/400` range) is **decorative only** — interactive
> elements use **blue** for actions and **green** for select/accept/approve
> (active nav tab is `text-blue-400`). Don't put gold on buttons or links.

### Surface & text — theme CSS vars (`app/globals.css`)

Always reference these `var(--…)` tokens (never a raw hex) so the light/dark
toggle works. `Card` in `components/exec/ui.tsx` is the shared surface.

| Var | Light | Dark |
|-----|-------|------|
| `--app-bg` | `#f0f1f4` | `#0b0c11` |
| `--surface` | `#ffffff` | `#17181e` |
| `--surface-2` | `#f7f8fa` | `#101116` |
| `--nav-bg` | `#ffffff` | `#0e1016` |
| `--border` | `rgba(17,18,24,.115)` | `rgba(255,255,255,.07)` |
| `--hover` | `rgba(17,18,24,.045)` | `rgba(255,255,255,.05)` |
| `--input-bg` | `#f1f2f4` | `rgba(0,0,0,.22)` |
| `--text` | `#14151a` | `#f6f6f7` |
| `--text-muted` | `#4b4d57` | `#9a9ca6` |
| `--text-faint` | `#565a64` | `#9498a3` |

### Semantic / action colours (Tailwind scales)

| Role | Colour | Where |
|------|--------|-------|
| Primary action / links | `blue-600` | Start Quick Log, Next, links, active nav tab (`blue-400` on dark chrome) |
| Success / submit / approve | `emerald-600` / `green-600` | Submit ticket, accept/approve, on-track KPIs |
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

1. Reference tokens, not hex: `bg-[var(--surface)]`, `bg-brand-600`.
2. Style **both** light and dark — every surface/text colour has a dark counterpart.
3. Nav/chrome: light mode uses `--nav-bg` white, dark mode charcoal `#0e1016`.
4. New status/priority/category colours go in the central maps, not inline.
5. Remember the palette can be re-branded at runtime — never assume the factory
   hex at runtime; read the CSS vars.
