# Flowra Connector Layer — Architecture, Module Ownership & Roadmap

> **Thesis.** Flowra does **not** have to be a closed ERP that does everything itself.
> Real companies already run their books in Logo / Mikro / Paraşüt / Uyumsoft / Bizim Hesap
> and move money through banks. Flowra's durable value is **not** being another ledger —
> it is being the **owner's decision layer** on top of the truth those systems already hold.
>
> This document re-evaluates the current product against that positioning, defines the
> connector architecture, decides **what stays Flowra-native vs what comes via connector**,
> and lays out a staged roadmap. It also marks which parts are **safe to build now** vs
> which need credentials / DDL / a product decision.

Status: **design + safe foundation landed** (`lib/connectors/*`). Provider wiring, staging
tables and live sync are explicitly **not** built (see §7).

---

## 1. Where Flowra is today (grounded in the codebase)

Flowra is currently a **full system-of-record ERP**. It owns:

- **Transactional truth**: `sales` (236 refs), `expenses` (163), `proformas`/`proforma_items`,
  `purchases`/`purchase_orders`, `products`, `customers`, `sale_items`, stock (`stock_lots`,
  `stock_movements`).
- **Its own General Ledger**: `journal_entries` + `journal_entry_lines` written via a
  **dual-write** path, gated by `accounting_periods` (39 refs — period locks), plus
  reconciliation (`reconciliation_snapshots`, the `bank-reconciliation`/`gl-reconciliation`
  engines and services).
- **Partner/owner domain** (its real moat): `partners`, `partner_loan_tranches`,
  `partner_transactions`, `partner_capital_commitments`, `partner_finance_events`.
- **Decision/intelligence**: scenarios, projections, runway, collections prioritization,
  pricing intelligence, anomaly/alerts.

Two facts shape the strategy:

1. **The reconciliation engine already exists** but runs in `book_only_mode` — it falls back
   to a synthetic "Genel Kasa" line because **no bank tables are populated**
   (`bank_accounts` / `bank_transactions` / `bank_statement_lines` are referenced in code but
   are *unmigrated orphans* — see [[built-but-unmigrated-tables]]). The connector's first job
   is to **feed real bank + invoice data into the engine that's already there.**
2. **Flowra maintains its own GL.** The moment a real accounting system is connected, *that*
   system is the legal book of record (e-Fatura, beyanname, mizan). Flowra keeping a parallel
   ledger would create two sources of truth. → **Provenance precedence** (§4) is the core rule.

---

## 2. Positioning: from "kapalı ERP" to "karar katmanı"

| | Closed-ERP Flowra (today) | Decision-layer Flowra (target) |
|---|---|---|
| Source of transactional truth | Flowra (manual entry) | The accounting/e-invoice system + the bank |
| Flowra's GL | Book of record | **Shadow / derived view** (kept only for the no-accounting-system segment) |
| Owner does | Re-types invoices into Flowra | Connects once; Flowra reads continuously |
| Flowra's value | "Another program to keep updated" | "The screen that tells me what to do" — Bugün / Param / Kârım / Ortaklar |
| Mali müşavir | Competes with Flowra | Keeps their program; Flowra reads from it (non-threatening → easier sell) |

The **manual-entry ERP stays** as the path for owners who are *not yet* on e-Fatura / an
accounting program (a real Türk-KOBİ segment). Connectors are **additive**, never required.

---

## 3. Module ownership map — what stays vs what flows in

### 3a. STAYS Flowra-native (the moat — never delegated)
- **Decision screens**: Bugün (günlük komuta / Kokpit), Param (nakit pozisyonu, runway),
  Kârım (kârlılık kararı), **Ortaklar** (sermaye · temettü · ortak kredileri — no Türk
  accounting program models owner partnerships this way; owner-first).
- **Planning**: senaryolar, projeksiyon, başabaş, what-if, bütçe.
- **Intelligence**: alerts, anomaly, runway, tahsilat önceliklendirme, pricing/marj
  zekâsı, risk skoru.
- **Proforma / teklif** (pre-invoice sales motion — becomes an invoice *in the accounting
  system* once accepted).

### 3b. COMES via connector (external system = source of truth)
- **Satış faturaları** (e-Fatura / e-Arşiv) — accounting/GİB systems.
- **Alış faturaları / giderler** — accounting systems.
- **Cari** (müşteri + **tedarikçi**) — the accounting system is the master. *(Flowra has no
  suppliers table today — supplier identity lives inline on purchases; the connector supplies
  the real cari master.)*
- **Tahsilat / tediye** — accounting + bank.
- **Banka hesap hareketleri** — bank connector.
- **Resmî GL / mizan / beyanname** — owned by the accounting program, full stop.

### 3c. HYBRID (Flowra-native, connector-reconciled)
- **Stok** — Flowra tracks operationally (FIFO lots); reconcile against the accounting
  system's stock if present.
- **Sales** — Flowra quick-entry **or** connector-sourced from issued invoices; manual is the
  fallback when no connector is configured.

### 3d. BECOMES shadow when a connector is active
- **Flowra's dual-write GL** (`journal_entries`) → derived/shadow, **not** book of record.
  Kept live only for the no-accounting-system segment. The double-entry expense path
  (`dualWrite`) must check provenance before writing (§4).

---

## 4. Data provenance — the central rule

Every ingested or entered record carries a **source**:

```
type DataSource =
  | 'flowra_manual'             // typed into Flowra
  | `connector:${ProviderId}`   // e.g. connector:parasut, connector:logo, connector:bank_x
```

**Precedence**: when a connector owns an entity class for a company, connector data
**supersedes** manual for that class. Manual records are never silently deleted — they are
flagged `superseded_by` so the owner can see the reconciliation. Flowra's GL only writes when
**no** accounting connector owns that company's books (else it would fork the truth).

A small **`connector_sources`** registry (per company: which provider owns which entity class,
last sync cursor, status) drives this. **Schema designed below; not applied (DDL — user).**

---

## 5. Connector architecture (the shape that landed in `lib/connectors/`)

```
                ┌─────────────────────────────────────────────┐
   External     │  AccountingConnector (read-only)            │   BankConnector (read-only)
   systems  ──▶ │   fetchInvoices / fetchExpenses /           │    fetchAccounts /
   (Paraşüt,    │   fetchCustomers / fetchSuppliers /         │    fetchTransactions
   Logo, …)     │   fetchCollections                          │
                └───────────────┬─────────────────────────────┘
                                │  External* DTOs (provider-shaped)
                                ▼
                       normalize.ts  (pure: External* → Flowra canonical + provenance)
                                │
                                ▼
                       ingestion pipeline (idempotent, cursor-based)  ── staging tables
                                │
                                ▼
                       Financial Core  (provenance precedence)
                                │
                                ▼
                       Bugün / Param / Kârım / Ortaklar
```

- **`AccountingConnector` / `BankConnector`** — narrow **read-only** interfaces. v1 has no
  write methods at all (push-to-external is a deliberate non-goal until much later).
- **Provider registry** — capability metadata per provider (auth model, what it can read,
  status). Lets the UI render "Bağlanabilir sistemler" honestly without any provider being
  wired.
- **Normalization** — pure functions, the only place external shapes are known; everything
  downstream sees Flowra-canonical types. Unit-tested.
- **Adapters** — one folder per provider; v1 skeletons `throw NotConfiguredError`. No network,
  no credentials in the repo.

### Provider landscape (capability-first, build order)
| Provider | Auth | Read scope | Build priority |
|---|---|---|---|
| **Paraşüt** | OAuth2 REST | invoices, expenses, cari, collections | **1st** (cleanest public API) |
| **Bizim Hesap** | API key REST | invoices, cari | 2nd |
| **Uyumsoft** | e-Fatura WS | e-Fatura/e-Arşiv | 3rd (e-invoice depth) |
| **Logo** | on-prem SQL / Logo Objects / REST | full ERP | 4th (deployment-dependent) |
| **Mikro** | on-prem SQL / web API | full ERP | 4th (deployment-dependent) |
| **Bank** | statement file (MT940/CSV) → open-banking API | account movements | parallel; **file import first** |

> Logo/Mikro are often **on-prem SQL** → realistically an **agent/file bridge**, not a cloud
> API. The interface is the same; the adapter differs. Bank: start with **statement-file
> import** (zero integration risk), graduate to open-banking/BaaS APIs later.

### 5a. Activating the live Paraşüt adapter (status: beta)
The OAuth2 adapter is written (`lib/connectors/adapters/parasut.ts`) with the bug-prone
JSON:API mapping unit-tested (`parasut-map.ts`). It reads **all credentials from env** — no
secrets in the repo. To turn it on (you, the owner):
1. Create a Paraşüt app (Geliştirici → API) → get `client_id` / `client_secret`, complete the
   OAuth flow once to obtain a `refresh_token`, and note your numeric `company_id`.
2. Set, server-side only (Vercel env): `PARASUT_COMPANY_ID`, `PARASUT_CLIENT_ID`,
   `PARASUT_CLIENT_SECRET`, `PARASUT_REFRESH_TOKEN`.
3. With those present, `createAccountingConnector('parasut')` is live; without them it stays a
   safe skeleton (NotConfiguredError). **Verify field names against a real company before
   trusting a sync** — the mapping follows the v4 docs but is untested against live data.

---

## 6. Roadmap (the user's 7 steps, grounded + sequenced)

| # | Step | Depends on | Risk / who |
|---|---|---|---|
| 0 | **Connector abstraction** (types, interfaces, registry, normalization, adapter skeletons) | — | ✅ **DONE — safe, landed** |
| 1 | **Read-only integration** — first real adapter (Paraşüt) + OAuth + secret storage | provider creds, OAuth app | external API + secrets → **user/product** |
| 2 | **Staging + provenance** — `connector_sources` + `external_*` tables, idempotent cursor sync, `source` tagging on Core records | **DDL** | DB migration → **user (no creds / hard-stop)** |
| 3 | **Invoice–bank reconciliation** — feed connector bank lines + invoices into the **existing** reconciliation engine (replace `book_only_mode`) | steps 1–2 | medium; reuses built engine |
| 4 | **Connect to Financial Core** — provenance precedence; Flowra GL → shadow when a connector owns the books | step 2 | touches GL/dual-write → **careful, accounting** |
| 5 | **Feed decision screens** — Bugün / Param / Kârım / Ortaklar read the unified, provenance-aware Core | step 4 | mostly read-side |
| 6 | **Reposition** — Flowra = karar katmanı; accounting program stays system-of-record; messaging, onboarding ("Sisteminizi bağlayın"), mali-müşavir-friendly framing | steps 1–5 | product/GTM |

---

## 7. Safe-to-build boundary (what this change includes vs defers)

**Built now (100 % safe — pure code, no network, no secrets, no DDL, no data mutation):**
- `lib/connectors/types.ts` — canonical `External*` DTOs + `DataSource`/provenance + `NotConfiguredError`.
- `lib/connectors/accounting-connector.ts`, `bank-connector.ts` — read-only interfaces.
- `lib/connectors/registry.ts` — 5 accounting + bank providers, capability metadata, `status:'planned'`.
- `lib/connectors/normalize.ts` — pure External→canonical normalizers (+ unit tests).
- `lib/connectors/adapters/*` — skeletons that `throw NotConfiguredError`.

**Deferred — needs credentials / external access (user / product decision):**
- Any real provider call (Paraşüt OAuth, Logo SQL bridge, bank APIs). Sending company data to,
  or pulling it from, an external service is an explicit-permission boundary.

**Deferred — needs DDL (hard-stop, no DB creds):**
- `connector_sources`, `external_invoices/expenses/customers/suppliers/collections`,
  `bank_accounts/bank_transactions/bank_statement_lines` (the last three already exist as
  unmigrated orphans — apply per [[built-but-unmigrated-tables]]).

**Deferred — touches accounting integrity (careful):**
- Step 4 (provenance precedence on the dual-write GL). The expense/sale dual-write must learn
  to **stand down** when a connector owns the books — a deliberate, reviewed change, not a
  bulk edit.

---

## 8. Immediate next safe increments (when prioritized)
1. A **`connectors` settings surface** (read-only): render the provider registry as
   "Bağlanabilir sistemler" with status badges + a "yakında" state. Pure UI over the registry.
2. A **bank statement-file import** (MT940/CSV) reusing `lib/csv.ts` + the existing
   reconciliation engine — the lowest-risk first *real* data path (no external API, file in).
3. Wire `DataSource` provenance onto the existing manual entities in code (default
   `'flowra_manual'`) so the precedence model has a home before any connector exists.
