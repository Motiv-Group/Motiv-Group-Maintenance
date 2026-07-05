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
