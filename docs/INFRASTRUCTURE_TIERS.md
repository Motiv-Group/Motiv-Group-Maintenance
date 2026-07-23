# Infrastructure tiers & limits (DEV = free/hobby)

> **Status:** Motiv currently runs entirely on **free / hobby tiers** for development.
> This file records each provider's limits and which features are **deferred until we
> upgrade to a paid tier**. When we go paid, revisit every ⏭️ item below.
> Provider limits change — treat the numbers as "last known", confirm on the provider's
> pricing page before relying on them.

## ⚠️ Go-public gotcha
**Vercel Hobby is licensed for non-commercial / personal use only.** A public, commercial
launch requires **Vercel Pro** (per Vercel's ToS) — this is a licensing requirement, not
just a limits one. Budget for Pro before charging customers or marketing publicly.

## 💰 Cost & necessity — what you actually must pay for
| Service | Needed to run? | Why | Free tier OK? | When you must pay (approx) |
|---|---|---|---|---|
| **Vercel** | **YES** — hosting | Runs the whole app, API routes, crons | Dev only | Public/commercial launch → **Pro ~$20/mo** (license, not just limits) |
| **Supabase** | **YES** — backend | DB + Auth + Storage + Realtime = all app data & security | Dev only | Before real customer data → **Pro ~$25/mo** (backups/PITR, no auto-pause) |
| **Upstash** | No (falls back) | Distributed rate limiting (abuse/DoS). Without it, rate limiting degrades to weak per-instance | **Yes**, generous | Only as traffic grows |
| **Sentry** | No | Error monitoring — catch prod bugs/attacks fast | **Yes** (~5k events/mo) | Only at higher volume; keep, but free is fine to start |
| **Resend** | Only if emailing | Invites / onboarding / password emails | **Yes** (3k/mo, 100/day) | High email volume |
| **Groq** | Only for AI features | WhatsApp voice/text intake + quote-PDF auto-parse | **Yes** (dev limits) | High AI volume |
| **WhatsApp Cloud API** | Only for WhatsApp intake | Log tickets via WhatsApp | Free low volume | Business messaging / templates |

**Bottom line:**
- **Truly required to function: Vercel + Supabase.** Nothing else is load-bearing.
- **Real must-pay for a serious public launch: Vercel Pro (~$20) + Supabase Pro (~$25) ≈ $45/mo.** Those two only — Pro for the commercial license, Supabase Pro for backups before you hold real customer data.
- **Everything else stays free** for a pilot / small launch and only costs as you scale. Upstash + Sentry are worth keeping on free tiers (security + ops). Resend / Groq / WhatsApp cost nothing unless/until you lean on those features heavily.
- So realistic minimum for launch ≈ **$45/mo**; the rest ≈ **$0** until growth.

## 📌 DEFERRED FEATURES BACKLOG (tier-blocked) — living list, APPEND HERE
> Any feature we can't build because of a free-tier limit goes here. Add a new row
> whenever you hit one; move it to "done" (with the date) when the tier is upgraded and
> the feature is shipped. Claude: check + update this list each session.

| # | Feature / need | Blocked by | Interim workaround | Unblocks on |
|---|---|---|---|---|
| 1 | **Hourly SLA / health recompute cron** (`/api/cron/v3-recompute` exists but is NOT scheduled) | Vercel Hobby crons are **daily-granularity only** — can't run hourly | Health/SLA is computed **live per request** from tickets; trend snapshots run once daily in `v3-snapshots` | Vercel **Pro** (sub-daily + more crons) |
| 2 | **WhatsApp technician dispatch + arrival tracking** | Needs a Meta-approved template + paid WhatsApp messaging beyond the free conversation cap | Roster shipped; dispatch not wired | WhatsApp paid + approved template |
| 3 | **Automated DB backups / point-in-time recovery** | Supabase Free has no backups/PITR | None — manual export only | Supabase **Pro** |
| 4 | **Leaked-password protection** (HaveIBeenPwned check on signup) | **Not available on Supabase Free** — Pro feature | Min-password-length rule only | Supabase **Pro** |
| 5 | **In-app Vercel traffic/bandwidth analytics** (on `/admin/vercel`) | Vercel Web Analytics + usage data are **not in the Hobby REST API** (Analytics is a Pro add-on) | `/admin/vercel` shows deployments/build-state/domains and links out to the Vercel dashboard for traffic | Vercel **Pro** + Web Analytics |
| 6 | **In-app Upstash command/bandwidth graphs** (on `/admin/upstash`) | Redis REST API has no usage stats — needs the separate **Upstash Management API + a new credential** | Show DBSIZE + live `motiv-rl` key count; link to the Upstash console for graphs | Wire Upstash Management API (or paid) |
| 7 | **In-app Resend send/delivery analytics** (on `/admin/resend`) | Free Resend API exposes **domains/keys, not send/open/bounce metrics** | Show domains + `EMAIL_FROM` config; link to the Resend dashboard for volume | Resend paid / analytics API |
| 8 | **In-app Supabase egress/MAU/usage metrics** (on `/admin/supabase`) | Supabase usage/egress needs the **Management API + a PAT**; free usage reports are dashboard-only | Show DB size, storage size and row counts via `admin_db_stats()`; link to Supabase reports | Supabase Management API / **Pro** |
| 9 | **Large multi-photo uploads in one request** (`POST /api/uploads` allows up to 10×15 MB, but Vercel serverless caps the request body at ~4.5 MB) | Vercel serverless request-body limit (~4.5 MB), independent of the app's per-file cap | Small/few photos work; the route now returns per-file `errors[]` so failures are visible. Planned code fix: upload one file per request (chunk the batch in `lib/upload.ts`) and/or client-side image compression | Code change (per-file upload / compression) — or Vercel **Pro/Fluid** for a larger body limit |
| 10 | **Cold-start TTFB on SA production traffic** (Speed Insights RES ~63; TTFB ~3.6s, FCP/LCP ~4.8s — frontend metrics all green, so it's pure server latency) | Vercel Hobby serverless functions spin down; sparse SA traffic (~28 visits/wk) means most real visits pay a cold start (~1–3s). No warm/fluid compute on Hobby | Pinned function region to `fra1` (co-located with the Frankfurt Supabase → local DB queries; also closer to SA than the previous US-East default) and cached the per-SSR branding read — kills the ocean hop + one DB round trip, but not the cold start itself | Vercel **Pro** (Fluid compute / warm functions), or organic traffic growth keeping functions warm |
| 11 | *(add the next tier-blocked item here)* | | | |

_Note: after deleting the legacy `/api/cron/snapshots`, there is now **one free Hobby cron
slot** — but Hobby is still daily-only, so item #1 (hourly) stays blocked until Pro._

## Per-provider limits (free tier) + what's deferred

### Vercel — Hobby
- **Crons: max 2 jobs, daily granularity only** (can't run hourly/every-N-min). We use them for the nightly snapshot + morning briefing push (folded together). See [[vercel-hobby-crons]].
- Serverless function max duration ~60s (routes set `maxDuration = 60`).
- **In-memory rate limiting is per-instance** across the serverless fleet → not a real global limit (why we added Upstash).
- Bandwidth/build minutes capped; non-commercial license.
- ⏭️ **On Pro:** more crons + sub-daily schedules → move the hourly SLA/health recompute to a real cron (currently computed live per-request / folded in); higher limits; commercial license.

### Supabase — Free
- 500 MB database, ~1 GB file storage, limited egress/bandwidth, 50k MAU.
- **Project pauses after ~7 days of inactivity** (must un-pause manually).
- **No automated daily backups / point-in-time recovery (PITR)** — that's Pro only.
- ⏭️ **On Pro:** daily backups + PITR (disaster recovery — currently we have NO backup story), no auto-pause, more storage/egress, larger DB. Needed before real customer data.

### Resend — Free
- ~3,000 emails/month, ~100/day, single verified domain.
- Used for: invites, password/onboarding emails (`lib/email.ts` — no-ops if unset).
- ⏭️ **On paid:** higher volume + multiple domains + better deliverability/analytics as user count grows.

### Upstash (Redis) — Free
- ~10k commands/day (256 MB) — enough for dev, tight for production rate-limiting at scale.
- Used for: **distributed rate limiting** (`lib/rate-limit.ts`, falls back to in-memory if env unset).
- ⏭️ **On paid:** higher command budget so rate limiting stays effective under real traffic.

### Groq — Free/dev
- Rate-limited (requests/min + tokens/day) on the free dev tier.
- Used for: **WhatsApp AI intake** — Whisper transcription + LLaMA extraction (`app/api/webhooks/whatsapp`, `app/api/parse-quote-pdf`).
- ⏭️ **On paid:** higher RPM/TPD; or migrate to a paid LLM provider if volume grows.

### WhatsApp Cloud API (Meta) — free tier
- ~1,000 free service conversations/month; business-initiated messages need approved **templates** and are paid beyond the free allowance.
- Used for: ticket intake from store managers + (planned) technician dispatch.
- ⏭️ **On paid / approved templates:** technician WhatsApp dispatch + arrival tracking (still to wire — needs a Meta-approved template). See [[technician-dispatch]].

### Others
- **Capacitor / Android** — open-source, free (signing keystore is ours).
- **Sentry** — wire env-gated; free tier has an event quota. ⏭️ raise quota on paid as error volume grows.
- **Web Push / VAPID** — free (browser standard).

## Summary — deferred-until-paid checklist
- [ ] Vercel **Pro** — required for commercial/public launch (licensing) + more crons + sub-daily SLA recompute.
- [ ] Supabase **Pro** — backups/PITR (disaster recovery) + no auto-pause, before real customer data.
- [ ] Upstash paid — keep rate limiting effective at scale.
- [ ] Resend paid — email volume.
- [ ] Groq paid (or alt provider) — LLM throughput.
- [ ] WhatsApp templates/paid — technician dispatch + business-initiated messaging.
