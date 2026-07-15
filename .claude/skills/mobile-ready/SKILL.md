---
name: mobile-ready
description: >-
  Make a new or changed part of the Motiv web app mobile-correct (the Capacitor
  Android wrapper + PWA render the same responsive site). Apply the mobile-first
  additive recipe — no horizontal overflow, bottom-sheet modals that lock the
  background, real touch targets, robust photo upload — then verify at 375px.
  Use whenever you add or change ANY UI: a page, card, list/table, modal/pop-up,
  filter bar, form, or file upload. Invoke right after the feature works on
  desktop and before committing.
---

# Mobile-ready

Motiv is **mobile-first**. The Android app (`capacitor.config.ts` → `server.url`)
and the PWA both load the *same* deployed responsive site, so "getting the mobile
app right" = getting the responsive web right. This skill is the repeatable recipe
that phases 1–4 of `docs/MOBILE_READINESS.md` applied to the RM surface. Run it on
every new/changed feature so mobile never regresses.

## Prime directive — mobile-first *additive*

**Base (unprefixed) classes target the phone. `sm:`/`lg:` restore the exact
desktop rendering.** Never change desktop pixels: if a value is right on desktop,
push it behind `sm:` and give the phone a smaller base. This keeps web
pixel-identical so only the phone needs re-checking.

```
p-4 sm:p-5        h-9 w-9 sm:h-11 sm:w-11        text-xl sm:text-2xl
grid-cols-1 sm:grid-cols-2        line-clamp-2 sm:line-clamp-1
```

The `sm:contents` trick regroups only on mobile: wrap a mobile-only container in
`<div className="… sm:contents">` so at `sm:` the wrapper dissolves and the parent
layout is untouched.

## The audit checklist (run against the diff)

Target viewport **≈375px** (iPhone SE / small Android). For each changed surface:

1. **No horizontal page scroll.** Primary lists/tables must NOT sideways-scroll.
   Give a wide grid/table a stacked-card fallback: `sm:hidden` cards + `hidden
   sm:block` table. `overflow-x-auto` is only for *secondary* content (document
   tables, control strips) — never the main working list. Watch unconstrained
   native `<select>` (sizes to its longest option) and `whitespace-nowrap` rows.
2. **Badge/price clusters never starve the title.** No rigid `shrink-0` row of
   fixed-width badges next to a truncating title. Stack (`flex-col items-end …
   sm:flex-row`) or un-fix widths (`w-auto sm:w-[120px]`); let long free-text
   titles `line-clamp-2` on mobile, `sm:truncate` on desktop.
3. **All pop-ups are bottom-sheets that lock the background.** Use the shared
   `Modal` (`components/ui/Modal.tsx`) — `items-end … sm:items-center`,
   `rounded-t-2xl sm:rounded-2xl`, safe-area bottom padding. EVERY overlay (modal,
   drawer, lightbox, confirm) must call `useScrollLock` (see below) so the page
   behind can't scroll. A hand-rolled `fixed inset-0` overlay without the lock is
   a bug.
4. **Real touch targets.** Interactive controls ≥ ~44px on mobile: `p-2.5 sm:p-2`,
   chips `h-10`+, icon-only buttons get a bigger base hit box.
5. **Mobile density scale.** Cards `p-4`, icon chips `h-9`/`h-10`, key values
   `text-xl`, empty states `p-8` — all with `sm:` restoring desktop. Trim oversized
   `p-12` empty states and `gap-x-6` detail grids on phones.
6. **Control strips are swipeable + scrollbar-free.** A row of filter pills / tabs
   that overflows scrolls by swipe inside `overflow-x-auto` + the `.no-scrollbar`
   utility (a visible scrollbar draws a line across controls and the content
   below). See the tab pattern below.
7. **Photo/file upload survives mobile pickers.** See the upload rule below —
   the #1 mobile upload bug.
8. **Safe-area insets.** Bottom-fixed chrome/CTAs use
   `env(safe-area-inset-bottom)` (`.safe-bottom`, or the Modal's built-in pad) so
   gesture-nav bars don't cover the last row.
9. **CSS vars, not raw hex.** Surfaces/text via `var(--surface|--border|--text|
   --text-muted|--text-faint|--input-bg)` so light/dark both work. Interactive
   accent = blue; semantic attention = amber `#f59e0b`. Never hardcode gray-*/white.

## Copy-paste patterns

### Bottom-sheet modal (shared) — already locks scroll
```tsx
import { Modal } from '@/components/ui/Modal'
<Modal onClose={done}>{close => (/* content */)}</Modal>
```
Building a bespoke overlay instead? It MUST lock scroll:
```tsx
import { useScrollLock } from '@/lib/useScrollLock'
// component always mounted, overlay shown via {open && …}:
useScrollLock(open)              // pass the OPEN flag — `true` here locks forever
// component only mounts when open: useScrollLock()   // unconditional is fine
```
`useScrollLock` is mobile-safe (position:fixed technique — plain
`body{overflow:hidden}` does NOT stop iOS/WebView touch-scroll) and ref-counted
for stacked pop-ups. Replace any `document.body.style.overflow = 'hidden'` with it.

### Shared filter bar (search + pills, swipeable on mobile)
```tsx
import { FilterSelect, SearchInput } from '@/components/exec/ui'
<div className="flex flex-wrap items-center gap-2">
  <SearchInput value={q} onChange={setQ} placeholder="Search…" />
  {/* mobile: one swipeable pill strip; sm:contents restores the desktop row */}
  <div className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar sm:contents">
    <FilterSelect label="Status" value={status} onChange={setStatus} options={[…]} />
  </div>
</div>
```
Reuse these two — do not hand-roll another `<select>` pill or search input.

### Swipeable tab strip (scrollbar hidden, swipe to change tab)
```tsx
<div ref={stripRef} className="no-scrollbar -mx-5 flex snap-x gap-1 overflow-x-auto border-b …">
  {tabs.map(t => <button aria-current={tab===t.key ? 'page' : undefined} …>{t.label}</button>)}
</div>
{/* content: swipe left/right = next/prev tab; touchAction pan-y keeps vertical scroll */}
<div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}>…</div>
// on tab change: stripRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({inline:'center',block:'nearest'})
```
See `components/regional/RmTicketTabs.tsx` for the full swipe handler.

### Dropdown/menu inside a modal — portal it
An `absolute` menu is clipped by a modal's `overflow-y-auto` (which also clips
overflow-x, cutting the menu off to the side). Portal the menu to `document.body`,
fixed-position it against the trigger's `getBoundingClientRect()`, and clamp `left`
into the viewport. See `MoreMenu` in `components/regional/RmTicketActions.tsx`.

### Photo / file upload (mobile-robust) — the #1 upload bug
Android WebView often hands back a picked image with an **empty MIME type**, so a
`filter(f => f.type.startsWith('image/'))` **silently drops it** — the user picks a
photo and nothing uploads. Always accept empty type (the `accept="image/*"` picker
already limits selection, and `/api/uploads` accepts `!f.type`):
```tsx
const imgs = incoming.filter(f => !f.type || f.type.startsWith('image/'))
```
And NEVER ignore `uploadFiles`' `failed[]` — surface it and block submit:
```tsx
const { urls, failed } = await uploadFiles(files, 'ticket-photos')
if (failed.length) { setErr(`Couldn't upload ${failed.length} photo(s).`); return }
```
Add `capture="environment"` to a camera input; keep min/max photo gates.

### Stacked-card fallback for a wide table
```tsx
<div className="sm:hidden">{rows.map(r => <MobileCard … />)}</div>{/* stacked cards */}
<div className="hidden overflow-x-auto sm:block"><table className="min-w-[920px]">…</table></div>
```

## Verify at 375px (do this before committing)

The change is observable in the browser preview when the dev server renders it.

1. `preview_start { name: "motiv" }`, `resize_window { preset: "mobile" }` (375px).
2. For an auth'd page you can't reach, drop a **temporary** `app/uipreview/page.tsx`
   that renders the component(s) with mock props (see prior phases). DELETE it
   before committing (and `rm -rf .next/dev` if stale types linger).
3. Measure — no page-level horizontal overflow, controls render, strips scroll
   internally:
   ```js
   const de = document.documentElement
   ;({ horizScroll: de.scrollWidth > de.clientWidth, w: de.scrollWidth, client: de.clientWidth })
   ```
   `horizScroll` must be `false`. Check console/network for errors.
4. `resize_window` with `colorScheme: 'dark'` to confirm both themes (CSS vars).
5. Open every new pop-up and confirm the background does NOT scroll behind it.

Then `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean.

## Guardrails

- **Additive only** — desktop stays pixel-identical; keep every `sm:`/`lg:` value
  that already renders correctly on wide screens.
- **Don't `git add -A`** — untracked brand assets / concurrent features live in the
  tree; stage only the files you changed.
- Log a mobile item you can't fix now into `docs/MOBILE_READINESS.md` rather than
  dropping it silently.

## References

- `docs/MOBILE_READINESS.md` — the four standing rules + the RM findings tracker.
- `CLAUDE.md` → *Conventions › Mobile rules* and the surface/CSS-var conventions.
- Live examples: `components/ui/Modal.tsx`, `lib/useScrollLock.ts`,
  `components/exec/ui.tsx` (`FilterSelect`/`SearchInput`),
  `components/regional/RmTicketTabs.tsx` (swipe tabs),
  `components/regional/RmTicketActions.tsx` (`MoreMenu` portal + upload).
