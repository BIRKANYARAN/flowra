# Flowra — Production Deployment Guide

**Version:** 3.0  
**Audience:** Developers and IT administrators deploying Flowra to Vercel production.  
**Estimated time:** 20–45 minutes for initial production deployment.

---

## Table of Contents

1. [Required Environment Variables](#1-required-environment-variables)
2. [Vercel Project Setup](#2-vercel-project-setup)
3. [Vercel Cron Jobs](#3-vercel-cron-jobs)
4. [Custom Domain Setup](#4-custom-domain-setup)
5. [Supabase Auth URL Configuration](#5-supabase-auth-url-configuration)
6. [Production Checklist](#6-production-checklist)
7. [Monitoring](#7-monitoring)
8. [Performance Notes](#8-performance-notes)

---

## 1. Required Environment Variables

The following variables must be configured in Vercel before the application is usable in production. All variables are set per-environment (Production / Preview / Development) in **Vercel → Project → Settings → Environment Variables**.

### Supabase (Required)

| Variable | Description | Where to find it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. Exposed to the browser. | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key. Exposed to the browser. RLS policies enforce access control. | Supabase → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. **Server-side only.** Bypasses RLS. Never expose in browser code. | Supabase → Project Settings → API → service_role key |

### Application URL (Required)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Full public URL of the deployed application. Used in email links, PDF generation, and public proforma share links. | `https://app.yourcompany.com` |
| `NEXT_PUBLIC_SITE_URL` | Alias for `NEXT_PUBLIC_APP_URL`. Used by the health check endpoint. Set to the same value. | `https://app.yourcompany.com` |

### Security (Required in production)

| Variable | Description | How to generate |
|---|---|---|
| `CRON_SECRET` | Secret token that Vercel includes in cron job requests. Flowra validates this token on every cron endpoint. Must be at least 32 characters. | `openssl rand -hex 32` |

### Email — Resend (Optional)

If not set, email features (alert digests, notification emails) are silently disabled. All financial features work normally without email.

| Variable | Description | Notes |
|---|---|---|
| `RESEND_API_KEY` | API key from resend.com. | Get at [resend.com/api-keys](https://resend.com/api-keys) |
| `RESEND_FROM_EMAIL` | Sender email address. | Must be verified in your Resend account. |
| `ADMIN_DIGEST_EMAIL` | Email address to receive the daily financial alert digest. | Any valid email address. |

### AI Features — Anthropic (Optional)

If not set, AI situation summaries fall back to deterministic rule-based text. All financial calculations are unaffected — Anthropic is used only to write narrative summaries.

| Variable | Description | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key from Anthropic. | Get at [console.anthropic.com](https://console.anthropic.com) |

### Logging (Optional)

| Variable | Description | Recommended value |
|---|---|---|
| `LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, or `error`. | `info` for production, `debug` for Preview environments. |

### Development Flags (Never set in production)

| Variable | Description | Risk |
|---|---|---|
| `ENABLE_SEED` | Enables `POST /api/seed` — injects demo data. | Data injection risk. Leave unset. |
| `ENABLE_RESET` | Enables `POST /api/reset` — wipes all company data. | **Destructive.** Leave unset. |

---

## 2. Vercel Project Setup

### Linking the repository

1. Go to [vercel.com](https://vercel.com) → **Add New Project**.
2. Import from GitHub, GitLab, or Bitbucket.
3. Select your Flowra repository.

### Build configuration

Verify these settings in the Vercel project configuration:

| Setting | Value |
|---|---|
| **Framework Preset** | Next.js |
| **Root Directory** | `.` (repo root) |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` (auto-detected) |
| **Install Command** | `npm install` (default) |
| **Node.js Version** | 18.x or 20.x |

### Deployment branches

Vercel deploys automatically when you push:
- **Production** branch (typically `main`) → deploys to your production domain
- All other branches → deploys to a preview URL

Configure the production branch in **Vercel → Project → Settings → Git**.

---

## 3. Vercel Cron Jobs

Flowra uses four cron jobs defined in `vercel.json`. Vercel executes these automatically according to their schedule (UTC timezone). Each request includes the `Authorization: Bearer <CRON_SECRET>` header, which Flowra validates.

| Path | Schedule (UTC) | What it does |
|---|---|---|
| `/api/cron/overdue-update` | `30 0 * * *` (daily at 00:30) | Scans all open sales and marks any that have passed their due date as `overdue`. Updates `overdue_amount` field. |
| `/api/cron/interest-accrual` | `0 1 * * *` (daily at 01:00) | Accrues daily interest on all active partner loans. Updates outstanding balances and logs accrual journal entries. |
| `/api/cron/workflow-expire` | `0 2 * * *` (daily at 02:00) | Expires workflow approval requests that have been pending for more than 48 hours. Sets status to `expired` and notifies the requester. |
| `/api/cron/governance-snapshot` | `0 3 1 * *` (1st of each month at 03:00) | Creates a monthly governance snapshot summarizing partner positions, distributions, and compliance status. |

### How Vercel Cron works

- Cron jobs are only active on the **production** deployment, not on Preview deployments.
- You need Vercel's **Hobby plan** (free) or above to use cron jobs.
- The Hobby plan allows up to 2 cron jobs per project. For all 4 cron jobs, you need the **Pro plan**.
- Check cron job execution history in **Vercel → Project → Cron Jobs**.

### Manually triggering a cron job

For testing or manual execution:

```bash
curl -X GET "https://your-app.vercel.app/api/cron/overdue-update" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

A successful response returns `{"ok":true}` with HTTP 200.

### CRON_SECRET configuration

The `CRON_SECRET` environment variable must be set in Vercel before cron jobs will execute. Generate a secure token:

```bash
openssl rand -hex 32
# Example output: a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

Set this value in **Vercel → Project → Environment Variables** under the key `CRON_SECRET`, for the **Production** environment.

---

## 4. Custom Domain Setup

### Add your domain in Vercel

1. Go to **Vercel → Project → Settings → Domains**.
2. Click **Add**.
3. Enter your domain (e.g., `app.yourcompany.com`).
4. Vercel provides DNS records to add at your domain registrar.

### DNS configuration

| Type | Name | Value |
|---|---|---|
| `CNAME` | `app` (or your subdomain) | `cname.vercel-dns.com` |

Or, for apex domains:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `76.76.19.19` (Vercel's IP) |

DNS propagation typically takes 5–30 minutes.

### SSL

Vercel automatically provisions an SSL certificate via Let's Encrypt once DNS resolves. No manual SSL configuration is needed.

### Update environment variables

After your custom domain is active:

1. Update `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` in Vercel to use the custom domain.
2. Trigger a new deployment for the change to take effect.
3. Update Supabase Auth redirect URLs (see next section).

---

## 5. Supabase Auth URL Configuration

Supabase only allows auth redirects to whitelisted URLs. You must update this list whenever your application URL changes.

### Where to configure

**Supabase Dashboard → Authentication → URL Configuration**

### Required URL entries

Add all of the following under **Redirect URLs**:

```
http://localhost:3000/auth/callback
http://localhost:3000/**
https://your-app.vercel.app/auth/callback
https://your-app.vercel.app/**
https://app.yourcompany.com/auth/callback
https://app.yourcompany.com/**
```

Replace `your-app.vercel.app` and `app.yourcompany.com` with your actual URLs.

### Site URL

Set **Site URL** to your primary production URL:

```
https://app.yourcompany.com
```

The Site URL is used for the default email confirmation link destination.

---

## 6. Production Checklist

Complete this checklist before going live with any production deployment.

### Security

- [ ] `ENABLE_SEED` is not set (or explicitly `false`) in the Production environment
- [ ] `ENABLE_RESET` is not set (or explicitly `false`) in the Production environment
- [ ] `CRON_SECRET` is set to a random token of at least 32 characters
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set — **verify it is NOT marked as "Exposed to client"** in Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NOT present in any browser-accessible code or response

### Auth

- [ ] All 4 Supabase Auth redirect URLs are configured (localhost + production)
- [ ] Supabase Auth **Site URL** is set to your production domain
- [ ] Email confirmation is configured per your policy (disabled for speed, or enabled with Resend)

### Functionality

- [ ] `GET /api/health` returns `{"status":"ok"}` on the production deployment
- [ ] Login and dashboard load successfully
- [ ] At least one cron job was manually triggered and returned `{"ok":true}`
- [ ] `NEXT_PUBLIC_APP_URL` points to the production domain (not localhost or a preview URL)

### Email (if using Resend)

- [ ] `RESEND_API_KEY` is set
- [ ] `RESEND_FROM_EMAIL` is a verified sender address in Resend
- [ ] Sender domain has SPF and DKIM records configured (Resend provides instructions)

### Database

- [ ] `FLOWRA_PRODUCTION_INSTALL.sql` was run successfully on a fresh Supabase project
- [ ] `GET /api/health` confirms database connectivity
- [ ] RLS is enabled on all tables (Supabase enables this by default)

---

## 7. Monitoring

### Health endpoint

```
GET /api/health
```

Returns a JSON object with database and application status:

```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-05-26T12:00:00.000Z"
}
```

An unhealthy response returns HTTP 500 with a descriptive error. Monitor this endpoint with an uptime service (e.g., Vercel's own status, UptimeRobot, or BetterStack).

### Vercel logs

Access real-time and historical logs in **Vercel → Project → Deployments → select deployment → Runtime Logs**. Filter by log level (`error`, `warn`, `info`) or by function path.

Key patterns to monitor:
- `[CRON]` — cron job execution results
- `[GL]` — journal entry writes (parallel and gl_primary modes)
- `[ALERT]` — alert rule evaluations
- `ERROR` — any unexpected errors

### Cron job monitoring

Check cron execution history in **Vercel → Project → Cron Jobs**. Each execution shows:
- Start time (UTC)
- Duration
- HTTP status code
- Response body excerpt

A failed cron job (non-200 status) warrants investigation. The most common cause is an expired or incorrect `CRON_SECRET`.

### Supabase dashboard

Monitor database performance in **Supabase → Database → Reports**:
- Query performance (slow query log)
- Connection pool usage
- Disk usage

---

## 8. Performance Notes

### Server-side rendering

All Flowra pages are server-rendered on demand (Next.js SSR, not static generation). Each page load triggers fresh data fetches from Supabase. This means:

- Pages are always up-to-date — no stale cache issues
- Page load time depends on Supabase query performance
- Supabase region selection significantly impacts latency (choose the region closest to your users)

### Recommended Supabase region for Turkish users

For companies operating in Turkey, **`eu-central-1` (Frankfurt)** is the nearest available Supabase region. Typical query latency from Istanbul: 40–80ms.

### Large data

- The CSV export endpoint (`/api/export`) has a default limit of 10,000 rows per request.
- PDF generation (CFO Pack, income statement, balance sheet) runs server-side and may take 2–5 seconds for companies with large data sets.
- The Finans hub's Bilanço and G/Z Tablosu tabs aggregate all transactions on each load — for companies with 5,000+ transactions, consider the Supabase Pro plan for dedicated compute.

### Caching

Flowra does not use Edge caching for financial data (accuracy is prioritized over speed). Server Components are used where possible for reduced JavaScript bundle size on the client. No explicit `cache()` or ISR configuration is applied to financial data endpoints.
