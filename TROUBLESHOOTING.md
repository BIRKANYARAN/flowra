# Flowra — Troubleshooting Guide

**Version:** 3.0  
**Audience:** Developers, IT administrators, and advanced users diagnosing Flowra issues.

Use the table of contents below to jump to the relevant section. Each section describes the symptom, the most likely cause, and the resolution steps.

---

## Table of Contents

1. [Installation Issues](#1-installation-issues)
2. [Financial Data Issues](#2-financial-data-issues)
3. [GL Mode Issues](#3-gl-mode-issues)
4. [Email and Notification Issues](#4-email-and-notification-issues)
5. [Performance Issues](#5-performance-issues)
6. [Error Messages Reference](#6-error-messages-reference)

---

## 1. Installation Issues

### "relation does not exist" — table not found after install

**Symptom:** The application loads but shows an error like `relation "journal_entries" does not exist` or `relation "companies" does not exist`.

**Cause:** The `FLOWRA_PRODUCTION_INSTALL.sql` script did not complete fully. This can happen if the SQL Editor timed out mid-run, the script was only partially pasted, or the Supabase project had pre-existing schema conflicts.

**Resolution:**

1. Open the Supabase SQL Editor.
2. Run this diagnostic query to see which tables exist:
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   ```
3. Compare the count to the expected ~60 tables. If fewer than 50 exist, the install is incomplete.
4. Paste and run the full content of `supabase/FLOWRA_PRODUCTION_UPGRADE.sql`. This script adds all missing tables and columns without affecting existing data.
5. If issues persist, run `supabase/db_audit.sql` to get a detailed report of missing objects.
6. As a last resort on a fresh database, create a new Supabase project and run `FLOWRA_PRODUCTION_INSTALL.sql` again on the clean database.

---

### Auth callback error after install

**Symptom:** After logging in, the browser is redirected to an error page with a message like "The redirect_uri is not allowed" or the URL shows `/auth/callback?error=access_denied`.

**Cause:** Supabase Auth does not allow redirects to URLs that are not explicitly whitelisted in your project configuration.

**Resolution:**

1. Go to **Supabase Dashboard → Authentication → URL Configuration**.
2. Add the following entries under **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   http://localhost:3000/**
   https://your-app.vercel.app/auth/callback
   https://your-app.vercel.app/**
   ```
   Replace `your-app.vercel.app` with your actual deployment URL.
3. Set **Site URL** to your primary application URL.
4. Save and try logging in again — no redeployment is needed.

---

### Blank page after login / nothing loads

**Symptom:** The application shows a blank white page after a successful login, or shows a spinner that never resolves.

**Cause 1:** `NEXT_PUBLIC_SUPABASE_URL` is missing or incorrect.

**Cause 2:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing or incorrect.

**Resolution:**

1. Open your browser's developer console (F12 → Console tab).
2. Look for errors mentioning `supabase`, `NEXT_PUBLIC_SUPABASE_URL`, or fetch failures.
3. Verify `.env.local` (local) or Vercel environment variables (production) contain the correct values.
4. Confirm the values match what is shown in **Supabase → Project Settings → API**.
5. After correcting environment variables locally, restart the dev server (`npm run dev`). On Vercel, trigger a new deployment.

**Cause 3:** The user exists in Supabase Auth but is not in the `company_members` table.

**Resolution:** See the "company not found" error in Section 6.

---

### "Cannot find module" or build errors after git pull

**Symptom:** Running `npm run dev` or `npm run build` fails with module not found errors.

**Resolution:**

```bash
rm -rf node_modules .next
npm install
npm run dev
```

---

## 2. Financial Data Issues

### Trial balance shows an imbalance (debit ≠ credit)

**Symptom:** In `/dashboard/cfo` → Trial Balance, the **Difference** row shows a non-zero value (e.g., `₺1,234.56`). A properly functioning double-entry system always has a difference of `0.00`.

**Cause:** This typically occurs when:
- Transactions were created before GL mode was enabled and journal entries were not backfilled
- A custom import or data migration inserted records without corresponding journal entries
- A partially-failed transaction left orphaned journal entry lines

**Resolution:**

**Step 1:** Run the database audit to identify the problem:
```sql
-- Paste content of: supabase/db_audit.sql
-- This identifies journal entries with missing counterparts
-- and transactions without any journal entries.
```

**Step 2:** If the audit identifies unmatched transactions (transactions without journal entries), run the backfill:
```sql
-- Paste content of: supabase/flowra_phase9c_backfill.sql
-- This creates journal entries for all transactions that lack them.
```

**Step 3:** After backfill, reload the Trial Balance in `/dashboard/cfo`. The Difference row should now show `0.00`.

**Step 4:** If the imbalance persists after backfill, you have a data integrity issue. Contact support with the output of `db_audit.sql`.

---

### Sales totals in Finance do not match GL totals

**Symptom:** The revenue shown in `/dashboard/finance` → G/Z Tablosu differs from what the Trial Balance shows for revenue accounts (6xx accounts).

**Cause:** The operational table totals (direct sum of `sales` table) and the GL totals (sum of journal entries) have diverged. This is expected during early `shadow` mode — the GL is not the source of truth in shadow mode. In `parallel` or `gl_primary` mode, a divergence indicates a data problem.

**Resolution:**

Run the GL shadow audit endpoint:

```bash
curl "https://your-app.vercel.app/api/admin/gl-shadow-audit" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
```

This returns a breakdown of discrepancies by category (sales, expenses, collections). Review the output to identify which records are missing journal entries, then run the backfill script as described above.

If your company is in `shadow` mode, this divergence is normal — the GL has never been the source of truth. Advance to `parallel` mode (see Section 3) to resolve the underlying issue.

---

### Period close is blocked — checklist items not completing

**Symptom:** In `/dashboard/cfo` → Period Close, one or more checklist items are not marking as complete, and you cannot close the period.

The 8-step period close checklist and how to complete each item:

| Step | Name | How to complete |
|---|---|---|
| 1 | **Reconcile cash accounts** | Ensure cash account (100) balance matches your actual bank balance. Create a reconciliation snapshot via `/dashboard/admin` → Reconciliation. |
| 2 | **Verify receivables aging** | Review outstanding receivables in `/dashboard/commercial` → Tahsilatlar. All receivables should be either collected or marked appropriately. |
| 3 | **Post accruals** | Create any necessary accrual journal entries via `/dashboard/cfo` → Journal Entries. |
| 4 | **Reconcile GL to sub-ledgers** | The Trial Balance difference must be `0.00`. If not, run the backfill (see above). |
| 5 | **Review expense approvals** | All pending expense approval workflows must be resolved (approved or rejected). Check `/dashboard/admin` → Approvals. |
| 6 | **KDV reconciliation** | Verify that KDV collected (360 account) matches sum of KDV amounts on sales. The Finance → Vergi tab shows this breakdown. |
| 7 | **Partner position review** | Confirm partner loan positions in `/dashboard/partners` → Pozisyon are current and interest is accrued. |
| 8 | **CFO sign-off** | An admin user must click the "Close Period" button to finalize. |

If a step is showing as incomplete but you believe it is done, check the specific sub-condition causing the block by hovering over the step in the UI for more detail.

---

## 3. GL Mode Issues

### How to check your current GL mode

```sql
SELECT id, name, gl_mode FROM companies;
```

Or in the application: navigate to `/dashboard/admin` → Company Settings. The GL mode is displayed in the **Accounting** section.

| Value | Meaning |
|---|---|
| `shadow` | Default mode. Journal entries are not written. Financial statements read from operational tables. |
| `parallel` | Journal entries are written for all new transactions. Financial statements still read from operational tables. This mode validates journal entry accuracy. |
| `gl_primary` | Journal entries are the source of truth. Financial statements read from the ledger. Full double-entry accounting active. |

---

### How to advance from shadow to parallel mode

1. Run the backfill script to create journal entries for all historical transactions:
   ```sql
   -- Paste content of: supabase/flowra_phase9c_backfill.sql
   ```
2. Verify the trial balance is balanced (Difference = 0.00) at `/dashboard/cfo`.
3. Update the GL mode:
   ```sql
   UPDATE companies SET gl_mode = 'parallel' WHERE id = 'your-company-uuid';
   ```
4. Create a test transaction and verify a journal entry was written:
   ```sql
   SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 5;
   ```

---

### How to advance from parallel to gl_primary mode

Only do this after running in `parallel` mode for at least one full accounting period (30 days) and confirming the trial balance remains at `0.00`.

1. Run the cutover script:
   ```sql
   -- Paste content of: supabase/flowra_phase9c_gl_primary_cutover.sql
   ```
2. Verify:
   ```sql
   SELECT gl_mode FROM companies WHERE id = 'your-company-uuid';
   -- Expected: gl_primary
   ```
3. Check that `/dashboard/finance` still shows consistent figures.

---

### How to roll back from gl_primary to parallel

If figures appear incorrect after advancing to `gl_primary`:

```sql
-- Paste content of: supabase/flowra_phase9c_rollback.sql
```

This reverts the GL mode to `parallel` and restores financial statements to read from operational tables. All journal entries are preserved.

---

### What happens when gl_mode = shadow?

In shadow mode:
- **Journal entries are NOT written** when transactions are created
- **Financial statements** (income statement, balance sheet, cash flow) read directly from the `sales`, `expenses`, and `collections` tables
- **The Trial Balance in /dashboard/cfo** shows data derived from operational tables via a mapping layer — it is not a true GL trial balance
- **The double-entry accounting constraint is NOT enforced**
- **KDV and Kurumlar Vergisi calculations** still function correctly — they are based on the operational tables

Shadow mode is appropriate for initial deployment and testing. Advance to `parallel` mode before using Flowra for official financial reporting.

---

## 4. Email and Notification Issues

### Emails are not sending

**Symptom:** Users are not receiving alert digest emails, expense approval notifications, or other system emails.

**Diagnosis:** Check whether `RESEND_API_KEY` is configured:

```bash
# If running locally
grep RESEND_API_KEY .env.local

# On Vercel: check Project → Settings → Environment Variables
```

If `RESEND_API_KEY` is not set, all email features are silently disabled. The application continues to work normally — emails are simply not sent.

**Resolution:**

1. Create a Resend account at [resend.com](https://resend.com).
2. Generate an API key in **Resend → API Keys**.
3. Add a domain in **Resend → Domains** and follow the DNS verification steps.
4. Set `RESEND_API_KEY` to your key in Vercel environment variables.
5. Set `RESEND_FROM_EMAIL` to a verified sender address on your domain.
6. Redeploy the application.

**Resend domain verification:**

Resend requires SPF and DKIM DNS records on your sender domain. These are configured at your domain registrar. Resend's dashboard shows the exact records to add. Verification typically takes 5–30 minutes after DNS changes.

**Testing email:**

Manually trigger the daily alert digest cron job to test email delivery:

```bash
curl "https://your-app.vercel.app/api/cron/overdue-update" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Check the Vercel logs for `[EMAIL]` entries to confirm sends.

---

### Cron jobs are not running

**Symptom:** Daily operations (overdue updates, interest accrual) are not happening automatically.

**Cause 1:** `CRON_SECRET` is not set or does not match between Vercel and the application.

**Resolution:**
1. Confirm `CRON_SECRET` is set in **Vercel → Project → Settings → Environment Variables** under Production.
2. Trigger a cron manually:
   ```bash
   curl "https://your-app.vercel.app/api/cron/overdue-update" \
     -H "Authorization: Bearer <your-cron-secret>"
   ```
3. A 401 response means the secret is incorrect. A 200 response with `{"ok":true}` means it is working.

**Cause 2:** Vercel Hobby plan only supports 2 cron jobs. If you have more than 2 cron jobs configured in `vercel.json`, only the first 2 will execute on the Hobby plan.

**Resolution:** Upgrade to Vercel Pro or prioritize the most critical cron jobs.

**Cause 3:** Cron jobs only run on the production deployment, not Preview deployments.

---

## 5. Performance Issues

### Dashboard is loading slowly

**Symptom:** The Komuta dashboard or Finance tabs take more than 3 seconds to load.

**Cause 1:** Supabase region is far from your users. If your database is in `us-east-1` and your users are in Turkey, each query adds ~150ms round-trip latency.

**Resolution:** For Turkish users, migrate your Supabase project to `eu-central-1` (Frankfurt). Note that Supabase does not currently support in-place region migration — you would need to create a new project, export data, and run the installer.

**Cause 2:** Complex aggregation queries on large datasets. The Finance tabs aggregate all transactions on each load.

**Resolution:**
- Upgrade Supabase to Pro for dedicated compute
- Enable the database connection pool in Supabase settings
- Consider archiving old transactions (contact support for archiving scripts)

**Cause 3:** Vercel cold starts. If the application has not received traffic for several minutes, the first request may take 1–2 seconds extra.

**Resolution:** Cold starts are inherent to serverless deployment. Use Vercel's **Fluid Compute** feature (available on Pro) to reduce cold start frequency.

---

### Large data exports are slow or fail

**Symptom:** The CSV export takes too long or returns an error.

**Note:** The CSV export endpoint has a default limit of 10,000 rows per request. Exports beyond this size will be truncated.

**Resolution for large exports:**
1. Apply date range filters before exporting to reduce the row count.
2. For full data exports, contact your Supabase database directly via `pg_dump`.
3. The export endpoint is at `GET /api/export` — it accepts `startDate` and `endDate` query parameters.

---

## 6. Error Messages Reference

### `insufficient_scope`

**Full message:** `{"error":"insufficient_scope"}`

**Cause:** The `SUPABASE_SERVICE_ROLE_KEY` environment variable is missing or not set correctly. This key is required for admin operations, cron jobs, and certain reporting endpoints.

**Resolution:**
1. Go to **Supabase → Project Settings → API**.
2. Copy the `service_role` key (the longer one, marked "secret").
3. Set `SUPABASE_SERVICE_ROLE_KEY` in your `.env.local` (local) or Vercel environment variables (production).
4. This variable must NOT be prefixed with `NEXT_PUBLIC_` — it should never reach the browser.

---

### `company not found`

**Full message:** `{"error":"company not found"}` or user is stuck on a "no company" page after login.

**Cause:** The authenticated user exists in Supabase Auth but has no entry in the `company_members` table. This happens if:
- The user was created directly in Supabase Auth without going through the onboarding flow
- The user's company was deleted
- A multi-company setup has a mis-configuration

**Resolution:**

1. Find the user's UUID from Supabase Auth:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'user@example.com';
   ```

2. Find the company UUID:
   ```sql
   SELECT id, name FROM companies LIMIT 10;
   ```

3. Add the user to the company:
   ```sql
   INSERT INTO company_members (company_id, user_id, role, created_at)
   VALUES ('company-uuid', 'user-uuid', 'admin', NOW())
   ON CONFLICT DO NOTHING;
   ```

4. Ask the user to log out and back in.

---

### `Period is locked`

**Full message:** `{"error":"Period is locked"}` when trying to create or modify transactions.

**Cause:** An accounting period has been formally closed and locked by an admin. Locked periods prevent any modifications to maintain audit integrity. This is intentional behavior — once closed, a period's records should not change.

**When this appears:**
- Trying to record a sale or expense in a past period that has been closed
- Trying to modify a transaction dated in a closed period

**Resolution:**

Only an admin user can unlock a period. Periods should only be unlocked in exceptional circumstances (e.g., correction of a material error).

To unlock a period:
1. Log in as an admin user.
2. Navigate to `/dashboard/cfo` → Period Close.
3. Find the locked period.
4. Click **Unlock Period** (requires admin role).
5. Before unlocking, consult with your CFO — unlocking a closed period affects the audit trail.

**Note:** If you are locked out because no admin user is available, a period can be unlocked directly in the database:

```sql
UPDATE accounting_periods
SET status = 'open', locked_at = NULL
WHERE period_name = '2026-04';  -- replace with the period identifier
```

Use this only as a last resort.

---

### `Distributable profit negative`

**Full message:** `{"error":"Distributable profit negative — dividend declaration blocked by TTK 509"}`

**Cause:** Flowra enforces **TTK 509** (Turkish Commercial Code Article 509), which prohibits dividend declarations when distributable profit is negative or zero. The distributable profit calculation is:

```
Net Profit
- Kurumlar Vergisi (25%)
- Legal Reserve (5% of profit, if total legal reserve < 20% of paid-in capital per TTK 519)
= Distributable Profit
```

If any of these deductions bring distributable profit below zero, dividends cannot be declared.

**Resolution:**
- This is not an error — it is correct legal compliance. Do not attempt to bypass this check.
- Wait until the company generates sufficient net profit.
- Review the financial model in `/dashboard/finance` → Tahmin to project when distributable profit will turn positive.
- If you believe the calculation is incorrect, verify the net profit figure in `/dashboard/finance` → G/Z Tablosu and the legal reserve balance in `/dashboard/partners` → Pozisyon.

---

### `User not authorized` on admin endpoints

**Full message:** HTTP 403 with `{"error":"User not authorized"}`

**Cause:** The logged-in user does not have the `admin` role for this company.

**Resolution:**
1. Log in with an admin-role account.
2. Or, elevate the user's role in `/dashboard/admin` → Users.
3. Or, update directly in the database:
   ```sql
   UPDATE company_members
   SET role = 'admin'
   WHERE user_id = 'user-uuid' AND company_id = 'company-uuid';
   ```

---

### `Network error` / `Failed to fetch`

**Symptom:** Generic network error in the UI.

**Common causes:**
1. The Supabase project is paused (free tier projects pause after 7 days of inactivity).
2. The Vercel deployment is down.
3. `NEXT_PUBLIC_SUPABASE_URL` points to the wrong project.

**Resolution:**
1. Check your Supabase project status at [supabase.com/dashboard](https://supabase.com/dashboard). If paused, click **Restore**.
2. Check your Vercel deployment status at [vercel.com/dashboard](https://vercel.com/dashboard).
3. Check `GET /api/health` — if it returns an error, check Vercel function logs for details.
