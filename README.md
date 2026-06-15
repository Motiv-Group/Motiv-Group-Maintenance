# Motiv — Maintenance App

A mobile-first maintenance ticketing and quoting platform built with Next.js + Supabase.

---

## Quick Start

### 1. Install Node.js
Download and install from https://nodejs.org (LTS version)

### 2. Install dependencies
Open a terminal in this folder and run:
```bash
npm install
```

### 3. Set up Supabase

1. Go to https://app.supabase.com and create a free account
2. Create a new project (any name, pick a strong database password)
3. Once the project is ready, go to **SQL Editor** (left sidebar)
4. Open the file `supabase/migrations/001_initial_schema.sql` from this folder
5. Copy the entire contents and paste into the SQL Editor, then click **Run**
6. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (click to reveal)

### 4. Configure environment
Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in your Supabase values:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_ADMIN_EMAILS=your@email.com,partner@email.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional — auto-sent store-manager invites (regional managers creating store
accounts). Without these the account is still created and the UI shows manual
share buttons (Copy / WhatsApp / Email):
```
RESEND_API_KEY=re_...                 # email channel (https://resend.com)
EMAIL_FROM=Motiv <noreply@yourdomain> # verified Resend sender
# WhatsApp reuses the existing WhatsApp Cloud API vars:
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```
> WhatsApp note: the Cloud API only delivers free-form text inside the 24-hour
> customer-care window; cold invites need a pre-approved template. Server WA
> send is therefore best-effort — email is the reliable auto-channel, and the
> manual WhatsApp share button always works.

### 5. Set up admin accounts

Admin accounts are created manually in Supabase:
1. Go to **Authentication → Users** in Supabase
2. Click **Add user** → enter the admin email + password
3. Go to **SQL Editor** and run:
```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'your@email.com';
```
Repeat for each admin.

### 6. Run the app
```bash
npm run dev
```

Open http://localhost:3000 in your browser. On mobile, open your computer's local IP address (e.g. http://192.168.1.5:3000) to test the mobile experience.

---

## App Structure

```
app/
  auth/
    login/          → Login page
    signup/         → Client signup (all fields)
  client/
    page.tsx        → Client dashboard
    tickets/        → List of tickets
    tickets/new/    → Submit new ticket (photos, priority, description)
    tickets/[id]/   → Ticket detail + view/accept quotes
    notifications/  → Notification centre
  admin/
    page.tsx        → Admin dashboard (stats + recent tickets)
    tickets/        → All tickets with filters
    tickets/[id]/   → Ticket detail + send quote + update status
    notifications/  → Notification centre
  api/
    tickets/        → POST — create ticket
    quotes/         → POST — send quote
    quotes/[id]/respond/  → PATCH — accept/decline quote
    notifications/  → GET/PATCH — fetch + mark read

components/
  ui/               → Shared: Button, Input, Badge, Navbar
  client/           → QuoteCard (accept/decline)
  admin/            → SendQuoteForm, UpdateStatusForm

lib/
  supabase/         → Browser + server Supabase clients
  types.ts          → TypeScript types
  utils.ts          → Helpers, labels, colours
```

---

## Ticket Flow

```
Client submits ticket
  → Admins receive in-app notification
  → Admin views ticket (client info, photos, priority)
  → Admin sends quote
      → Client receives in-app notification
      → Client accepts or declines quote
          → Admins receive in-app notification
          → Admin updates ticket status as work progresses
```

---

## Deploying to Production (Vercel — free)

1. Push this folder to a GitHub repository
2. Go to https://vercel.com and import the repo
3. Add all `.env.local` variables as Environment Variables in Vercel
4. Deploy — Vercel gives you a public URL
5. Update `NEXT_PUBLIC_APP_URL` to your Vercel URL
6. Go to Supabase → **Authentication → URL Configuration** and add your Vercel URL to **Redirect URLs**

---

## Adding Email Notifications (optional, recommended)

1. Sign up at https://resend.com (free tier)
2. Add `RESEND_API_KEY=re_...` to your environment variables
3. Use Supabase Database Webhooks or Edge Functions to call Resend when a new notification row is inserted

This is a nice-to-have enhancement — the app works fully with in-app notifications without it.

---

## Future Features (MVP → V2)

- [ ] Email notifications via Resend
- [ ] PDF quote generation
- [ ] Client can upload additional photos after ticket creation
- [ ] Admin can assign tickets to specific team members
- [ ] Payment integration (Yoco / PayFast)
- [ ] SLA tracking and due dates
- [ ] Bulk ticket export
