# Flowra — Administrator Guide

**Version:** 3.0  
**Audience:** Company administrators, CFOs, and business owners managing Flowra. This guide assumes no technical background. No database access or programming knowledge is required.

---

## Table of Contents

1. [Company Setup](#1-company-setup)
2. [User Management](#2-user-management)
3. [Role Permissions Matrix](#3-role-permissions-matrix)
4. [Accounting Period Management](#4-accounting-period-management)
5. [Period Close Workflow](#5-period-close-workflow)
6. [Expense Approval Workflows](#6-expense-approval-workflows)
7. [GL Mode Management](#7-gl-mode-management)
8. [Backups](#8-backups)
9. [Alert Rules Configuration](#9-alert-rules-configuration)
10. [Governance Workflows](#10-governance-workflows)
11. [Audit Logs](#11-audit-logs)
12. [Reconciliation](#12-reconciliation)
13. [System Health](#13-system-health)
14. [Multi-Company Setup](#14-multi-company-setup)

---

## 1. Company Setup

### Where to find it

Navigate to: **Yönetim (Admin) → Company Settings** or go directly to `/dashboard/admin`.

### What you can configure

**Basic Information**

| Field | Description | Example |
|---|---|---|
| Company name | Official registered company name. Appears on all PDF documents and reports. | Flowra Yazılım A.Ş. |
| Tax ID (VKN) | 10-digit Turkish tax identification number. Required for correct KDV invoicing. | 1234567890 |
| Address | Full registered address. Appears on PDFs and proforma invoices. | Maslak Mah. AOS 55. Sokak No:2 İstanbul |
| Industry | Business sector. Used for optional benchmark comparisons. | Teknoloji / SaaS |
| Fiscal year start | The month your fiscal year begins. Default is January. | Ocak (January) |

**Brand Settings**

| Field | Description |
|---|---|
| Logo | Upload your company logo (PNG or SVG, max 2MB). Appears on PDF exports and the dashboard header. |
| Primary color | Hex color code for PDF document headers and branded reports (e.g., `#1a2e4a`). |

### Saving changes

Click **Save** after making any changes. Changes to company name, address, and tax ID take effect immediately on all new PDF exports. Existing PDFs that were already generated are not affected.

---

## 2. User Management

### Where to find it

Navigate to: **Yönetim → Users** or go directly to `/dashboard/admin`.

### Inviting a new user

1. Click **Invite User**.
2. Enter the person's email address.
3. Select their role: `admin`, `manager`, or `viewer` (see Section 3 for role descriptions).
4. Click **Send Invitation**.

The invited person receives an email with a link to set their password and access Flowra. The link is valid for 24 hours. If it expires, you can re-send the invitation from the Users page.

**Note:** If email is not configured, the invitation link will not be sent automatically. In this case, create the user directly through the Supabase dashboard and inform them manually.

### Changing a user's role

1. Find the user in the Users list.
2. Click the role badge next to their name.
3. Select the new role from the dropdown.
4. The change takes effect immediately — the user's next page load will reflect the new permissions.

### Removing a user

1. Find the user in the Users list.
2. Click the **...** (options) menu next to their name.
3. Select **Remove from company**.
4. Confirm the removal.

The user loses access immediately. Their historical data (transactions they created, approvals they gave) is preserved in the audit log. Removing a user does not delete their records.

---

## 3. Role Permissions Matrix

Flowra has three roles. Assign the most restrictive role that meets each person's needs.

| Feature | Admin | Manager | Viewer |
|---|---|---|---|
| **Dashboard (Komuta)** | | | |
| View CEO cockpit, KPIs, alerts | Yes | Yes | Yes |
| View AI situation summaries | Yes | Yes | Yes |
| **Finance (Finans)** | | | |
| View income statement, balance sheet | Yes | Yes | Yes |
| View tax summary (KDV, Kurumlar Vergisi) | Yes | Yes | Yes |
| View cash flow, forecasts | Yes | Yes | Yes |
| Export PDF reports | Yes | Yes | No |
| **Commercial (Ticari)** | | | |
| View sales pipeline, customers | Yes | Yes | Yes |
| Create/edit sales | Yes | Yes | No |
| Create/edit proforma invoices | Yes | Yes | No |
| Record collections | Yes | Yes | No |
| **Operations (Operasyon)** | | | |
| View expenses | Yes | Yes | Yes |
| Create/submit expenses | Yes | Yes | No |
| Edit product catalog | Yes | Yes | No |
| Manage stock | Yes | Yes | No |
| **Partners (Ortaklar)** | | | |
| View partner positions | Yes | Yes | Yes |
| View partner ledger and tranches | Yes | Yes | Yes |
| Record partner transactions | Yes | No | No |
| Declare dividends | Yes | No | No |
| **Planning (Planlama)** | | | |
| View scenarios, projections | Yes | Yes | Yes |
| Create/edit scenarios | Yes | Yes | No |
| **CFO Center** | | | |
| View trial balance | Yes | Yes | No |
| Create journal entries | Yes | No | No |
| Close accounting periods | Yes | No | No |
| **Admin (Yönetim)** | | | |
| Manage users and roles | Yes | No | No |
| Configure alert rules | Yes | No | No |
| View audit logs | Yes | No | No |
| Manage workflows and approvals | Yes | No | No |
| Configure GL mode | Yes | No | No |
| Create reconciliation snapshots | Yes | No | No |
| Manage company settings | Yes | No | No |

**Summary of roles:**

- **Admin:** Full access to everything. Assign to CFOs, company owners, and trusted senior managers.
- **Manager:** Can create and edit transactions but cannot access financial administration, journal entries, or user management. Suitable for operations managers and team leads.
- **Viewer:** Read-only access across most of the platform. Cannot create, edit, or delete anything. Suitable for board members, auditors, or investors who need visibility without the ability to make changes.

---

## 4. Accounting Period Management

### What are accounting periods?

An accounting period is a defined time window (typically one month) for which financial records are organized and reported. At the end of each period, you "close" it to prevent further modifications, ensuring that your reports remain accurate and auditable.

### How periods work in Flowra

- Flowra automatically manages monthly periods.
- The current open period accepts all new transactions.
- Past periods can be in one of three states:

| State | Description |
|---|---|
| **Open** | Transactions can be created, edited, or deleted in this period. |
| **Closed** | The period has been reviewed and formally closed. Modifications are blocked to protect data integrity. |
| **Locked** | Closed and locked — cannot be reopened without admin intervention. Used for periods that have been externally reported (e.g., submitted to the tax authority). |

### When to close a period

Close a period when:
- All transactions for the month have been entered
- All expense approvals are resolved
- KDV reconciliation is complete
- The trial balance is balanced (0.00 difference)

Best practice is to close each month within 5–10 business days of the month end.

### How to close a period

Navigate to `/dashboard/cfo` → Period Close. Follow the 8-step checklist described in the next section.

### How to view period status

Go to `/dashboard/cfo`. The current period and its status are shown at the top. Past periods are listed with their status.

---

## 5. Period Close Workflow

The period close workflow is an 8-step checklist that guides you through verifying your books before closing a month. Each step must be completed in order.

### Step 1: Reconcile Cash Accounts

**What this means:** Your cash account (account 100 in the chart of accounts) must match your actual bank balance.

**How to complete:**
1. Get your actual bank balance for the last day of the period from your bank statement.
2. Go to `/dashboard/finance` → Nakit Akışı. Find the closing cash balance.
3. If they match, create a reconciliation snapshot (see Section 12) as documentation.
4. If they don't match, find the discrepancy: look for unrecorded transactions, double-entries, or timing differences.

### Step 2: Verify Receivables Aging

**What this means:** Review all outstanding (uncollected) invoices and confirm their status is accurately recorded.

**How to complete:**
1. Go to `/dashboard/commercial` → Tahsilatlar.
2. Review all open invoices. For each one, confirm it is either:
   - Being collected (partial payments recorded)
   - Overdue and being followed up
   - Written off (if applicable)
3. Record any collections received in the period that have not yet been entered.

### Step 3: Post Accruals

**What this means:** Record any expenses or income that belong to this period but have not yet been formally invoiced.

**Examples:** Rent for December that will be invoiced in January, interest accrued but not yet paid, prepaid expenses to amortize.

**How to complete:**
1. Go to `/dashboard/cfo` → Journal Entries.
2. Click **New Journal Entry**.
3. Enter the accrual with the appropriate date and accounts.

If you have no accruals, you can skip this step.

### Step 4: Reconcile GL to Sub-Ledgers

**What this means:** Verify that the General Ledger (journal entries) and the operational records (sales, expenses, collections) agree.

**How to complete:**
1. Go to `/dashboard/cfo` → Trial Balance.
2. Verify that the **Difference** row shows `0.00 TL`.
3. If it shows a non-zero value, contact your technical administrator to run the journal entry backfill.

### Step 5: Review Expense Approvals

**What this means:** All expense approval requests must be resolved (approved or rejected) before the period can be closed.

**How to complete:**
1. Go to `/dashboard/admin` → Approvals.
2. Review any pending approval requests.
3. For each pending item, approve or reject it.
4. Expired approvals (older than 48 hours) are automatically expired by the system — review and re-submit if necessary.

### Step 6: KDV Reconciliation

**What this means:** Verify that the KDV (VAT) you have collected from customers matches what is recorded in your KDV accounts.

**How to complete:**
1. Go to `/dashboard/finance` → Vergi.
2. Review the KDV Collected and KDV Paid sections.
3. Confirm the net KDV payable figure matches your expectation based on the month's transactions.
4. If you see discrepancies, check whether any sales were recorded with incorrect KDV rates.

### Step 7: Partner Position Review

**What this means:** Confirm that partner loan balances, interest accruals, and capital contributions are up to date.

**How to complete:**
1. Go to `/dashboard/partners` → Pozisyon.
2. Review each partner's current position.
3. Confirm that interest has been accrued for the period (this should happen automatically via the nightly cron job).
4. Record any new partner contributions or withdrawals from the period.

### Step 8: CFO Sign-Off

**What this means:** An admin user formally closes the period.

**How to complete:**
1. Ensure all previous 7 steps are marked as complete (green checkmarks).
2. Click **Close Period**.
3. Confirm the action.

Once closed, the period status changes to `Closed`. No further modifications to transactions in this period are possible. To unlock a closed period, see the Troubleshooting guide.

---

## 6. Expense Approval Workflows

### What are expense approval workflows?

When an employee submits an expense that exceeds a defined threshold, it is held for approval before being posted to the books. This ensures that large expenses are reviewed before they affect the company's financial records.

### Configuring approval thresholds

1. Go to `/dashboard/admin` → Workflows.
2. Under **Expense Approval Thresholds**, set the TL amount above which expenses require approval.
3. You can set different thresholds by expense category (e.g., travel, software, equipment).

Example:
- Expenses under ₺5,000 → auto-approved, posted immediately
- Expenses ₺5,000–₺50,000 → require manager approval
- Expenses over ₺50,000 → require admin approval

### How approval requests work

When someone submits an expense above the threshold:
1. The expense is created with status `pending_approval`.
2. The assigned approver receives an email notification (if email is configured).
3. The expense does not appear in financial reports until approved.

### Approving or rejecting an expense

1. Navigate to `/dashboard/admin` → Approvals.
2. Find the pending expense request.
3. Review the details: amount, category, description, submitter, date.
4. Click **Approve** or **Reject**.
5. Add a comment if rejecting (required for rejections).

### What happens when an expense expires

Approval requests that remain pending for more than 48 hours are automatically expired by the nightly workflow-expire cron job. An expired approval:
- Is not automatically rejected — the expense must be re-submitted
- Notifies the original submitter that re-submission is needed
- Is recorded in the audit log

### Bypassing approval (admin only)

Admin users can approve their own expenses or bypass the approval requirement by posting directly via `/dashboard/cfo` → Journal Entries. This is recorded in the audit log.

---

## 7. GL Mode Management

### What is GL mode?

GL mode controls how Flowra manages your accounting records. There are three levels, from simple to full double-entry accounting:

**Shadow mode (default)**

Think of this as a "soft start." Flowra tracks all your sales and expenses, calculates your financial reports, and shows you KPIs — but it does not maintain a formal accounting ledger. This mode is appropriate for companies that are just getting started or that do not require formal double-entry bookkeeping.

**Parallel mode**

In parallel mode, Flowra writes formal journal entries for every transaction in the background, while still calculating your reports the same way as shadow mode. This is a validation phase — you can see whether the journal entries are being written correctly before committing to them as your official record.

**GL Primary mode**

In GL primary mode, the journal entries (the formal accounting ledger) become the official source of truth for all financial reports. This is full double-entry accounting per MSUGT standards. The trial balance must always equal zero. This mode is required for companies that need auditable financials or are preparing for formal reporting.

### When to advance to GL primary

Consider advancing to GL primary when:
- Your company is growing and requires auditable financial statements
- You are preparing for an external audit
- You are applying for bank financing and need MSUGT-compliant statements
- Your CFO or accountant requires a formal general ledger

### How to check your current mode

Go to `/dashboard/admin` → Company Settings. The current GL mode is shown in the Accounting section.

### How to advance modes

Advancing modes requires technical access (database or developer). The process is described in the `MASTER_UPGRADE.md` technical guide. As an administrator, you should:

1. Decide you are ready to advance.
2. Contact your IT administrator or developer with the request.
3. They will run the appropriate scripts and notify you when the change is complete.
4. After advancement, verify that financial figures in `/dashboard/finance` look the same as before.

### Reverting to a previous mode

If something looks wrong after advancing to GL primary, it is safe to revert. Contact your IT administrator. Reverting preserves all data — no financial records are lost.

---

## 8. Backups

### What the backup feature does

Flowra's built-in backup feature creates a snapshot of your company's financial data at a specific point in time. This includes:
- All sales, expenses, collections, and partner transactions
- Journal entries (if in parallel or GL primary mode)
- Company settings and chart of accounts
- Period close records and audit logs

Backups do NOT include user credentials (managed by Supabase Auth) or other companies' data (your data is always isolated).

### Creating a backup

1. Navigate to `/dashboard/admin` → Settings → Backups.
2. Click **Create Backup**.
3. The backup runs in the background. A notification confirms when it is complete.
4. Download the backup file from the backups list.

Backup files are JSON format, containing all of your company's records. Store them securely — they contain your full financial data.

### Automated backups

Supabase automatically backs up your database daily (retention varies by plan: 7 days on free, 30 days on Pro). These database-level backups are managed by Supabase and are separate from the in-app backup feature.

### Restore limitations

The in-app backup creates a data export file for your records. Restoring from this file is a technical operation that requires developer assistance. The file cannot be re-imported through the user interface.

For disaster recovery, the recommended approach is to use Supabase's point-in-time recovery feature (available on Pro plan), which can restore the entire database to any point within the retention window.

---

## 9. Alert Rules Configuration

### What are alert rules?

Alert rules monitor your financial KPIs and notify you when something requires attention. The system checks these rules daily (via the nightly cron job) and displays active alerts on the Komuta dashboard.

### Available alert types

| Alert | What it monitors | Default threshold |
|---|---|---|
| **Overdue Receivables** | Total overdue invoice amount | ₺50,000 |
| **Overdue Ratio** | Percentage of receivables overdue | 20% |
| **Cash Runway** | Days of cash remaining at current burn rate | 60 days |
| **Partner Loan Burden** | Partner loan-to-equity ratio | 200% |
| **Net Margin Warning** | Net profit margin below threshold | 5% |
| **Negative Cash Flow** | Cash flow negative for N consecutive months | 2 months |
| **High Expense Growth** | Month-over-month expense growth | 30% |
| **Revenue Decline** | Month-over-month revenue decline | 15% |
| **KDV Payable** | KDV payable amount | ₺100,000 |
| **Unreported Sales** | Sales without KDV category set | Any |
| **Pending Approvals** | Approval requests waiting beyond 48h | 3 items |
| **Period Close Overdue** | Period not closed within N days after month end | 10 days |

### Configuring alert thresholds

1. Navigate to `/dashboard/admin` → Alert Rules.
2. Find the alert you want to configure.
3. Toggle the alert on or off using the switch.
4. Click the threshold value to edit it.
5. Enter your desired threshold and click **Save**.

### Alert severity levels

Each alert has a severity level:
- **High (red):** Requires immediate attention. Shown prominently on Komuta.
- **Medium (amber):** Needs review soon. Shown in the alert list.
- **Low (blue):** Informational. Can be reviewed periodically.

You can adjust severity levels when configuring each rule.

### Alert notifications

If email is configured (`RESEND_API_KEY` set), active high-severity alerts are included in the daily digest email sent to `ADMIN_DIGEST_EMAIL`. The digest arrives daily at approximately 09:00 local time (based on the nightly cron schedule).

---

## 10. Governance Workflows

### What are governance workflows?

Governance workflows are formal records of significant financial decisions — particularly those governed by Turkish Commercial Code (TTK). They create an auditable paper trail for partner decisions, dividend declarations, and board resolutions.

The governance module covers:
- Dividend distribution decisions (TTK 509)
- Management fee (huzur hakkı) decisions (TTK 394)
- Partner capital changes
- Board minutes and resolutions

### How to create a governance report

1. Navigate to `/dashboard/admin` → Governance.
2. Click **New Report**.
3. Select the report type (dividend declaration, partner resolution, etc.).
4. Fill in the required fields:
   - Decision date
   - Participants (which partners/board members were present)
   - Decision details
   - Financial amounts (if applicable)
5. Click **Save Draft**.

### Signing off on a governance report

Once a governance report is drafted, it must be signed off by authorized persons:

1. Open the report from the governance list.
2. Click **Add Sign-Off**.
3. The system records your name, role, and timestamp.
4. Additional authorized persons can also add sign-offs.

Signed-off reports are locked from further editing and recorded in the audit log.

### Monthly governance snapshots

The system automatically creates a monthly governance snapshot on the 1st of each month (via the `governance-snapshot` cron job). This snapshot captures:
- Current partner positions and capital balances
- Period close status
- Active alerts and their resolutions
- Any governance decisions made in the previous month

View snapshots in `/dashboard/admin` → Governance → Snapshots.

---

## 11. Audit Logs

### What are audit logs?

The audit log records every significant action taken in Flowra. Every record creation, modification, deletion, and approval is logged with:
- Who performed the action (user name and email)
- What was changed (before and after values)
- When it happened (exact timestamp)
- Where the change was made (which page/feature)
- A cryptographic hash linking each log entry to the previous one (tamper detection)

### How to view audit logs

Navigate to `/dashboard/admin` → Audit Logs.

You can filter by:
- **Date range:** Select a start and end date
- **User:** See all actions by a specific person
- **Action type:** Filter by create, update, delete, login, approve, etc.
- **Resource type:** Filter by sales, expenses, journal entries, etc.

### Tamper detection (hash chain)

Each audit log entry contains a cryptographic hash of the previous entry. If any log entry is altered, deleted, or inserted, the hash chain breaks — indicating tampering.

The audit log page shows a **Verify Chain** button. Click it to run a hash chain verification. If the chain is intact, you see a green "Chain valid" message. If any tampering is detected, the specific broken link is identified.

This mechanism makes audit logs suitable for regulatory compliance and external audits.

### Exporting audit logs

1. Go to `/dashboard/admin` → Audit Logs.
2. Apply your desired date range and filters.
3. Click **Export CSV**.
4. The CSV file includes all fields including hash values.

Exported audit logs can be provided to external auditors as evidence of system activity.

---

## 12. Reconciliation

### What is reconciliation?

Reconciliation is the process of confirming that your financial records match your actual bank accounts and partner commitments. In Flowra, reconciliation snapshots are formal records that capture the state of accounts at a specific date and serve as board-level documentation (similar to board meeting minutes).

### Creating a reconciliation snapshot

1. Navigate to `/dashboard/admin` → Reconciliation.
2. Click **New Snapshot**.
3. Select the snapshot date (typically the last day of the month or accounting period).
4. The system automatically populates:
   - Cash account balances
   - Partner loan balances
   - Outstanding receivables
   - KDV payable balance
5. Review the pre-populated figures for accuracy.
6. Add any notes or explanations in the Notes field.
7. Click **Create Snapshot**.

### Signing off on a reconciliation snapshot

A snapshot becomes official when signed off by an authorized person:

1. Open the snapshot from the list.
2. Review all figures.
3. Click **Sign Off**.
4. Your name, role, and timestamp are recorded on the document.

Multiple people can sign off on the same snapshot (e.g., CEO + CFO). Each additional sign-off is recorded separately.

### Archiving reconciliation snapshots

Once a snapshot is signed off and a period is closed, archive the snapshot:
1. Open the signed snapshot.
2. Click **Archive**.
3. Archived snapshots are moved to the Archive tab and cannot be edited.

Archived reconciliation snapshots serve as formal documentation for:
- Bank reconciliation records
- Partner board minutes (per TTK requirements)
- External audit evidence

### Generating a PDF of a reconciliation snapshot

1. Open any reconciliation snapshot.
2. Click **Export PDF**.
3. The PDF includes the snapshot date, all balances, and the sign-off signatures.

---

## 13. System Health

### What the health endpoint shows

The health endpoint at `GET /api/health` returns the current operational status of Flowra. Access it by visiting `https://your-app-url.com/api/health` in a browser or with a monitoring tool.

A healthy response looks like:

```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-05-26T10:00:00.000Z"
}
```

### When to be concerned

| Symptom | Likely cause | Action |
|---|---|---|
| `/api/health` returns error 500 | Database is unavailable or service role key is missing | Check Supabase dashboard; verify `SUPABASE_SERVICE_ROLE_KEY` in Vercel |
| `/api/health` is unreachable | Vercel deployment is down | Check Vercel dashboard |
| `"db": "error"` | Supabase project is paused (free tier) | Log into Supabase and restore the project |
| Dashboard loads but data is missing | RLS policy issue or missing `company_members` row | See Troubleshooting guide |

### Checking cron job health

Go to your Vercel project dashboard → **Cron Jobs** tab. This shows:
- The last time each cron job ran
- Whether it succeeded (HTTP 200) or failed
- The response body from the last execution

If a cron job is consistently failing, check:
1. Is `CRON_SECRET` set correctly in Vercel?
2. Is the Supabase database accessible?
3. Review the detailed error in Vercel function logs.

### Monitoring recommendation

Set up an uptime monitor on `/api/health` using a free service like UptimeRobot, BetterStack, or Freshping. Configure it to alert you by email or Slack if the endpoint returns anything other than HTTP 200. This gives you instant notification of any downtime.

---

## 14. Multi-Company Setup

### What is multi-company support?

Flowra supports managing multiple separate companies within the same installation. Each company has:
- Completely isolated data (no data is shared between companies)
- Its own user roles (a user can be an admin in Company A and a viewer in Company B)
- Its own accounting periods, chart of accounts, and settings
- Its own GL mode

This feature is useful for:
- Holding companies managing multiple subsidiaries
- Business owners with several separate entities
- Accountants managing multiple client companies

### Adding a second company

1. Click the **company name** in the top-left sidebar — this opens the company switcher.
2. Click **Add Company**.
3. Complete the company setup wizard (same as the initial setup).
4. The new company is created with you as the admin.

### Switching between companies

1. Click the **company name** in the top-left sidebar.
2. A dropdown lists all companies you have access to.
3. Click a company name to switch.

Switching companies reloads the dashboard with the selected company's data. Your session retains which company is active via a browser cookie. The active company indicator is always visible in the sidebar.

### User access across companies

Being a user in one company does not grant access to another company. Each company's admin must separately invite users and assign roles.

A single person (same email address) can have different roles in different companies:
- Full admin in the parent company
- Viewer in a subsidiary
- Not a member of a third company at all

### Data isolation

All data in Flowra is separated by `company_id`. Row Level Security (RLS) at the database level ensures that API requests for one company can never see or modify data from another company, even in the event of a bug or misconfigured query. This isolation is enforced at the database level, not just at the application level.
