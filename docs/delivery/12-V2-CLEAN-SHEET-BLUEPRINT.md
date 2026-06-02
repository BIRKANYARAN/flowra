# FLOWRA V2 — CLEAN-SHEET BLUEPRINT

*Designed from a blank repository by an 8-domain architect panel (ERP architect · CFO · CEO · accountant · auditor · product designer · SaaS founder), then synthesized. Design only — no code, no implementation. The brief: forget V1 entirely, challenge every assumption, design the ideal end-state.*


---

## Executive summary

Flowra V2 is the system of record a multi-partner Turkish KOBİ uses to legally take profit out of the company. The wedge is the dividend job — "compute distributable profit from a real posted ledger, gate it on a board resolution, post the GVK 94 stopaj atomically, and prove TTK 509/519 safety by construction" — a job no competitor (Logo, Paraşüt, Mikro) does because none of them model partner capital and loan financing. Underneath that differentiator sits the thing V1 fatally lacked: a double-entry Tek Düzen general ledger that is PRIMARY from migration 0001, where every transaction (invoice, collection, supplier bill, dividend) posts a balanced journal in the same atomic action, and every statement is a pure SQL view over posted lines. There is no shadow GL, no parallel aggregator, no owner-typed net income. The PCLE depth that was V1's one genuine moat is kept in full, but re-grounded so the distributable figure is canonical rather than a spreadsheet guess.

Architecturally V2 is one kernel and a thin shell. A pure, Supabase-free Financial Core computes every canonical figure exactly once (net income, KDV, one Kurumlar matrah including +KKEG, distributable profit vs distributable cash, runway, DSCR), each wrapped in a drillable Figure carrying its value in integer kuruş, its source, its journal-line provenance, and an honest complete flag. Around it: a real compliance module (e-Fatura/e-Arşiv inbound+outbound, e-Defter) shipped day one so Flowra is a legal book of record and not a toy, a legal-by-construction governance subsystem with an HMAC-keyed append-only audit chain, and an information architecture that collapses V1's 25 hubs / 48 tabs into ~6 centers driven by the owner's jobs with progressive disclosure from guided Home to expert cockpit. CI enforces the discipline mechanically — single-definition-per-figure lints, a reconciliation test that ties balance sheet, trial balance, net income, KDV and matrah to the cent, a no-fallback lint, and a nav budget guard — so that "the statements disagree" becomes a red build rather than a production incident. Fewer surfaces, one truth, real compliance, and a moat nobody else has.


> **Verdict.** Flowra V2 is one posted ledger, one Core that computes each figure exactly once, real Turkish statutory compliance from day one, and a legal-by-construction partner-dividend workflow as the moat — fewer surfaces, one truth, no number an owner can type.


---

## The 8 mission questions, answered

**1. What should Flowra actually be?**  
The system of record a multi-partner Turkish KOBI uses to run its statutory books and legally distribute profit. A double-entry Tek Duzen GL is primary from day one; every screen is a read-only view over one Financial Core that computes each canonical figure exactly once. Real e-Fatura/e-Arsiv/e-Defter make it a legal book of record, and a ledger-backed PCLE + legal-by-construction dividend workflow is the differentiating wedge no competitor offers.


**2. Who is the primary user?**  
The owner / managing-partner of a multi-partner KOBI (5-50 people) — the exact user V1 nearly bankrupted by letting them type their own TTK-509 net income. The mali musavir is a secondary consumer (reads e-Defter, never the buyer); the CFO/accountant are altitude variants reading the same kernels, not different numbers.


**3. Workflows that matter most**

- Legal-by-construction dividend: distributable profit computed from posted GL, gated on an HMAC-snapshot board resolution, GVK 94 stopaj posted, all in one atomic reversible transaction — the declare API carries no amount field
- Daily cash check: one screen, 13-week runway from posted+scheduled ledger entries, answering 'can I make payroll / pay this supplier'
- Invoice-to-ledger: issue a real e-Fatura/e-Arsiv (or ingest an inbound one) that posts a balanced journal in the same action
- Monthly close: checklist-driven reconcile -> review exceptions -> hard pre-close validation -> lock period into a signed immutable snapshot
- Period-close / retained-earnings waterfall: the only writer of 590/570 — P&L->690->692->590, 590->570, 580 mahsup, TTK 519 %5 legal reserve, residual = dividend ceiling
- Partner capital lifecycle (PCLE): commitments, capital calls (reusing the dividend resolution gate), partner loans, equalization, returns — all ledger-backed
- Tax close: one Kurumlar matrah kernel (ticari kar + KKEG - istisna - 580 prior loss) posting back to 691/370, read-only on every screen

**4. Essential modules**

- Ledger Kernel (double-entry Tek Duzen GL, primary from migration 0001 — single owner of every canonical financial figure)
- Financial Core (pure, Supabase-free package: one kernel per figure, Figure<T> wrapper with provenance + complete flag, one assembleReportPack)
- Accounting/Statements (Bilanco, Gelir Tablosu, direct-method Nakit Akis as pure views over one balance_view)
- Tax (one matrah/Kurumlar kernel incl. +KKEG, KDV, GVK stopaj — never recomputed)
- Compliance (e-Fatura / e-Arsiv outbound+inbound, e-Defter) — day-one, not phase-8
- Governance (resolution model, HMAC-keyed append-only audit chain, legal-by-construction dividend)
- Partner Capital / PCLE (one service over GL-backed tables; 3 canonical figures: capital account balance, distributable amount, dividend net-of-stopaj)
- Period close engine (atomic TTK waterfall, sole writer of 590/570)
- FX (TCMB-sourced immutable fx_rate table, rate frozen at post, missing-rate hard stop)
- Thin Alerts (only ledger-derived, sourced facts)
- Read-only View surfaces: Cockpit/Dashboard, one Reports surface, Cash, Close (~5 owner destinations + drill-downs)
- Forecasting (same Core kernels run forward over named, sourced drivers — labeled 'Tahmin', complete:false)

**5. Modules that should NOT exist**

- The intelligence/situation/forecast/anomaly engine tier — fabricated scores on thin data (P6); anomaly & duplicate-detection are methods of one thin Alerts/insight service, not standalone engines
- A standalone simulation center — survives only as the dividend dry-run preview and a read-only projection that may never post to the ledger
- Parallel financial aggregators in lib/finance (V1's balance-sheet.ts / cfo-metrics.ts) feeding statements
- Separate CFO, Operations, and Planning centers — one owner = one cockpit with progressive disclosure
- A second income statement (operational + GL pair), a second tax/matrah engine, a second report pack, a second governance home, a second capital-account service — two of anything guarantees silent drift
- Standalone 40-tab analytics (RFM, cohort, market-basket, product-mix sensitivity) a small KOBI never acts on
- Proformas as a first-class pillar — a proforma is just the draft state of the real e-Fatura workflow
- Redirect-only stub pages and a design-system route shipped to prod
- A dormant/shadow GL with gl_mode='shadow'; stored running-balance / on-hand columns; schema-per-tenant; speculative partitioning/sharding at SME volume

**6. What to merge**

- V1's 32-file lib/services/pcle/ + 4 top-level partner services -> ONE Partner Capital module with 3 canonical figures
- V1's ~25-route partner sprawl (dividend-calculator, dividend/calculate, distribution-simulator, equity-waterfall, equity-waterfall-distribution...) -> one compute/propose/declare/void
- tax.service.ts + tax/ dir x3 + finance/tax-compliance -> one matrah kernel reading the ledger
- income-statement.service.ts + gl-income-statement.service.ts -> one income statement (pure view)
- Two report packs (reports/ + cfo/) and the standalone getCfoMetrics aggregator -> one assembleReportPack / one Reports surface
- financial-summary + financial-statements + financial-health + financial-benchmarking + financial-health-score -> one ReportPack over the Core
- Triplicated forecast services (commercial/finance/inventory) -> one forecasting layer reusing Core kernels
- V1's 7 engines folder (situation/alert/forecast/anomaly/duplicate/reconciliation/workflow) -> one thin insight/Alerts service
- V1's ~220 services -> ~30 concept-owned domain services (~25 repos, ~50 view models, ~60 thin routes)
- V1's 25 hubs / 48 tabs -> ~6 centers / ~28 tabs with one guided Home

**7. What to split**

- distributable_profit (accrual/legal, TTK 519, hard non-negative guard that throws) from distributable_cash (treasury, min of profit and free cash) — dividend safety reads profit, payout availability reads cash
- Posting doors: exactly two (declarative kernel/posting.ts per domain event, and a guided manual-journal routing through the same boundary) — everything else is denied journal INSERT by RLS
- Layers: strict DB -> repos -> domain services -> thin routes -> read-only view models, directional imports only, only repos touch SQL
- Type isolation: screens receive DTOs and have no kernel import path; the Core imports no Supabase/React/Next so it is reusable for forecasting
- Altitude split per user (Guided Home <-> Expert Hubs) without splitting the numbers — same kernel for owner, CFO, accountant; only framing differs
- Adaptive landing into three server-computed states (SETUP -> ACTIVATING -> COCKPIT) keyed on real row counts so an empty tenant can never reach a populated score

**8. What I would NEVER build again**

- Any UI path that lets a user hand-enter net income / distributable profit / tax basis to authorize a statutory action — the declare API has no amount field
- A YTD net-income proxy summed from sales/expenses tables that disagrees with the balance sheet
- A dormant/shadow GL with statements run off parallel aggregators and silent row caps
- A matrah formula without +KKEG (structurally illegal filing) and inline tax math (CORP_TAX_FRACTION) duplicating a TaxService
- Inline `fx_rate ?? 1` parity fallback that fabricates TRY from missing rates (V1's tax.service.ts:337 bug)
- The zero-revenue / failed-query escape hatch that 'proceeds with a non-blocking warning' — V2 fails closed on statutory actions, always
- A non-atomic per-partner insert loop leaving partial dividends; a 'legacy batch insert' path accepting client-supplied gross/withholding/net
- A 'governance health score' read-model masquerading as an audit trail — replaced by a write-side mandatory HMAC chain with UPDATE/DELETE revoked
- Balance/period/integrity enforcement in TS only — it belongs in DB CHECK constraints and triggers; stored running-balance columns that drift
- SECURITY DEFINER functions trusting a caller-supplied company_id; blanket anon write grants; app-level SELECT-then-INSERT idempotency
- round2() scattered mid-calculation and silent error-swallow (sq/sqt) rendering a failed fetch as a legitimate ₺0; offset pagination and inline Intl/toLocaleString formatting
- A service per financial figure (V1's 220-service disease); per-center duplicate dashboards/reports; tab-sprawl patched by a bolt-on groups prop

### Cross-domain conflicts resolved by the lead architect

- Where the canonical figure physically lives: the Finance designer wants every figure defined in a pure Supabase-free Core package (Figure<T> with provenance), while the Database and Accounting designers want correctness enforced by DB CHECK constraints and triggers. Resolved as a two-layer truth: the DB is the integrity boundary (balanced-journal, period-lock, append-only, RLS are non-bypassable constraints/triggers), and the pure Core is the computation boundary (one kernel per figure over a posted LedgerSnapshot). The Core never re-validates what the DB guarantees; the DB never computes a derived business figure. One canonical figure, enforced twice in non-overlapping ways.
- Where distributable profit is owned: the Governance designer puts the distributable-profit kernel in the governance subsystem (reading 590/580/540), the Finance designer puts it in Core, and Accounting puts the period-close waterfall as the sole writer of 590/570. Resolved by sequencing ownership: the close engine is the only writer of retained earnings; the Core exposes the single distributable_profit kernel reading those posted balances; governance consumes that kernel and adds the resolution gate + atomic declaration. Governance owns the workflow, Core owns the number, close owns the ledger state.
- Service-count vs module-count framing: the Module-Map designer says '12 modules', the Service-Architecture designer says '~30 domain services', the Finance designer says '~8 Core services'. Resolved as nested, not competing: 12 conceptual modules decompose into ~30 concept-owned domain services, of which ~8 form the Financial Core. The numbers are consistent at different altitudes; the binding rule is one-owner-per-figure enforced by a registry + CI, not the count itself.
- Simulation's right to exist: the Product-Vision and Module-Map designers say delete the simulation center; the Finance designer wants forecasting as first-class (Core kernels run forward). Resolved: there is no standalone simulation/forecast destination, but forecasting survives as a read-only projection layer reusing the identical Core kernels over named sourced drivers, every output labeled 'Tahmin'/complete:false, never posting to the ledger and never a forecast-of-record. Capability kept, surface deleted.
- Dashboard adaptivity vs single-source numbers: the Dashboard designer wants a role-adaptive, three-state landing; the Finance/Accounting designers insist on one number for everyone. Resolved by separating altitude from arithmetic — role and tenant-maturity change which tiles and which framing appear, but every tile is a dumb renderer of the same kernel result with a kernel_id and drill link; an empty tenant renders explicit 'No data yet', never a fabricated score.


---

# Detailed designed sections



---

## FLOWRA V2 Product Vision (Deliverable 1)

## FLOWRA V2 — Product Vision

> Grounded in V1's actual code: I read the chart of accounts (`lib/accounting/chart-of-accounts.ts`, MSUGT-mapped), the 30+ PCLE services (`lib/services/pcle/*` — dividend, TTK 509/519, GVK 94 withholding, capital accounts, waterfalls), the finance kernels (`lib/finance/*` — balance-sheet, cogs, cfo-metrics), and the 7-center / 40-tab nav (`lib/nav-config.ts`, `app/dashboard/*`). The decisive finding: **V1 has world-class partner-financing depth but no real statutory spine** — zero e-Fatura/e-Arşiv/e-Defter (`grep` for GİB/e-Fatura/e-Defter returns nothing), and statements run off `lib/finance` aggregators rather than a posted ledger. That is the gap V2 closes.

---

### (1) What Flowra actually IS

**Positioning.** Flowra is the **governed financial operating system for the Turkish KOBİ** — the single place where a 5–50-person şirket runs the loop that actually decides whether the business survives: invoice legally (e-Fatura/e-Arşiv), let every transaction post to a real double-entry ledger, watch cash and receivables in real time, and — when the partners want to take money out — compute a **legally-safe dividend from the ledger** (TTK 509/519 distributable-profit test + GVK 94 stopaj), gated on a board resolution, atomic and reversible. It is not "accounting software" (the mali müşavir already does the beyan); it is the **owner-and-partners' command layer** that sits on top of one canonical ledger and makes high-stakes money moves legal by construction.

**One-sentence promise.** *"Faturadan temettüye kadar tek bir gerçek defter — her rakam tek kaynaktan, her yüksek-riskli karar kanunen güvenli."* ("From invoice to dividend on one real ledger — every figure from a single source, every high-stakes decision legal by construction.")

---

### (2) PRIMARY user — pick ONE

| | Persona | Why |
|---|---|---|
| **PRIMARY** | **The owner-operator / managing partner** of a 5–50 person limited/A.Ş. şirket who is *financially literate but not an accountant* — runs sales, signs the invoices, and is the one who wants to legally pull profit out of the company. | This person is the **buyer, the daily user, and the one V1 nearly bankrupted by letting them type their own net-income to "prove" a dividend was TTK 509-safe (P3).** Optimizing for them forces the legal-by-construction and one-canonical-figure disciplines. They feel the partner-financing pain no generic tool addresses. |
| **SECONDARY** | **The company's mali müşavir / in-house finance lead** — consumes Flowra's e-Defter export and statements, validates period close, signs off on the dividend resolution. | We design *for* the owner but must never *lie* to the accountant. Flowra produces books the müşavir trusts (GUI-XML e-Defter, posted GL), making the müşavir an ally and a referral channel — not a competitor. |

We explicitly do **not** optimize for the CFO-at-a-200-person-firm (Logo/Netsis territory) or the freelance/şahıs şirketi (Paraşüt's wedge). Progressive disclosure (P7) lets the same product serve a guided first-timer and an expert at month-end, but the center of gravity is the owner-partner of a real multi-partner KOBİ.

---

### (3) The 5–7 WORKFLOWS the whole product orbits

Everything else is a read-only VIEW (P1) over these. One workflow = one job = one tab (P5).

1. **Legally invoice (Satış → e-Fatura/e-Arşiv).** Create a sale; it issues a statutory e-Fatura or e-Arşiv via GİB/integrator, **and in the same atomic transaction posts the balanced journal** (120/600/391). This is the System-of-Record workflow that makes Flowra not-a-toy (P4). *V1 had only proformas — this is net-new and non-negotiable.*

2. **See the truth (Komuta — cash, receivables, P&L, position).** A single owner cockpit reading the *posted ledger*: bank/kasa cash, aging receivables, this-month P&L, runway. Not a vanity dashboard — every tile is sourced and acts as a link into the workflow that fixes it (P6).

3. **Get paid (Tahsilat & ödeme / collections & payables).** Match incoming/outgoing bank movements to open invoices, post the settlement journal, drive overdue follow-up. The cash loop.

4. **Record cost & buy (Gider/Alış → e-Fatura inbound + stok).** Capture supplier invoices (inbound e-Fatura), post payables + KDV indirilecek (191), move inventory/COGS. The other half of the GL.

5. **Partner & capital financing (PCLE).** Track each partner's paid-in capital, partner loans (321), interest accrual, capital calls, and equity/loan position over time. **This is the V1 crown jewel kept in full** — the defensible depth.

6. **Take profit out, legally (Temettü / dividend distribution).** The marquee legal-by-construction workflow: compute distributable profit *from the ledger*, run TTK 509 (no distribution beyond distributable profit) + TTK 519 (yedek akçe) test, apply GVK 94 (%10/%15) stopaj, require a recorded board resolution, then post the distribution atomically and reversibly across partners. *No owner ever types the net-income again (P3).*

7. **Close the period & hand off (Dönem kapanış → e-Defter / statements).** Lock the period, freeze figures, generate statutory-grade outputs and the e-Defter (GUI-XML) the müşavir files. The handshake that makes the secondary user trust the primary user's books.

> **What got cut from V1's 40 tabs:** simulation, insights, multiple "intelligence/anomaly/forecast/situation" engines, separate CFO/operations/planning centers, duplicate report surfaces. They become at most *views or panels inside the 7 workflows above*, or they don't ship. Simulation survives **only** as the dry-run preview *inside* the dividend workflow.

---

### (4) The WEDGE — why a Turkish KOBİ switches

**The status quo they're switching from:** mali müşavir's Luca/Logo running the *statutory beyan* once a month, plus the owner's **Excel** for cash, receivables, partner accounts, and "can we take money out?" — two sources that never agree, with a 4-week visibility lag.

**The wedge (the one job nobody else does):** *"Legally take profit out of a multi-partner company — computed from a real ledger, not from a number you typed."* Generic tools (Logo, Paraşüt, Mikro) invoice and bookkeep, but **none model partner capital/loan financing or run a TTK 509 + GVK 94 dividend as a gated, ledger-derived, atomic action.** That is precisely V1's existing `lib/services/pcle/*` depth — already built, already differentiated. V2 makes it trustworthy by putting a *real posted GL* (P2) underneath it so the distributable-profit figure is canonical, not a spreadsheet guess.

**Defensible difference (3 moats, in order):**
- **Partner-financing + governance depth (the durable moat).** PCLE — capital accounts, partner loans, interest accrual, dividend waterfalls, TTK 509/519 + GVK 94 — is hard to copy and exactly the multi-partner KOBİ's unmet pain. Logo/Paraşüt treat the company as if it has one faceless owner.
- **A real double-entry GL as primary (the trust moat, P2).** One ledger, one balance sheet, one net-income path — the discipline that *kills the V1 failure mode* of disagreeing statements. Lets every screen be a read-only view (P1).
- **Legal-by-construction high-stakes actions (the safety moat, P3).** Dividend, tax, period close cannot be performed on un-validated input. This is a *category* generic tools don't even attempt — they leave the legal risk on the owner.

Against **Paraşüt** (great UX, şahıs/freelance, no partner/governance, no real GL exposure): Flowra wins on multi-partner depth and legal safety. Against **Logo/Mikro** (statutory power, müşavir-facing, hostile to owners, no governance workflows): Flowra wins on owner usability + the dividend/partner job. Flowra deliberately does **not** try to out-statute Logo or out-simple Paraşüt — it owns the *governed-partner-financing* lane between them.

---

### (5) Business model — one line

**Per-company SaaS subscription** (tiered by partner count + statutory module: invoice-volume-metered e-Fatura/e-Defter), ~₺1.5–4k/ay, sold to the owner, with the **dividend/partner-governance tier as the paid upsell** that no competitor can match — and the mali müşavir as referral channel, never the buyer.

**Key decisions:**
- Optimize for ONE persona: the owner / managing-partner of a multi-partner KOBİ — the exact user V1 nearly bankrupted by letting them type their own TTK-509 net-income. Mali müşavir is secondary (consumes e-Defter, never the buyer).
- The wedge is the dividend job: 'legally take profit out of a multi-partner company, computed from a real ledger.' No competitor (Logo/Paraşüt/Mikro) models partner financing or runs a gated TTK 509 + GVK 94 distribution.
- Keep V1's PCLE depth (30+ services in lib/services/pcle) in FULL — it is the durable moat — but put a real posted double-entry GL underneath it so the distributable-profit figure is canonical, not a spreadsheet guess.
- Close V1's fatal P4 gap: ship real e-Fatura/e-Arşiv (outbound + inbound) and e-Defter from day one. grep proves V1 had only proformas, making it a 'toy' by the first principles.
- Collapse V1's 7 centers / 40 tabs (lib/nav-config.ts) into exactly 7 workflows; everything else (simulation, insights, anomaly/forecast/situation engines, planning/CFO/ops centers) becomes a view inside a workflow or does not ship.
- Every transaction-creating workflow (invoice, collection, supplier bill, dividend) posts a balanced journal in the SAME atomic action — no shadow GL, no parallel aggregator (kills the V1 'statements disagree' failure).


---

## FLOWRA V2 Module Map + KEEP/MERGE/SPLIT/DELETE judgments

## FLOWRA V2 — Module Map

I read V1's actual surface before writing this. The findings are damning and they drive every judgment below:

- **`lib/services/pcle/` holds 32 service files** with rampant duplication: `partner-risk` + `partner-risk-composite`; `equity-waterfall` + `equity-waterfall-distribution`; `dividend` + `dividend-calculator` + `dividend-ledger`; `capital-account` + `capital-statement` + `partner-capital-statement`; `amortization` + `amortization-schedule` — **plus** four more top-level partner services (`partner`, `partner-equity`, `partner-transaction`, `partner-crud`). That is *six or seven* capital-account code paths, not the "two" the brief flagged.
- **`app/dashboard/finance/_tabs/` has ~40 sub-tab folders**, and tax/net-income is computed in BOTH `finance/_tabs/` (`TaxTab`, `CorporateTaxTab`, `PnlTab`) AND `cfo/tax/` — two homes, two engines. `lib/finance/cfo-metrics.ts` + `lib/services/finance.service.ts` + `financial-summary` API each derived tax independently (the roadmap itself logs "Kurumlar vergisi çift hesaplama fix" as Faz 11-C).
- **8+ distribution/dividend partner tabs** (`DistributionTab`, `DistributionSimulatorTab`, `DividendTab`, `DividendLedgerTab`, `WaterfallTab`, `EquityWaterfallTab`, `ReturnsTab`, `RiskTab` + `RiskCompositeTab`).
- **`lib/engines/`** ships `situation.engine`, `forecast.engine`, `anomaly.engine`, `duplicate-detector` — the score-fabrication tier P6 forbids.

V2 is **12 modules in 3 tiers**. The Kernel owns every number; capability modules post to it; view modules only read.

---

### Tier 0 — THE KERNEL (1 module)

| Module | Single responsibility | Canonical figures it OWNS |
|---|---|---|
| **`ledger`** (Double-Entry GL) | The system of record. Accepts balanced journal entries, enforces period locks, derives every statement. The ONLY module that turns money into truth. | **Every financial figure**: account balances, trial balance, net income, retained earnings, cash position, tax base (matrah), KDV payable/receivable, COGS, AR/AP aging. Statements are pure projections of posted journals. |

This is P1+P2 made physical. No screen computes net income; net income is `SUM(600s) − SUM(6xx) − SUM(770/771)` over the posted ledger, computed in exactly one function. Tek Düzen Hesap Planı account codes live here.

---

### Tier 1 — CAPABILITY MODULES (7) — they *post* journals, they don't *compute money*

| Module | Single responsibility | Canonical figures it owns | Posts to ledger |
|---|---|---|---|
| **`sales`** | Quote → proforma → invoice → collection lifecycle for revenue. | Order value, collection status/aging *(as source docs)* — the GL owns the AR balance. | Sale accrual (120/600/391), collection (102/120), COGS (620/153). |
| **`purchasing`** | Supplier orders → goods receipt → bill → payment + inventory valuation. | Inventory quantity & unit cost (153), supplier balance *(source docs)*. | Purchase finalize (153/320/191), payment (320/102). |
| **`expenses`** | Operating spend capture, deductibility classification, approval gate. | Expense record + `deductible` flag (the one place deductibility is decided). | Expense accrual (770/771/320), payment. |
| **`partners`** (PCLE) | The differentiator. Shareholder/partner equity contributions, partner loans, and **legal dividend distribution under TTK 509/519 + GVK 94**. | **(1)** Partner capital-account balance, **(2)** distributable amount, **(3)** dividend net-of-stopaj. Exactly three. | Capital injection (102/500), partner loan (102/431), dividend declared (570/331), stopaj (331/360). |
| **`compliance`** | e-Fatura / e-Arşiv issuance + e-Defter (statutory book) export. The thing that makes Flowra a system of record, not a toy (P4). | GİB document UUID/status, e-Defter berat references. | Mirrors the sales invoice journal; no independent figures. |
| **`close`** | Period lifecycle: open → reconcile → lock. Runs the close checklist; computes & posts the corporate-tax accrual once, from the ledger. | Period state, period-end tax accrual *(reads the GL's tax base, posts it back)*. | Tax accrual (691/370), close entries. |
| **`governance`** | Board resolutions, approval workflows, audit hash-chain. Gates statutory actions (P3). A dividend cannot post without a linked resolution. | Resolution records, approval state, immutable audit chain. | No money — it *authorizes* postings (e.g. unlocks the dividend journal). |

---

### Tier 2 — VIEW SURFACES (4) — read-only, zero math of their own

| Module | Single responsibility | Reads from |
|---|---|---|
| **`statements`** | The one report surface: P&L, Balance Sheet, Cash Flow, KDV summary, executive summary. PDF/print. | `ledger` only. |
| **`cockpit`** | The adaptive home (P7): guided for owner, expert for CFO. KPI strip + alerts. | `ledger` + `alerts`. |
| **`alerts`** | Surfaces **sourced, ledger-derived facts** that need a decision (overdue AR, period unlocked, covenant breach, dividend-illegal-under-TTK-509). Every alert links to its source row. | `ledger`, `partners`, `close`. |
| **`simulation`** | Read-only what-if projections (pricing, debt pressure, distribution scenarios). Clearly labeled "projection, not record." | `ledger` snapshot (read-only). **Never posts.** |

---

## Direct answers

### (4) ESSENTIAL modules
`ledger` (the kernel), `sales`, `purchasing`, `expenses`, `partners` (PCLE — the differentiator), `compliance` (e-Fatura/e-Defter — P4, day one), `close`, `governance`, `statements`, `cockpit`, `alerts`, `simulation`. **Twelve.** Anything not on this list does not exist in V2.

### (5) Modules that should NOT exist
- **`situation engine`** — fabricated a 5-dimension weighted composite "score" on thin data. Pure vanity (P6). Gone.
- **`forecast engine`** as a *product surface* — V1's base/+15%/−20% sparkline pretended trailing-average guesses were a forecast. Folded into `simulation` and labeled honestly; no standalone tab.
- **`anomaly engine` + `duplicate-detector` + `ai-summary`** as a separate "AI Insight Layer" hub (`insights/`, `intelligence/`) — dissolve into `alerts` as concrete rules with sources, or delete. No "AI analysis" tab that nobody acts on.
- **`reconciliation.engine` as its own thing** — reconciliation is just `close`'s trial-balance check. Not a module.
- **Retail analytics** (cohort/RFM/market-basket) — never existed for this customer's real job. Never build.
- **`_ds` design-system route in prod**, `sales-flow` vs `sales` duplicate, `commercial` hub vs `sales`, `operations`/`ops` duplicate command centers, `documents` as a top-level tab — all deleted or merged below.

### (6) What should be MERGED
- **All capital-account code → `partners`.** V1's `lib/services/pcle/` (32 files) + `partner.service` + `partner-equity.service` + `partner-transaction.service` + `partner-crud.service` + `waterfall.service` collapse into ONE module owning 3 figures. Kill the duplicate pairs outright: `partner-risk` ∪ `partner-risk-composite` → one; `equity-waterfall` ∪ `equity-waterfall-distribution` → one; `dividend` ∪ `dividend-calculator` ∪ `dividend-ledger` → one; `capital-account` ∪ `capital-statement` ∪ `partner-capital-statement` → one; `amortization` ∪ `amortization-schedule` → one.
- **Two report packs → one `statements`.** V1 had `app/dashboard/reports/` AND `app/dashboard/cfo/_tabs/BoardPackTab` + a "CFO Pack API." One pack, reading the ledger.
- **Two governance homes → one `governance`.** V1 had `governance/` AND approval/audit logic scattered in `admin/`, `cfo/period-close`, `workflow`.
- **Tax computation → one path in `ledger`/`close`.** Kill `finance/_tabs/CorporateTaxTab` + `cfo/tax/` + `cfo-metrics.ts` + `financial-summary` triple-derivation.
- **`finance` hub (~40 sub-tabs) + `cfo` hub → fold into `statements` + `close` + `cockpit`.** The 40 `_tabs/_*` folders (EBITDA, CCC, WC-optimizer, attribution, product-mix, sensitivity…) are *views*, not modules — they become at most labeled cards on `statements`, and most get deleted as analytics nobody acts on.
- **`sales` + `sales-flow` + `commercial` + `proformas` + `orders`(sell-side) + `collections` → one `sales` module** (one lifecycle, one tab — P5).
- **`operations` + `ops` + `tasks` → fold into `cockpit`/`alerts`.** A standalone ops command center is just today's action list.
- **`stocks` + `catalog` + `purchases` + `purchase-orders` → `purchasing`.**

### (7) What should be SPLIT
Very little — V2's problem will be the opposite of V1's. Two real splits:
- **Split `ledger` (kernel) from `statements` (views).** They were tangled in V1 (statements ran off "parallel aggregators with silent row caps," per the principles). Hard wall: posting logic vs read projections. This is the single most important boundary in the system.
- **Inside `partners`, split *equity* from *debt*.** A partner *contribution* (TTK 500-series equity) and a partner *loan* (431-series liability, GVK 94 interest) are genuinely different legal instruments with different tax treatment. One module, two clearly-separated sub-domains — but not the 32-way explosion V1 did.

Beyond these, resist splitting. V1's pain came from over-splitting (32 PCLE files), not under-splitting.

### (8) What I would NEVER build again
- **The "situation engine" / composite scores** — confidence theater on empty data. The product's credibility died here.
- **8 distribution/dividend tabs** — one workflow: *compute distributable from ledger → check TTK 509/519 → board resolution → atomic post → stopaj*. One screen.
- **Two of anything** — two report packs, two governance homes, two tax engines, two balance sheets, two capital-account services, two ops centers, `sales` vs `sales-flow`. Two = a guarantee they'll disagree.
- **A dormant/shadow GL** — V1 shipped a GL that did nothing while statements ran off aggregators. V2's GL is primary on commit #1 or it isn't built.
- **40 analytic sub-tabs** (RFM, cohort, market-basket, attribution, product-mix sensitivity) — analytics a 5–50-person KOBİ never acts on. Every figure must be sourced and acted-upon (P6).
- **Redirect-only stub pages and a `_ds` route in prod** — navigation debt masquerading as features.
- **Owner-typed financial inputs that "prove" legality** — never again let a human type the net-income that gates a TTK 509 dividend. It's computed from the ledger or it doesn't happen (P3).

**Key decisions:**
- 12 modules total, organized in 3 tiers: 1 Kernel (Ledger), 7 Capability modules, 4 read-only View surfaces. Everything financial is a view over the Kernel.
- The Ledger Kernel is the single owner of EVERY canonical financial figure (net income, tax base, balances, cash). No other module computes money — they post journals or read posted journals.
- Collapse V1's 32-file lib/services/pcle/ + 4 top-level partner services into ONE Partner Capital (PCLE) module with exactly 3 canonical figures (capital account balance, distributable amount, dividend net-of-stopaj).
- DELETE the entire 'intelligence/situation/forecast/anomaly' engine tier — it fabricated scores on thin data (violates P6). Replace with a thin, sourced Alerts module that only surfaces ledger-derived facts.
- ONE report surface (Statements module reading the ledger), not V1's two report packs (reports/ + cfo/). ONE governance home, not two.
- Compliance (e-Fatura/e-Arşiv/e-Defter) is an ESSENTIAL day-one module, not a phase-8 nicety — without it Flowra is a toy (P4).
- Simulation/what-if is a pure read-only projection module that may NEVER post to the ledger or claim to be a forecast of record.


---

## FLOWRA V2 Accounting Architecture — the statutory core (Tek Düzen GL as PRIMARY, periods+lock, statements as pure reads, KDV + one Kurumlar matrah kernel, FX with real rate source, period-close/retained-earnings waterfall, CI reconciliation enforcing ONE canonical figure).

## DELIVERABLE 4 — FLOWRA V2 ACCOUNTING ARCHITECTURE

> The accounting core is not a feature of Flowra V2. It **is** Flowra V2. Every other domain (PCLE, dividends, planning, dashboards) is a read-model or an action that posts into this core. If a number cannot be traced to a posted journal line, it does not exist.

This section is written against concrete V1 failures I verified in the repo, not hypotheticals. The smoking guns are cited inline.

---

### 0. What V1 actually did (verified) — and what I will never repeat

| V1 reality (file) | Why it killed the product | V2 rule |
|---|---|---|
| `lib/services/tax.service.ts` computed matrah as `revenue_try - cost_try - deductible_expenses_try` **directly from aggregated columns** — the GL was never read (line 233). | Matrah was a parallel aggregator, not a ledger read. Two paths → two truths. | Matrah is a **pure read off posted GL balances**. No service re-sums source rows. |
| That same formula has **no `+ KKEG` term**. Kanunen Kabul Edilmeyen Gider was structurally absent from the tax base. | The statutory matrah was *wrong by construction* — understated tax, illegal filing. | KKEG is a first-class GL dimension (`950/951` nazım or a `kkeg` flag on the line) and is **added back** in the one kernel. |
| `lib/services/finance/tax-compliance.service.ts` + `lib/services/tax/tax-reserve.service.ts` + `lib/services/tax/tax-compliance.service.ts` + `lib/services/tax.service.ts` — **four** tax services. | P1 violation: 3+ net-income / tax paths that drift. | **One** `kernel/` package. Services are deleted; there are pure functions + one posting boundary. |
| No FX service exists anywhere. Conversion was inline `Number(r.fx_rate ?? 1)` (`tax.service.ts:337`). | The exact **1:1 fallback** P-FX forbids. A missing rate silently became parity → fabricated TRY figures. | FX rate is a **required posted attribute**; absence is a **hard error**, never 1.0. |
| Only **one** journal migration (`20260526000002_journal_voucher_numbers.sql`) for a 1076-line journal service. | The GL was bolted on late and ran in shadow while statements read aggregators (P2 violation, "dormant GL"). | GL ships in **migration 0001**. There is no pre-GL state of the app. |
| `590 Dönem Net Kârı` existed as a CoA row but net income was typed/aggregated elsewhere. | Owner-typed net income "proved" TTK 509 dividend safety (P3 violation). | `590` is **only** ever written by the period-close engine from posted P&L. Nobody can type it. |

---

### 1. Chart of Accounts — Tek Düzen Hesap Planı (MSUGT)

**Decision: the CoA is data in Postgres, seeded per company, not a hardcoded TS array.** V1's `lib/accounting/chart-of-accounts.ts` was a 64-account hardcoded list — fine as a *seed*, fatal as the *source of truth* (you can't add a sub-account `120.01 Müşteri A` without a deploy). V2 splits:

- `coa_template` — the **statutory skeleton** (1-3 digit ana hesaplar), versioned, shipped by Flowra, MSUGT-canonical.
- `account` — the company's live tree: `(company_id, code, parent_code, name_tr, account_class, normal_balance, is_postable, is_cash, kdv_role, fx_currency)`. Leaf accounts (`is_postable=true`) are the only things a journal line may reference; ana hesaplar are roll-up only.

**Code structure (Tek Düzen):** 1=Dönen Varlıklar, 2=Duran Varlıklar, 3=KV Yabancı Kaynaklar, 4=UV Yabancı Kaynaklar, 5=Özkaynaklar, 6=Gelir Tablosu (60 satış / 62 SMM / 63 faaliyet gid. / 64 diğer faaliyet / 65 diğer / 66 finansman / 69 dönem kâr-zarar), 7=Maliyet (7/A — `740/750/760/770/780` + `79x yansıtma`), 9=Nazım. V1 collapsed `7` into a flat "operating_expense" class and skipped `79x yansıtma` and `9xx nazım` entirely — that breaks both the gider/maliyet distinction and KKEG tracking.

**Hard-wired statutory accounts V2 requires (a superset of V1's list, with the gaps filled):**

| Code | Hesap | Role added vs V1 |
|---|---|---|
| `120/320` | Alıcılar / Satıcılar | — |
| `136/336` | Diğer çeşitli alacak/borç | partner current-account (PCLE) lives here, not a fake `321` |
| `191 / 391` | İndirilecek KDV / Hesaplanan KDV | — |
| `190 / 392` | Devreden KDV / Diğer KDV | **was missing** — devreden had no home |
| `360 / 368` | Ödenecek Vergi ve Fonlar / Vadesi Geçmiş | — |
| `193 / 371` | Peşin ödenen vergiler / Dönem kârı peşin ödenen vergi karşılığı | geçici vergi mahsubu — **was missing** |
| `370 / 691 / 692` | Dönem Kârı Vergi Karşılığı / Dönem Kârı Vergi Karşılığı / Dönem Net Kâr-Zarar | the close waterfall — V1 only had `590` |
| `540 / 541 / 542` | Yasal / Statü / Olağanüstü Yedekler | legal reserves (TTK 519) — V1 had only one `542` |
| `570 / 580 / 590 / 591` | Geçmiş Yıl Kârları / Zararları / Dönem Net Kârı / Dönem Net Zararı | full retained waterfall |
| `646/656 / 780` | Kambiyo Kârları / Zararları / Finansman Gid. | FX P&L gets **real accounts**, not inline `?? 1` |
| `950/951` | Nazım — KKEG | so KKEG is *posted*, not a comment |

---

### 2. The double-entry GL as PRIMARY

**Three tables, append-only, balanced-by-constraint.**

```
journal (header)          journal_line (detail)            posting_event (provenance)
─────────────────         ─────────────────────            ──────────────────────────
id                        id                               id
company_id                journal_id  →                    source_domain  (sales|purchase|payroll|fx|close|manual|dividend|tax)
period_id     →           account_id  →                    source_id      (the sale/invoice/resolution that caused this)
journal_no                debit_try   NUMERIC(18,2)         idempotency_key  UNIQUE(company_id, …)
journal_date              credit_try  NUMERIC(18,2)         created_by, created_at
status (draft|posted|     fx_currency, fx_amount,
        reversed)         fx_rate, fx_rate_source           Every journal is born from exactly one posting_event.
description               kkeg BOOLEAN                      No journal exists without provenance.
reversed_by_journal_id
```

**Invariants, enforced in the database, not in app code (V1 enforced balance in TS and it drifted):**

1. **Balance:** a deferred trigger on `journal` rejects `posted` status unless `SUM(debit_try) = SUM(credit_try)` to the cent. Unbalanced cannot be posted, ever.
2. **Immutability:** `posted` and `reversed` rows are blocked from `UPDATE/DELETE` by a row-level trigger. **Corrections happen only by reversing journal** (a new journal that negates the original, linked via `reversed_by_journal_id`). This is the e-Defter / TTK reality: you never erase a posted entry.
3. **Period gate:** `journal_date` must fall inside an `open` period (see §3). Posting into a locked period is rejected at the DB layer.
4. **FX integrity:** if `fx_currency <> 'TRY'` then `fx_rate IS NOT NULL AND fx_rate_source IS NOT NULL` and `debit_try/credit_try` must equal `ROUND(fx_amount * fx_rate, 2)`. A `NULL` rate is a constraint violation — **the 1:1 fallback is structurally impossible.**

**Who posts — exactly two doors, no more:**

- **The Posting Service (`kernel/posting.ts`)** — the *only* code with INSERT rights on `journal`. Every domain event (a sale confirmed, a purchase recorded, payroll run, a dividend resolution executed, an FX revaluation, a period close) calls `post(event)` with a balanced set of lines + an idempotency key. Domains **describe** the entry via posting rules; they never write SQL. RLS denies INSERT on `journal` to every role except the posting service's security-definer function.
- **Manual journal (the accountant)** — a guided UI that still routes through the *same* `post()` boundary, with `source_domain='manual'`, dual-entry validation, and a mandatory reason. No raw SQL path exists for humans.

**Posting rules are declarative.** A sale of 1.000 TL + %20 KDV is not hand-coded in the sales screen; it's a rule:

```
SALE_DOMESTIC:  Dr 120 Alıcılar           1.200
                Cr 600 Yurt İçi Satışlar   1.000
                Cr 391 Hesaplanan KDV        200
```

Rules live in one `posting-rules/` registry. This is how P1 holds: the sales screen has no idea what a KDV account is — it emits a `SaleConfirmed` event and the rule does the accounting.

---

### 3. Accounting periods, write-time LOCK, adjustment workflow

```
period (company_id, code 'YYYY-MM' or fiscal qtr, status, locked_at, locked_by)
status ∈ { open, soft_closed, locked, audit_locked }
```

- **open** — normal posting.
- **soft_closed** — month-end review; new operational postings blocked, but **adjustment journals** (accruals, depreciation, reclass) still allowed by the close-authority role. This is the realistic accountant workflow V1 lacked entirely (V1 had no period concept → you could post into January in December).
- **locked** — KDV beyannamesi filed / books finalized. **Zero** new journals. Enforced at write time by the period-gate trigger (§2.3), not by UI hiding a button.
- **audit_locked** — e-Defter berat alındı. Cryptographically sealed (period hash over all journal lines). Any tampering breaks the hash chain (this is the audit-chain work already started per commit `729c4c1`).

**Adjustment workflow (the legal-by-construction part, P3):** to change anything in a `locked` period you must **re-open with a reason**, which itself posts an audit event, drops the period to `soft_closed`, and **invalidates any filed beyanname** downstream (forces a düzeltme beyannamesi flag). You cannot silently mutate filed numbers. Reversing journals are the only correction mechanism; the original line stays visible forever.

---

### 4. Financial statements — pure reads, zero arithmetic of their own

**The statements are SQL views (or view-equivalent kernel functions) over `journal_line`. They contain no business logic, no row caps, no parallel aggregation.** This is the direct antidote to V1, where statements read aggregators with "silent row caps" and the GL sat dormant.

- **`balance_view(company_id, period)`** — the single primitive: signed TRY balance per account as of a date, `SUM(debit_try - credit_try)` over posted lines in open∪closed periods ≤ date. **Everything below is a grouping of this one view.**
- **Bilanço** = `balance_view` grouped by `account_class` at period-end. Asset side vs (Liability+Equity) side **must equal to the cent** — a CI assertion, not a hope.
- **Gelir Tablosu** = `balance_view` over class `6`/`62`/`63`/`64`/`65`/`66` for the period range. Brüt satış → net satış → brüt kâr → faaliyet kârı → dönem kârı, each a sum of leaf accounts. **Dönem net kârı here must equal account `590` after close** (CI assertion #2).
- **Nakit Akış** — **direct method** off `is_cash` accounts (`100/101/102/103/108`): cash flow = movements on cash accounts, classified into işletme/yatırım/finansman by the *counter-account class* of each cash journal line. No indirect-method guesswork, no separate cash table to drift. (V1 tagged `is_cash` on accounts but never built the counter-account classification — so its cash flow was a vibe.)

Because all three read `balance_view`, **they cannot disagree.** V1 died of "two balance sheets that disagreed"; here there is one `balance_view` and two balance sheets is not expressible.

---

### 5. KDV — output, input, devreden, tevkifat

KDV is **posted**, then **read**, never recomputed from invoices at filing time.

| Concept | Account | When posted |
|---|---|---|
| Hesaplanan KDV (output) | `391` (Cr) | every sale, by posting rule |
| İndirilecek KDV (input) | `191` (Dr) | every deductible purchase |
| Tevkifat (withholding, alıcı sorumluluğu) | `360.xx` ödenecek + reduced `191` | tevkifatlı alış rule — split the KDV: the withheld portion is a payable to the state, only the residual is indirilebilir |
| Devreden KDV | `190` | the **monthly KDV close** posts the carryover |

**Monthly KDV close (one kernel function `kdvBeyanname(period)`):** reads `391` (output) and `191`/`190` (input + prior devreden) off the GL, computes `ödenecek = output − (input + devreden_prev)`. If positive → post to `360 Ödenecek KDV`; if negative → the surplus rolls to `190 Devreden KDV` next period. The Beyanname-1 form is a **read of these posted balances**, never a re-sum of raw invoices. Tevkifat-2 beyanname reads the `360.tevkifat` sub-balances. This guarantees the filed KDV equals the books — the most common KOBİ audit failure is exactly the books≠beyanname gap, which V2 makes impossible.

---

### 6. Kurumlar Vergisi — ONE matrah kernel

A single pure function. There is no second tax path in the entire codebase (CI forbids it — §8).

```
kernel/matrah.ts
─────────────────────────────────────────────────────────────
ticariKar      = GelirTablosu.donemKari            // pure read off GL (acct 690), NET of KDV by construction
+ KKEG         = SUM(journal_line WHERE kkeg=true) // added BACK — the term V1 was missing entirely
− istisnalar   = SUM(exemption-flagged income)     // iştirak kazancı, vb.
− gecmisZarar  = min(prior 580 within 5 yrs, base) // statutory loss carry-forward, 5-year cap
= matrah
vergi          = max(matrah, 0) × kurumlarVergisiOrani(period)   // rate is period-dated, not a constant
```

Three things V1 got structurally wrong that this fixes:

1. **`ticariKar` is read from the GL** (`690 Dönem Kâr/Zararı`), not re-aggregated from revenue/cost columns. One source.
2. **`+ KKEG`** is present and sourced from posted `kkeg=true` lines — not a TS comment, not absent.
3. **Revenue is net-of-KDV automatically** because `600` never contained KDV (it went to `391`). V1's column-math risked double-counting; ledger-sourcing eliminates the class of bug.

The computed `vergi` **posts back**: `Dr 691 Cr 370 Dönem Kârı Vergi Karşılığı`, with geçici vergi (`193`) mahsup. The CFO tax screen is a **read** of `370` + the kernel's working — it cannot type a different number (P3: no owner-typed net income proves anything).

---

### 7. FX — a real rate source, never 1:1

A dedicated `fx_rate` table and `kernel/fx.ts`. **There is no `?? 1` anywhere — it is lint-banned.**

```
fx_rate (currency, rate_date, buying, selling, source 'TCMB', fetched_at)
```

- **Source:** TCMB (Merkez Bankası) daily bulletin, fetched by a cron, stored immutably. Döviz alış/satış per TCMB; statutory revaluation uses the period-end TCMB rate.
- **Posting:** every non-TRY journal line freezes `(fx_amount, fx_rate, fx_rate_source)` at post time (historical snapshot, honored forever — never re-evaluated, matching the one correct instinct V1 had in its comment).
- **Missing rate = hard stop.** If TCMB has no rate for `rate_date` (weekend/holiday), the kernel uses the **last published rate with an explicit `rate_date` stamp** and surfaces it; it never invents 1.0. A posting whose currency lacks any rate **fails** — the user sees "TCMB kuru bulunamadı", not a silently wrong TRY total.
- **Period-end revaluation (kur değerleme):** monthly close revalues open FX monetary balances (`120/320/102` in foreign currency) to period-end TCMB rate, posting the delta to `646 Kambiyo Kârı` / `656 Kambiyo Zararı`. Realized FX on settlement posts to the same accounts. This is a posted journal, so it flows into matrah correctly.

---

### 8. Period-close & retained-earnings waterfall (TTK)

`kernel/close.ts` runs as **one atomic transaction** (P3: atomic, reversible). Order matters and is fixed:

```
1.  Accruals/depreciation adjustment journals (soft_closed window)
2.  KDV monthly close            → 190/360         (§5)
3.  FX revaluation               → 646/656         (§7)
4.  Close P&L → 690:  Dr 6xx-revenue / Cr 690 ; Cr 6xx-expense / Dr 690
5.  Kurumlar matrah kernel       → vergi           (§6)
6.  Tax provision:    Dr 691 / Cr 370              (geçici vergi 193 mahsup)
7.  690 → 692 Dönem Net Kâr/Zarar (after-tax)
8.  692 → 590 (kâr) or 591 (zarar)                 ← the ONLY writer of 590
─── year-end only ───
9.  590 → 570 Geçmiş Yıl Kârları   (or 591 → 580 Geçmiş Yıl Zararları)
10. Mahsup 580 prior losses against current 570 profit first
11. TTK 519 legal reserve:  %5 → 540 until 540 reaches %20 of 500 (genel kanuni yedek)
12. Remaining 570 distributable = the ceiling PCLE/dividend engine reads for TTK 509
13. Lock the period (audit_lock at year-end → e-Defter berat)
```

**The retained-earnings figure that the dividend engine consumes is the post-step-12 `570` balance** — computed by this waterfall, off the ledger, gated by board resolution. An owner can never type it. `580` prior-loss mahsup happens *before* any reserve or distribution, exactly per TTK. This is the PCLE differentiator done legally instead of theatrically.

---

### 9. How "ONE canonical figure" is mechanically enforced (P1)

Not by discipline — by CI gates that fail the build:

1. **Single-kernel lint:** a CI rule asserts that `matrah`, `donemNetKari`, `kdvOdenecek`, and `balance_view` are each `import`-ed from exactly one module. A second file exporting a function named `*matrah*` / `*netIncome*` **fails CI** (directly prevents the four-tax-service mess I found in V1).
2. **Reconciliation test (`recon.test.ts`), run in CI on seeded + production-shaped fixtures:**
   - `Bilanço.assets == Bilanço.liabilities + Bilanço.equity` (to ₺0.00)
   - `GelirTablosu.donemNetKari == balance_view('590')` after close
   - `Σ journal_line.debit_try == Σ journal_line.credit_try` (global trial balance = 0)
   - `KDVBeyanname.odenecek == balance_view('360.kdv')`
   - `Matrah.ticariKar == GelirTablosu.donemKari` (the tax engine and the income statement read the *same* number)
   - **Every figure shown on any screen resolves to a `balance_view` call** — a render-time assertion in dev that flags any financial number without a GL provenance id (P6: truth over vanity; no figure on empty data).
3. **No-fallback lint:** `?? 1` / `|| 1` adjacent to `rate`/`fx` is a banned pattern (the literal V1 bug at `tax.service.ts:337`).
4. **Posting-only-door test:** a test asserts no module except `kernel/posting.ts` references `INSERT INTO journal`.

If any reconciliation drifts by a cent, the build is red and nothing ships. That is the entire philosophy: **disagreement between two financial numbers becomes a compile/CI error, not a customer-discovered catastrophe.**

---

### 10. One-paragraph summary for the founder

The ledger is the product. Migration 0001 creates a balanced-by-constraint, append-only, period-gated, FX-real double-entry GL. Every domain posts through one door with declarative rules; every statement, KDV beyanname, and the single Kurumlar matrah kernel are **pure reads** off `balance_view`; period close is one atomic TTK-correct waterfall that is the *only* writer of net income and retained earnings; and CI fails the build the instant any two figures disagree or any FX rate falls back to 1. V1 had four tax services, a dormant GL, a `?? 1` FX fallback, a matrah formula missing KKEG, and an owner-typeable net income. V2 makes every one of those a structural impossibility.

**Key decisions:**
- GL ships in migration 0001 as PRIMARY — there is no pre-ledger state; balance, immutability, period-gate, and FX-integrity are DB constraints/triggers, not TS checks (V1 enforced in TS and it drifted).
- CoA = versioned statutory template + per-company editable account tree in Postgres (not V1's hardcoded TS array); only is_postable leaf accounts accept journal lines; full Tek Düzen incl. 7/A maliyet, 79x yansıtma, 9xx nazım for KKEG.
- Exactly two posting doors — kernel/posting.ts (declarative rules per domain event) and a guided manual-journal that routes through the same boundary; RLS denies journal INSERT to everyone else; corrections only via reversing journals.
- All three statements (Bilanço, Gelir Tablosu direct-method Nakit Akış) are pure groupings of one balance_view; they cannot disagree by construction.
- ONE matrah kernel: ticariKar (GL read) + KKEG (posted, the term V1 omitted) − istisna − 580 prior loss (5yr cap) → tax posts back to 691/370; CFO screen can only read it, never type it.
- FX has a TCMB-sourced immutable fx_rate table; non-TRY lines freeze rate+source at post; missing rate is a hard stop; ?? 1 fallback is lint-banned (V1's literal bug at tax.service.ts:337).
- Period close is one atomic TTK waterfall and the ONLY writer of 590/570: P&L→690→692→590, year-end 590→570, 580 mahsup first, TTK 519 %5→540 legal reserve, residual 570 = dividend ceiling.
- 'One canonical figure' enforced by CI: single-kernel import lint, a recon.test.ts asserting balance-sheet/trial-balance/net-income/KDV/matrah all tie to the cent, and a no-fallback lint — disagreement becomes a red build.


---

## FLOWRA V2 GOVERNANCE ARCHITECTURE — resolution model, legal-by-construction dividend workflow, capital calls/commitments, HMAC-keyed audit chain, and PCLE partner-financing as one coherent ledger-backed subsystem.

# DELIVERABLE 5 — FLOWRA V2 GOVERNANCE ARCHITECTURE

> **Thesis.** Governance is not a tab. It is the *legality membrane* around the ledger. Every statutory action — a dividend, a capital call, a reserve transfer — is a **state machine that ends in a balanced journal entry**, and cannot start without an approved resolution and a kernel-computed figure. The owner never types a number that has legal force. The system computes it from the posted GL (P1, P2) and the only decision a human makes is *approve / reject*, recorded in a tamper-evident chain.

This subsystem has **five organs that share one bloodstream (the GL)**:

| Organ | Job | Ends in GL? |
|---|---|---|
| **Resolution** | Records the board/assembly *decision* that authorizes a statutory act | No (it's authorization) |
| **Dividend engine** | Computes distributable profit, gates on resolution, posts atomically | Yes — balanced JE |
| **Capital (PCLE)** | Capital accounts, commitments, calls, partner loans, equalization, returns | Yes — every movement |
| **Audit chain** | HMAC-keyed hash chain over every governance mutation | Is the proof layer |
| **Reserve engine** | TTK 519 mandatory reserves, auto-computed pre-distribution | Yes — balanced JE |

---

## 0. What V1 did that V2 will NEVER repeat (named, with the file)

I read V1's live `app/api/partners/dividend/declare/route.ts`. It is a museum of the exact failures P1–P7 exist to prevent. Each is banned by construction:

1. **Two declaration paths in one route ("Pattern A workflow" + "Pattern B legacy batch insert").** Pattern B (lines 83–252) lets an admin POST `{ declarations: [...] }` with **client-supplied `gross_try`, `withholding_try`, `net_try`** and inserts them directly, *bypassing the resolution workflow entirely*. This is the "dividend path bypassing approval." **V2: there is exactly one entry point and it is impossible to supply the figures — they are computed server-side from the ledger.** No `declarations` array ever crosses the wire.

2. **The zero-revenue escape hatch (lines 156, 210–214).** V1's own comment: *"If the financial data query fails… we allow the declaration to proceed with a non-blocking warning — startup companies with no revenue history should not be blocked."* A failed profit query → **distribution allowed**. This is fail-open on the single most dangerous statutory action. **V2 fails CLOSED, always.** No revenue history → distributable profit is provably ₺0 → declaration blocked. There is no "non-fatal" path.

3. **Typed / proxy net-income (lines 147–209).** V1 computes a "YTD net income estimate" inline by summing the `sales` and `expenses` tables (a *parallel aggregator*, exactly the P2 sin) with a hardcoded COGS-less proxy and a magic `FINANCING` exclusion set. This figure has no relationship to the balance sheet. **V2: distributable profit comes from one kernel reading posted GL balances. There is no second number to disagree with it.**

4. **Non-atomic sequential insert loop (lines 216–247).** "*Not true DB-level atomicity… first failure aborts the rest*" — leaving N partial dividend rows written and N unwritten. A half-distributed dividend is a legal catastrophe. **V2: one Postgres function, one transaction, all-or-nothing.**

5. **Best-effort audit.** V1's `audit-trail` route is a *read model* (`GovernanceService.getReport`) with a "governance health score" — analytics over logs that may or may not exist, with no integrity guarantee. **V2's audit chain is a write-side invariant enforced by a DB trigger with an HMAC hash chain; you cannot mutate governance state without appending a verifiable link.**

6. **Sprawl.** V1 ships ~25 `app/api/partners/*` dividend/equity/loan/capital/interest routes (`dividend-calculator`, `dividend-ledger`, `dividend/calculate`, `dividend/declare`, `distribution-simulator`, `equity-waterfall`, `equity-waterfall-distribution`…) — multiple calculators for one figure (P1, P5 violation). **V2 PCLE is ONE service, ONE kernel, a handful of read-views.**

---

## 1. The Resolution Model (Genel Kurul / Yönetim Kurulu kararları)

A **resolution** is the digital record of a corporate decision with legal authority. It is the *authorization token* every statutory action must redeem. It does not compute anything; it does not post to the GL. It is consumed exactly once.

```
resolution
├─ id                uuid pk
├─ company_id        uuid       -- RLS tenant
├─ kind              enum  GENEL_KURUL | YONETIM_KURULU
├─ subject           enum  DIVIDEND_DISTRIBUTION | CAPITAL_CALL | CAPITAL_INCREASE
│                          | RESERVE_ALLOCATION | PERIOD_CLOSE | LOSS_CARRY | OTHER
├─ status            enum  DRAFT → PROPOSED → APPROVED → CONSUMED | REJECTED | VOIDED
├─ meeting_date      date       -- TTK quorum context
├─ payload_hash      bytea      -- sha256 of the EXACT computed figures presented at approval
├─ payload_snapshot  jsonb      -- frozen kernel output the board actually saw (immutable)
├─ quorum_meta       jsonb      -- attendance, share %, TTK 418/421 quorum proof
├─ consumed_by       uuid       -- the action_id that redeemed it (1:1)
├─ consumed_at       timestamptz
└─ created_by / approved_by / rejected_by  uuid
```

**The binding invariant (this is the whole point).** When a resolution is APPROVED, we freeze `payload_snapshot` = the *exact kernel output* the board approved, and store `payload_hash`. When the dividend action later redeems the resolution, the engine **recomputes from the current ledger and compares the new hash to `payload_hash`**. If the ledger moved between approval and execution (a late invoice, a reversed expense), the figures differ, **the hashes mismatch, and execution is refused** with `LEDGER_DRIFT`. The board approved ₺X distributable; you may not distribute against a different ₺X. This kills "approved Tuesday, ledger changed Wednesday, distributed Thursday" silently.

**Quorum-by-construction.** `subject` drives the required `kind` and quorum rule (e.g. dividend distribution → GENEL_KURUL, TTK 421 ordinary quorum). A resolution whose `quorum_meta` does not satisfy the rule for its subject cannot leave PROPOSED. Capital increase requires the elevated quorum; the state machine enforces it.

**Single-use.** `consumed_by` is a unique FK. A resolution authorizes **one** action. You cannot run two dividends off one board decision.

---

## 2. The DIVIDEND Workflow — Legal-by-Construction

### 2.1 The one canonical figure: distributable profit

There is **one** function, `computeDistributable(company_id, period_id)`, reading **only posted GL balances** (P1, P2). It is pure given the ledger snapshot. Pseudocode of the statutory waterfall (MSUGT/Tek Düzen account refs):

```
netProfitAfterTax   = balance(590 Dönem Net Kârı)          -- post-tax, from the ledger
prevLosses          = balance(580 Geçmiş Yıllar Zararları)  -- mandatory offset (TTK)
legalReserveI       = ttk519_first(netProfitAfterTax)       -- %5 until 540 reaches %20 of capital
profitAfterLossesAndLegalI = netProfitAfterTax - prevLosses - legalReserveI

firstDividend       = ttk509_first(paidInCapital)           -- %5 of paid-in capital (statutory floor logic)
legalReserveII      = ttk519_second(distributionsAbove5pct) -- %10 of the part exceeding the 1st dividend
distributableProfit = max(0, profitAfterLossesAndLegalI - legalReserveII)   -- NEVER negative
```

Every term is a `balance(account)` call against posted journals. **No `sales` table sum. No `expenses` proxy. No COGS guess.** If the GL has no posted period-close entry producing a 590 balance, `netProfitAfterTax = 0` → `distributableProfit = 0` → **declaration is mathematically blocked.** That is the zero-revenue case, handled by *correct arithmetic*, not an escape-hatch `if`.

### 2.2 The state machine

```
CALC ──► PROPOSED ──► RESOLVED ──► DECLARED ──► (PAID) 
  │         │            │            │
  │         │            │            └─► VOIDED (reversal JE)
  │         └─► REJECTED └─► EXPIRED (resolution drift)
  └─ pure read of ledger; produces snapshot
```

1. **CALC** — `computeDistributable` runs. Returns `{ distributable, components, blocking_reasons[] }`. If `blocking_reasons` non-empty (losses unrecovered, reserve floor unmet, no posted profit), the UI shows *why* and offers no "declare" button. This is a **read**; it writes nothing.
2. **PROPOSE** — admin proposes a gross amount `G`. Hard gate: `G ≤ distributable`. Cannot propose more (see §2.4). Creates the dividend in PROPOSED + an attached DRAFT `resolution(subject=DIVIDEND_DISTRIBUTION, kind=GENEL_KURUL)`.
3. **RESOLVE** — the assembly approves the resolution. Snapshot + hash frozen. Dividend → RESOLVED. Requires `requireRole('admin')` *and* a distinct `approved_by` (segregation: proposer ≠ sole approver where policy demands).
4. **DECLARE** — the **atomic** step (§2.3). Redeems the resolution, recomputes, hash-checks, posts the journal, computes per-shareholder GVK 94 stopaj, writes the audit link. One transaction.
5. **VOID** — reversal path (§2.5).

### 2.3 Atomic declaration (one Postgres function, one transaction)

```sql
-- declare_dividend(p_dividend_id, p_resolution_id, p_actor) RETURNS dividend_result
-- Runs in a SINGLE transaction. SECURITY DEFINER, company_id pinned from session.
BEGIN
  SELECT ... FOR UPDATE;                     -- lock dividend + resolution rows
  ASSERT resolution.status = 'APPROVED';     -- else raise UNAUTHORIZED_NO_RESOLUTION
  ASSERT resolution.subject = 'DIVIDEND_DISTRIBUTION';
  ASSERT resolution.consumed_by IS NULL;     -- single-use

  recomputed := compute_distributable(company_id, period_id);
  ASSERT sha256(recomputed) = resolution.payload_hash;   -- else LEDGER_DRIFT → abort

  ASSERT gross <= recomputed.distributable;  -- belt-and-suspenders over-distribution guard

  -- 1) post the balanced journal (P2): debit 570/590 distribution, credit 331 ortaklara borçlar
  -- 2) post mandatory reserves to 540/548 if not yet posted
  -- 3) per shareholder: stopaj = gvk94_rate(shareholder_type) * gross_share
  --    credit 360 Ödenecek Vergi (stopaj), credit 331 net to partner capital/loan account
  -- 4) UPDATE resolution SET status='CONSUMED', consumed_by=action_id
  -- 5) INSERT audit_chain link (trigger enforces hash chain)
  COMMIT;   -- all-or-nothing. No partial dividend can exist.
EXCEPTION WHEN OTHERS THEN ROLLBACK;
END;
```

**GVK 94 stopaj** is computed *per shareholder* inside the same transaction from the shareholder's tax classification (resident real person → 15% withholding per current GVK 94/6-b; resident corporate → 0% intercompany; non-resident → treaty/DTT rate). The rate table is versioned (`tax_rate(effective_from, rate, basis)`) so a 2026 distribution uses the 2026 rate even if run later (P6: real, sourced, dated).

### 2.4 How the owner is PREVENTED from over-distributing — four independent walls

An over-distribution must pass **all four** to occur. It cannot pass even one:

| Wall | Where | What it blocks |
|---|---|---|
| **W1 — no figure to type** | API contract | The declare endpoint accepts only `{ dividend_id, resolution_id }`. There is **no amount field on the wire**. The gross is read from the PROPOSED row, which was itself bounded at propose-time. V1's `gross_try` client field does not exist. |
| **W2 — propose-time ceiling** | App service | `propose(G)` rejects `G > distributable` (kernel figure). |
| **W3 — resolution drift check** | DB function | Recompute-and-hash-compare at declare time. Ledger moved → abort. |
| **W4 — DB CHECK + reserve trigger** | Postgres | A `CHECK` and a `BEFORE INSERT` trigger on the distribution journal assert `sum(distribution) ≤ balance(distributable accounts)` and that 540/548 reserves are posted first. Even a hand-rolled SQL INSERT cannot violate it. |

Because distributable profit is `max(0, …)`, **negative-profit and zero-revenue companies have a ceiling of ₺0** — they are blocked by arithmetic, not by an optional check that can fail-open.

### 2.5 Reversal / void path

A declared dividend is reversed by `void_dividend(dividend_id, void_resolution_id)` — itself requiring an APPROVED resolution (subject=DIVIDEND_DISTRIBUTION, a void carries a flag). It posts the **inverse balanced journal** (we never delete the original; the original + its reversal both remain in the GL — auditable), restores the consumed source resolution's accounting effect, sets dividend → VOIDED, and appends an audit link `kind=DIVIDEND_VOID` referencing the original action hash. Stopaj already remitted to the tax authority is handled as a separate receivable, not silently erased.

---

## 3. PCLE — Partner/Shareholder Capital & Loan model (the differentiator, kept)

PCLE is **one service** over a small set of ledger-backed tables. Every partner-money movement is a posted journal; the "capital account" is a *view* over the GL, never an independent tally (P1/P2).

```
shareholder            -- id, company_id, type (real/corporate/non-resident), tax_class, share_pct
commitment             -- pledged capital: shareholder_id, amount, currency, schedule, status
capital_call           -- a demand against commitments: resolution_id (required), due_date, allocations[]
capital_account_entry  -- VIEW over GL: contributions(500), withdrawals, dividends(331), equalization
partner_loan           -- shareholder→company loan: principal, rate, schedule (TTK 358 örtülü sermaye aware)
loan_movement          -- draw / repayment / accrued interest — each a posted JE (331/780 etc.)
```

**Capital commitments & calls.** A `commitment` is a pledge (TTK sermaye taahhüdü). A `capital_call` **requires an APPROVED resolution** (subject=CAPITAL_CALL) — same gate as dividends. It allocates the demand across shareholders *pro-rata to unpaid commitment*, posts receivables (501 Ödenmemiş Sermaye logic), and on payment posts the contribution to 500. Under/over-payment is reconciled against the commitment balance, never invented.

**Partner loans (ortak alacakları/borçları).** Distinct from capital (this is the V1 strength worth keeping). A partner loan posts to 331/431, accrues interest on schedule to the GL, and — crucially — is screened against **TTK 358** (loans *from* the company to a shareholder are restricted) and **örtülü sermaye / transfer-pricing** thresholds (KVK 12): if shareholder debt exceeds 3× equity share, the engine flags the excess interest as non-deductible and surfaces it — *honestly labeled* (P6), not hidden.

**Equalization (eşitleme).** When contributions/returns drift from share ratios, `computeEqualization()` reads capital-account balances from the GL and proposes the balancing transfers to restore pro-rata equity. It is a **read + proposal**; applying it posts journals like any other movement. No second equity model.

**Returns / distributions** flow through the *same* dividend engine — a return of capital vs a profit distribution is a different `subject`/account path, but the same atomic, resolution-gated, audit-chained machinery. One workflow per job (P5).

---

## 4. The Audit Trail — mandatory, transactional, HMAC-keyed hash chain

Not analytics. Not best-effort. A **write-side invariant**: every governance/PCLE mutation appends exactly one link, inside the same transaction as the mutation, enforced by a DB trigger. You physically cannot post a dividend without extending the chain.

```
audit_chain
├─ seq         bigserial   -- monotonic per company_id
├─ company_id  uuid
├─ actor_id    uuid
├─ action      text        -- DIVIDEND_DECLARE | CAPITAL_CALL | RESOLUTION_APPROVE | DIVIDEND_VOID ...
├─ entity_ref  uuid        -- the affected row
├─ payload     jsonb       -- the figures + resolution_id + journal_id
├─ prev_hash   bytea       -- hash of the previous link (chain)
├─ row_hash    bytea       -- HMAC_SHA256(key, prev_hash ‖ canonical(payload) ‖ seq ‖ company_id)
└─ created_at  timestamptz default now()
```

- **Keyed (HMAC), not plain SHA.** The chain is signed with a server-held secret (rotated, key-id stamped per link). A DB-level attacker who can write rows still cannot forge a valid continuation without the key, so silent tampering is detectable. A plain hash chain only catches *accidental* corruption; HMAC catches *malicious* edits.
- **Transactional & mandatory.** A `BEFORE INSERT/UPDATE/DELETE` trigger on every governance table calls `append_audit_link()`. No code path can mutate state and skip it — there is no "log if you remember" call site (V1's failure). If the audit insert fails, the whole transaction rolls back.
- **Append-only.** `audit_chain` has `UPDATE`/`DELETE` revoked at the role level even for the app role; only `INSERT` via the trigger. Genesis link per company seeds `prev_hash`.
- **Verifiable.** `verify_audit_chain(company_id)` walks links recomputing each HMAC; the first break pinpoints the tampered `seq`. This runs in the period-close gate and on demand — *real* assurance, not a "health score."

---

## 5. Subsystem coherence (one bloodstream)

```
                    ┌─────────────────── posted GL (the truth, P2) ───────────────────┐
                    │                                                                  │
   computeDistributable()        computeEqualization()        capital_account VIEW     │
            │                              │                          │                │
            ▼                              ▼                          ▼                │
   ┌──────────────────────────── PCLE / Governance Service ───────────────────────────┘
   │   propose → RESOLUTION (authorize) → atomic DB fn (recompute+hashcheck+post+stopaj)
   │                                              │
   │                              every step ─────┘──► append_audit_link() (HMAC chain, mandatory)
   └───────────────────────────────────────────────────────────────────────────────────────────
```

Read-only **views** (shareholder register, capital-account statement, dividend ledger, reserve status, audit explorer) sit on top. None of them computes; each renders kernel output (P1). One workflow surface, progressively disclosed (P7): a first-time owner sees "Distribute profit" with a single computed ceiling and a guided resolution step; a CFO at month-end sees the full waterfall, reserve breakdown, drift diagnostics, and chain-verify.

---

## 6. Concrete API surface (the whole subsystem)

Deliberately tiny (P5) — contrast V1's ~25 partner routes:

| Route | Method | Notes |
|---|---|---|
| `/governance/resolutions` | POST/GET | create/list resolutions |
| `/governance/resolutions/[id]/approve` | POST | freeze snapshot+hash; quorum gate |
| `/governance/dividend/compute` | GET | pure read; returns distributable + blocking_reasons |
| `/governance/dividend/propose` | POST | bounded by compute; creates dividend + draft resolution |
| `/governance/dividend/declare` | POST | body **only** `{dividend_id, resolution_id}`; calls atomic DB fn |
| `/governance/dividend/void` | POST | reversal; requires void resolution |
| `/pcle/commitments` · `/pcle/capital-calls` · `/pcle/loans` | POST/GET | resolution-gated where statutory |
| `/governance/audit/verify` | GET | walks HMAC chain |

There is **no** `dividend/calculate` + `dividend-calculator` + `distribution-simulator` triplet, **no** `declarations[]` batch path, **no** `equity-waterfall-distribution`. One compute, one propose, one declare, one void.

**Key decisions:**
- Distributable profit has exactly ONE kernel reading posted GL balances (590/580/540 etc.); zero-revenue companies are blocked by arithmetic (max(0,...)), not by an optional check that can fail-open like V1's escape hatch.
- The declare API accepts only {dividend_id, resolution_id} — there is no amount field on the wire, so an owner literally cannot type the figure that has legal force (W1 of four over-distribution walls).
- Resolution approval freezes an HMAC payload snapshot; declaration recomputes from the live ledger and aborts on LEDGER_DRIFT if the hash differs — the board may not distribute against figures it never saw.
- Declaration is a single Postgres transaction (lock → assert resolution → recompute → hash-check → post balanced JE → per-shareholder GVK 94 stopaj → consume resolution → append audit link); no partial dividend can ever exist.
- The audit trail is a mandatory transactional HMAC-keyed hash chain enforced by DB triggers with UPDATE/DELETE revoked — not a best-effort 'governance health score' read model.
- PCLE (capital accounts, commitments, calls, partner loans, equalization, returns) is ONE service over GL-backed tables; capital accounts are views over the ledger, and capital calls reuse the same resolution gate as dividends.
- TTK 519 reserves and 580 loss offsets are computed inside the kernel and posted before distribution via a DB CHECK/trigger, so even a hand-rolled SQL INSERT cannot over-distribute.


---

## DELIVERABLE 6 — FLOWRA V2 FINANCE ARCHITECTURE: the canonical typed Financial Core + reporting layer, designed from a blank repo.

## DELIVERABLE 6 — Flowra V2 Finance Architecture

> The Financial Core is the one place in Flowra where money is *computed*. Everything else — screens, PDFs, cockpit, forecasts, exports — only *reads* it. There is exactly one function per figure, it derives from the posted ledger, and a screen that recomputes a number is a build-time error, not a code review note.

V1 evidence I read before writing this (so this is not theory): `lib/services/finance/income-statement.service.ts` computes net income from operational `sales`/`expenses` with its own inline `CORP_TAX_FRACTION`, while `lib/services/ledger/gl-income-statement.service.ts` derives the *same* net income from GL accounts — **two net-income paths that can disagree**, and `FLOWRA_CANONICALS.md` §10 even names only one of them as "truth." `gl_mode='shadow'` is canonized in §12. Revenue forecast exists three times (`commercial/`, `finance/`, `inventory/demand-forecast`). Five parallel read surfaces (`financial-summary`, `financial-statements`, `financial-health`, `financial-benchmarking`, `financial-health-score`). V2 deletes all of this.

---

### 1. Architecture in one diagram

```
            ┌─────────────────────────────────────────────────┐
  Postings  │   POSTED GENERAL LEDGER  (journal_entry_lines)   │   ← P2: the only truth
  (balanced)│   append-only · balanced · period-stamped        │
            └───────────────────────┬─────────────────────────┘
                                    │ reads (never writes)
            ┌───────────────────────▼─────────────────────────┐
            │            THE FINANCIAL CORE  (@core)           │
            │  pure typed kernels — one function per figure    │
            │  net_revenue · cogs · gross · opex · ebitda ·    │
            │  operating_income · ebt · tax · net_income ·     │
            │  distributable_profit · distributable_cash ·     │
            │  runway · dscr   — each returns a Figure<T>      │
            └───────┬──────────────┬───────────────┬──────────┘
                    │              │               │
        ┌───────────▼───┐  ┌───────▼──────┐  ┌─────▼────────┐
        │ REPORT PACK   │  │ CFO COCKPIT  │  │ FORECAST     │
        │ (1 dataset,   │  │ (reads Core) │  │ (driver-based│
        │  CFO+Board    │  │              │  │  sim over    │
        │  tabs, PDF)   │  │              │  │  Core funcs) │
        └───────────────┘  └──────────────┘  └──────────────┘
        every box above the Core is READ-ONLY over the Core.
```

The Core is a **pure package** (`packages/core`). It imports no Supabase client, no React, no Next. It takes a `LedgerSnapshot` (posted rows + metadata) in, and returns `Figure` values out. That purity is what makes it testable, forecastable, and impossible to fork.

---

### 2. The `Figure<T>` contract — the spine of P1 & P6

Every number the Core emits is wrapped. A bare `number` is never returned from a kernel. This is the single mechanism that enforces "one canonical figure, honestly sourced."

```ts
// packages/core/figure.ts
export type FigureId =
  | 'net_revenue' | 'cogs' | 'gross_profit' | 'opex'
  | 'ebitda' | 'operating_income' | 'ebt' | 'tax_provision'
  | 'net_income' | 'distributable_profit' | 'distributable_cash'
  | 'runway_months' | 'dscr';

export interface Figure<U extends Unit = 'TRY'> {
  id:       FigureId;          // which canonical figure this IS
  value:    number;            // minor units (kuruş) — never float TRY
  unit:     U;                 // 'TRY' | 'pct' | 'months' | 'ratio'
  period:   PeriodRef;         // { companyId, fiscalYear, from, to, basis }
  basis:    'accrual' | 'cash';
  source:   'ledger';          // V2 has exactly ONE source. enum has ONE value on purpose.
  inputs:   FigureId[];        // provenance: which figures fed this one
  trace:    LedgerRef[];       // exact journal_entry_line ids summed (audit drilldown)
  asOf:     string;            // ISO timestamp of the ledger snapshot
  complete: boolean;           // false ⇒ a feeding posting is missing/unposted → UI must label
}
```

Three properties earn their keep:

- **`trace`** makes every figure drillable to the exact journal lines. No "where did 1.2M come from" mysteries. This is the antidote to V1's silent row caps.
- **`complete: false`** is how P6 is enforced: if the period has unposted drafts feeding a figure, the figure is *honestly incomplete*, and every view renders it with a "taslak dahil değil" marker instead of a confident wrong number. No fabricated scores on empty data.
- **`inputs`** gives a build-time dependency graph (§3) that a lint rule walks to guarantee no second path exists.

Money is **kuruş integers** end-to-end (`net_revenue: 123456789` = ₺1.234.567,89). Float TRY never enters a kernel. `round2` from V1 is deleted; rounding is a presentation concern handled once at the `format` boundary, never mid-calculation.

---

### 3. The kernels — one function per figure, no exceptions

Each kernel is pure, total, and depends only on the ledger snapshot and on *other kernels*. The dependency edges are declared in `Figure.inputs` and **verified by a CI lint rule** (`no-orphan-figure`, `single-definition`) that fails the build if any `FigureId` has more than one defining function or if a figure is computed outside the Core.

```ts
// packages/core/kernels/income.ts   (illustrative — pure, ledger-in / figure-out)
export const netRevenue = (l: LedgerSnapshot): Figure =>
  sumAccounts(l, MSUGT.GELIR_600_602, { contra: MSUGT.SATIS_INDIRIMLERI_610_612 });

export const cogs = (l: LedgerSnapshot): Figure =>
  sumAccounts(l, MSUGT.SMM_620_623);            // posted from FIFO consumption entries

export const grossProfit = (l: LedgerSnapshot): Figure =>
  subtract('gross_profit', netRevenue(l), cogs(l));

export const opex = (l: LedgerSnapshot): Figure =>
  sumAccounts(l, MSUGT.FAALIYET_GIDERLERI_630_632, { excludeDA: true });

export const ebitda = (l: LedgerSnapshot): Figure =>
  subtract('ebitda', grossProfit(l), opex(l));   // D&A excluded by construction

export const operatingIncome = (l: LedgerSnapshot): Figure =>
  subtract('operating_income', ebitda(l), depreciationAmortization(l));

export const ebt = (l: LedgerSnapshot): Figure =>
  add('ebt', operatingIncome(l), otherIncome(l), negate(financeExpense(l)));

export const taxProvision = (l: LedgerSnapshot): Figure =>
  TaxEngine.corporate(ebt(l), l.period);         // THE one tax engine — called, never inlined

export const netIncome = (l: LedgerSnapshot): Figure =>
  subtract('net_income', ebt(l), taxProvision(l));
```

Key kernel decisions:

| Figure | Definition (canonical) | V1 trap avoided |
|---|---|---|
| `net_revenue` | GL 600–602 gross sales **less** 610–612 returns/discounts | V1 aggregated `sales.revenue_try` operationally *and* from GL |
| `cogs` | GL 620–623, posted from FIFO consumption journals | V1 had `computeCogsFromAllocations` recomputing FIFO at read time |
| `ebitda` | `gross_profit − opex`, D&A excluded **structurally**, not by a flag | V1 had `NON_OPEX_TYPES` Set duplicated per service |
| `tax_provision` | `TaxEngine.corporate(ebt)` — single engine, KV/stopaj/KDV all live here | V1: inline `CORP_TAX_FRACTION` in income stmt **and** separate `TaxService` |
| `net_income` | `ebt − tax_provision`, full stop | V1: 3+ net-income paths (P1's literal cause of death) |

**`distributable_profit` vs `distributable_cash` — the figures V1 conflated and the differentiator (PCLE):**

```ts
// "Can I legally declare a dividend?" — an accrual/legal question
export const distributableProfit = (l: LedgerSnapshot): Figure =>
  pipe('distributable_profit',
    netIncome(l),
    less, legalReserve(l),                 // TTK 519: %5 → %20 of capital
    less, priorYearLosses(l),
    less, unpaidBoardCompensation(l),      // huzur hakkı (TTK), is OPEX upstream too
    guard, nonNegative);                    // HARD guard, throws — never a warning (P3)

// "Do I have the cash to actually pay it?" — a treasury question
export const distributableCash = (l: LedgerSnapshot): Figure =>
  min('distributable_cash',
    distributableProfit(l),
    freeCash(l));                           // bank balances − committed outflows − tax reserve
```

V1 let an owner *type* the net income that proved a dividend was safe. V2 makes that structurally impossible: `distributableProfit` reads `netIncome` reads the ledger, and the dividend action (Deliverable on governance) is gated on a board resolution + a non-negative hard guard. **You cannot declare a dividend on an un-validated number because there is no number to type.**

**Runway & DSCR** (the cash/coverage figures the cockpit lives on):

```ts
export const runwayMonths = (l: LedgerSnapshot): Figure =>
  divide('runway_months', freeCash(l), trailingBurnRate(l, { months: 3 }));
  // burn = trailing 3-mo avg of operating cash outflows from the CASH-basis ledger view
  // returns { complete:false } if < 3 months of posted history → cockpit shows "tahmini"

export const dscr = (l: LedgerSnapshot): Figure =>
  divide('dscr', operatingIncome(l) /*+addback D&A*/, debtServiceDue(l, l.period));
  // debt service from partner_loan_tranches + bank loan schedules (real, never synthetic)
```

---

### 4. The reporting layer — ONE dataset, ONE pack, two tabs

This is the part V1 fragmented into five surfaces. V2 has **one assembler** and **one pack**.

```ts
// packages/core/report-pack.ts
export interface ReportPack {
  period:   PeriodRef;
  asOf:     string;
  glMode:   'primary';                    // V2 has no shadow mode. ever.
  figures:  Record<FigureId, Figure>;     // EVERY canonical figure, computed once
  statements: {
    incomeStatement: StatementView;       // P&L — rows ARE figures, not re-sums
    balanceSheet:    StatementView;       // GL account balances by MSUGT category
    cashFlow:        StatementView;       // indirect method, from the same ledger
    trialBalance:    StatementView;
  };
  reconciliation: ReconResult[];          // every cross-statement tie-out, must be []
}
```

- **`assembleReportPack(companyId, period)` is the single entry point.** CFO view and Board view are **two presentations of this one object** — tabs, not two datasets. They cannot disagree because they read identical `Figure`s; the only difference is which rows are shown and the narrative framing (CFO = operating detail + variances; Board = TTK 509/519 dividend headroom, equity roll-forward, resolutions).
- **`reconciliation` must be empty** to render. Balance sheet must balance, net income must tie to retained-earnings movement, cash flow must reconcile to the bank-balance delta. A non-empty recon array **blocks PDF generation** — you cannot stamp a report that doesn't tie out. (This is the inverse of V1, where statements ran off "parallel aggregators with silent row caps" that *never* reconciled.)

**Server-generated, period-stamped, immutable PDFs:**

```
POST /api/reports/packs   { companyId, period }
  → assembleReportPack()                 (server only, never client)
  → assert reconciliation.length === 0   (else 422 with the broken tie-outs)
  → render PDF (CFO + Board sections)     with period stamp + asOf + content hash
  → store in object storage, write report_artifacts row:
       { id, company_id, period, sha256, ledger_asof, generated_by, immutable: true }
  → return signed URL
```

The PDF embeds the `sha256` of the underlying `ReportPack` and the `ledger_asof`. **Regenerating the same period after a back-dated posting produces a *new* artifact with a new hash — the old one is retained, never overwritten.** A board sees exactly the numbers that existed when they resolved on them. Immutability is a row flag + content-addressed storage, not a promise.

---

### 5. Cash management & reconciliation — feeds the ledger, reads the Core

- **Bank feeds** (open-banking / MT940 / CSV import) land in a `bank_transactions` staging table — *raw, unposted*. They are facts, not yet ledger truth.
- **Reconciliation** is a matching workflow: each bank transaction is matched to an expected posting (an invoice payment, an expense, a loan tranche). Matching **produces a balanced journal entry**; until matched, the transaction sits in a `suspense` GL account (197 / 397). Nothing skips the ledger.
- The cockpit's cash figures (`freeCash`, `runway`) therefore read *posted* cash, with `complete:false` while unmatched items sit in suspense — honestly flagged, never silently included or excluded.

This kills V1's `FinanceService.getCash()` (sum of `banks.balance` columns) as a *second* source of cash truth divorced from the ledger.

### 6. Forecasting — driver-based, no fake scenarios (P6)

Forecast is **the Core's kernels run forward over projected drivers**, not a parallel math engine. This is why the Core is pure: `netRevenue(projectedLedger)` is the same function as `netRevenue(actualLedger)`.

```ts
// drivers are explicit, named, sourced — never magic ±10%/±20% bands
interface Driver { id; label; source: 'historical' | 'pipeline' | 'user'; series: MonthlyValue[] }
// e.g. revenue driver = sales pipeline (real) × historical close-rate (real) + user override (labeled)

forecast = projectDrivers(drivers) → synthesizeProjectedPostings() → runKernels() → Figure[]
```

- **No pessimistic/base/optimistic theater on empty data.** A scenario exists only if it has a named, sourced driver delta. If there's no pipeline data, there's no revenue forecast — we show "insufficient history," not a fabricated cone.
- Every forecast `Figure` carries `complete:false` and is labeled "Tahmin." Debt-pressure timelines use real `partner_loan_tranches` (V1 rule worth keeping), never synthetic curves.
- Forecast accuracy is tracked by replaying past forecasts against actuals from the same ledger — one accuracy service, not V1's three forecast variants.

### 7. The CFO cockpit — pure read

The cockpit is a **dumb terminal over `assembleReportPack` + `forecast`**. It computes nothing. Its tiles are `Figure`s with sparklines built from period-over-period `Figure` history. Burn, runway, DSCR, distributable headroom, KDV position, receivables aging — all are kernels. The cockpit's only logic is *layout and threshold coloring*, and even thresholds are config, not computation.

V1's `getCfoMetrics()` (which itself was a mini-aggregator computing burn/runway/receivables independently of the income statement) is **deleted**. Those become Core kernels.

---

### 8. THE CONTRACT — "a screen may only READ the Core, never recompute"

This is enforced by **three layers**, not by discipline:

1. **Type layer:** screens receive `Figure`/`ReportPack`/`ForecastResult` DTOs. They never receive a `LedgerSnapshot` or a Supabase client. There is no kernel import path into `app/` or `components/` (separate tsconfig project references; the Core package does not list React as a peer).
2. **Lint layer:** an ESLint rule (`flowra/no-finance-math-in-views`) bans arithmetic operators (`+ - * /`), `reduce`-to-sum, `Intl.NumberFormat`, and imports of `@core/kernels` inside `app/**` and `components/**`. Formatting goes through `@core/format` only.
3. **CI invariant tests:** golden-master tests assert each `FigureId` has exactly one defining function; reconciliation tests assert every `ReportPack` ties out; a "no second path" test greps the build graph for duplicate figure definitions and fails on any.

> **One sentence:** if a number appears on a screen, it arrived as a `Figure` from the Core with a `trace`, or it doesn't ship.

---

### 9. What V1 finance design I would NEVER repeat

| V1 anti-pattern (found in this repo) | Why it killed us | V2 replacement |
|---|---|---|
| **Two income statements** (`income-statement.service.ts` operational + `gl-income-statement.service.ts`) | Same `net_income` computed two ways → they drift → nobody trusts either (P1's literal death) | One `netIncome` kernel over the posted ledger; the GL *is* the statement |
| **Two tax engines** (inline `CORP_TAX_FRACTION` in P&L **and** `TaxService`/`tax-reserve`/`tax-compliance`) | Tax computed differently depending on which screen you opened | Single `TaxEngine.corporate()`, *called* by the kernel, never inlined |
| **`gl_mode = 'shadow'`** canonized in §12 | A dormant double-entry ledger while statements run off "parallel aggregators with silent row caps" (P2's exact failure) | GL is PRIMARY from row one. No shadow mode. No parallel aggregators. The enum `source` has one value: `'ledger'` |
| **Owner-typed net income proving dividend safety** (PCLE §14) | A statutory TTK 509/519 action gated on un-validated user input (P3 violation) | `distributableProfit` reads `netIncome` reads ledger; dividend gated on board resolution + hard non-negative guard. No number to type |
| **Forecast triplicated** (`commercial/`, `finance/`, `inventory/demand-forecast`) + 3 accuracy variants | Three "revenues" projected three ways | Forecast = the *same* kernels run over projected drivers. One path |
| **Five read surfaces** (`financial-summary`, `financial-statements`, `financial-health`, `financial-benchmarking`, `financial-health-score`) | Each re-aggregated truth; "health scores" on empty data (P6 vanity) | One `ReportPack`; one cockpit; scores only when `complete && sourced` |
| **`banks.balance` as cash truth** (`FinanceService.getCash()`) divorced from the ledger | A cash number that didn't reconcile to any posting | Cash is a ledger kernel; unmatched bank items sit in suspense and flag `complete:false` |
| **`round2` sprinkled mid-calculation** | Compounding rounding drift across services | Integer kuruş end-to-end; round once at the `format` boundary |
| **`sqt`/silent-swallow error patterns** producing ₺0 that looks real | A failed fetch rendered as legitimate zero | `Figure.complete:false` + `trace`; a missing input is *visibly incomplete*, never a confident zero |

**Key decisions:**
- ONE kernel per figure, declared in a CI-verified dependency graph: every financial number (net_revenue→...→net_income, distributable_profit/cash, runway, DSCR) has exactly one pure defining function in packages/core; a lint rule fails the build on any second path. This directly kills V1's 3+ net-income paths and 2 tax engines.
- Every Core output is a Figure<T> wrapper carrying value (integer kuruş), period, source:'ledger', inputs (provenance), trace (exact journal_entry_line ids), and complete:boolean — making every number drillable and honestly-incomplete instead of a confident wrong zero.
- GL is PRIMARY from day one — no gl_mode='shadow', no parallel aggregators. The Core is a pure package that takes a posted LedgerSnapshot in and Figures out; it imports no Supabase/React/Next, which is also what makes forecasting reuse the identical kernels.
- distributable_profit (accrual/legal, TTK 519, hard non-negative guard that throws) is separated from distributable_cash (treasury, min of profit and free cash). Dividend safety reads the ledger through netIncome — there is no number for an owner to type (P3 by construction).
- ONE assembleReportPack() produces ONE dataset; CFO view and Board view are tabs over the same Figures and cannot disagree. PDFs are server-generated, reconciliation-gated (won't stamp if statements don't tie out), period-stamped, content-hashed and immutable (regeneration creates a new artifact, never overwrites).
- Forecasting is the same kernels run forward over explicit, named, sourced drivers — no pessimistic/base/optimistic theater on empty data; a scenario exists only with a sourced driver delta, every projected figure labeled 'Tahmin' with complete:false.
- The READ-only contract is enforced by three layers, not discipline: type isolation (screens get DTOs, no kernel import path), an ESLint rule banning arithmetic/sum/Intl in app+components, and CI invariant tests (single-definition per FigureId + reconciliation ties out).


---

## FLOWRA V2 Database Architecture — Postgres/Supabase schema from zero

# DELIVERABLE 7 — FLOWRA V2 DATABASE ARCHITECTURE

> The database is not where Flowra stores its truth — **the database *is* the truth** (P2). Every integrity rule that matters lives in the DB as a constraint or trigger, not in a TypeScript service that a second writer can forget to call. V1 died because the balanced-journal rule, the period lock, and idempotency all lived in *application code* the DB couldn't enforce. V2 makes those rules structurally impossible to violate.

I verified V1's actual failure modes against the live migrations before designing this (`supabase/migrations/20260602000001_secdef_membership_guards.sql`, `20260601000001_production_hardening.sql`, `20260602000002_hardening_and_idempotency.sql`). The lessons below are paid for, not theoretical.

---

## 0. Design stance in one paragraph

Single Postgres database, single `public`-style schema per logical domain, **multi-tenant by `company_id` with RLS on every table, no exceptions**. The double-entry GL (`journal` + `journal_line`) is the spine and is PRIMARY from row zero. Sub-ledgers (sales, purchases, expenses, inventory, partner finance) are *operational* tables that **must** post a balanced journal in the same transaction — the journal is never optional, never "shadow mode". Money is `numeric(20,4)`, never float, always with an explicit currency and a TRY-converted twin. The ledger is append-only and enforced by triggers; corrections are *reversing entries*, never `UPDATE`/`DELETE`. Period close writes immutable snapshots. Tenant isolation is enforced twice: RLS predicates *and* `SECURITY DEFINER` guards that check membership of `auth.uid()` — and **never trust a caller-supplied id** as a membership claim.

---

## 1. Multi-tenancy & access control

### 1.1 Tenancy spine

```sql
create table company (
  id            uuid primary key default gen_random_uuid(),
  legal_name    text not null,
  tax_id        text not null,                 -- VKN/TCKN
  altitude      text not null default 'guided' -- guided | expert  (P7)
                check (altitude in ('guided','expert')),
  base_currency char(3) not null default 'TRY',
  created_at    timestamptz not null default now()
);

create table membership (                       -- NOT "company_members"; see §8
  company_id  uuid not null references company(id),
  user_id     uuid not null references auth.users(id),
  role        text not null check (role in ('owner','admin','accountant','member','viewer')),
  accepted_at timestamptz,                       -- NULL = pending invite
  revoked_at  timestamptz,                       -- hard signal; replaces ambiguous deleted_at
  primary key (company_id, user_id)
);
create index on membership(user_id) where revoked_at is null;
```

> **V1 fix baked in:** V1's `is_company_member` ignored `deleted_at`, so a removed member kept full RLS access until a hardening migration patched it. V2 uses an explicit `revoked_at` and the membership predicate excludes it *from day one*. Invites that aren't yet accepted (`accepted_at IS NULL`) are also excluded — V1 left this "roadmapped" because a live user depended on the bug. We don't inherit that debt.

### 1.2 The two membership predicates (the load-bearing functions)

```sql
create or replace function app.current_company_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select company_id from public.membership
  where user_id = auth.uid()
    and revoked_at is null
    and accepted_at is not null
$$;

create or replace function app.is_member(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership
    where company_id = p_company and user_id = auth.uid()
      and revoked_at is null and accepted_at is not null
  )
$$;

create or replace function app.has_role(p_company uuid, variadic p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership
    where company_id = p_company and user_id = auth.uid()
      and revoked_at is null and accepted_at is not null
      and role = any(p_roles)
  )
$$;
```

### 1.3 The RLS template every tenant table uses

```sql
alter table journal enable row level security;
alter table journal force row level security;     -- force: even table owner obeys RLS

create policy journal_read on journal for select
  using (company_id in (select app.current_company_ids()));

-- Writes go through SECURITY DEFINER posting functions, so the RLS write policy is
-- deliberately NARROW: admins/accountants only, and the company must match.
create policy journal_write on journal for insert
  with check (app.has_role(company_id, 'owner','admin','accountant'));
```

> **The `SECURITY DEFINER` guard rule (P3, paid for by V1):** every `SECURITY DEFINER` function that takes a `company_id` argument **must** begin with `if auth.uid() is not null and not app.is_member(p_company) then raise exception 'FORBIDDEN: cross-tenant'; end if;`. V1 shipped six DEFINER functions (`create_journal_entry`, `get_real_cost`, `get_sales_analytics`, …) that trusted a caller-supplied company id with **no** membership check and were `EXECUTE`-granted to `authenticated` — any logged-in user of any tenant could forge another company's GL via PostgREST. This guard is mandatory and tested by a cross-tenant probe in CI.

### 1.4 Role grants — least privilege from row zero

- `anon`: **`SELECT` only on a tiny public allowlist** (e.g. `country`, `currency` reference tables). **No grants on tenant tables. No write grants anywhere.** V1 shipped blanket write grants to `anon` and clawed them back in a late hardening migration; V2 starts closed.
- `authenticated`: `SELECT` on tenant tables (RLS-gated); `EXECUTE` on the posting functions only. **No direct `INSERT`/`UPDATE`/`DELETE` on `journal`/`journal_line`/snapshots.**
- `service_role`: bypasses RLS (cron worker, posting engine). DEFINER guards treat `auth.uid() IS NULL` as the trusted service path.

---

## 2. The ledger spine (PRIMARY, append-only)

```sql
-- Chart of accounts: Tek Düzen Hesap Planı, per company (seeded from a template).
create table account (
  company_id  uuid not null references company(id),
  code        text not null,                    -- '100','120','600','391'...
  name        text not null,
  type        text not null check (type in ('asset','liability','equity','revenue','expense')),
  normal_side char(1) not null check (normal_side in ('D','C')),
  is_postable boolean not null default true,     -- false for header/rollup accounts
  primary key (company_id, code)
);

create table journal (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references company(id),
  period_id    uuid not null references period(id),
  entry_date   date not null,
  source_type  text not null,                    -- 'sales','purchase','expense','payroll','dividend','fx','manual','reversal'
  source_id    uuid,                             -- FK back to the originating sub-ledger row
  reverses_id  uuid references journal(id),      -- corrections = reversal, never UPDATE
  description  text not null,
  posted_at    timestamptz not null default now(),
  posted_by    uuid not null references auth.users(id),
  -- balance is a STORED, DB-computed mirror used only by the balanced-journal constraint:
  total_debit  numeric(20,4) not null,
  total_credit numeric(20,4) not null,
  constraint journal_balanced check (total_debit = total_credit)   -- P1/P2: enforced IN the DB
);

create table journal_line (
  id          uuid primary key default gen_random_uuid(),
  journal_id  uuid not null references journal(id),
  company_id  uuid not null references company(id),   -- denormalized for RLS + the line FK
  account_code text not null,
  debit_try   numeric(20,4) not null default 0 check (debit_try  >= 0),
  credit_try  numeric(20,4) not null default 0 check (credit_try >= 0),
  -- multi-currency: original amount + the canonical TRY twin
  currency    char(3) not null default 'TRY',
  amount_fx   numeric(20,4),
  fx_rate     numeric(20,8),
  memo        text,
  foreign key (company_id, account_code) references account(company_id, code),
  check ((debit_try > 0) <> (credit_try > 0))     -- exactly one side per line
);
create index on journal_line(journal_id);
create index on journal_line(company_id, account_code);
```

### 2.1 Balanced-journal enforcement — belt **and** suspenders

V1's balance check lived **inside the `create_journal_entry` function** — which means a direct `INSERT` (or a second code path) bypassed it entirely. V2 enforces balance two ways that the DB itself guarantees:

1. **`journal.total_debit = total_credit` CHECK** — a row literally cannot exist unbalanced.
2. A **`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`** that, at `COMMIT`, recomputes `sum(debit_try)`/`sum(credit_try)` from `journal_line` and compares to the header totals. This catches "header says balanced but lines don't sum to it."

```sql
create constraint trigger journal_lines_tie_out
  after insert or update or delete on journal_line
  deferrable initially deferred
  for each row execute function app.assert_journal_ties_out();
```

The only sanctioned write path is `app.post_journal(p_company, p_source_type, p_source_id, p_lines jsonb)` — a `SECURITY DEFINER` function that (a) runs the membership guard, (b) verifies the period is open, (c) inserts header + lines + computed totals atomically. Sub-ledger writers call **this**; they never touch `journal_line` directly.

### 2.2 Append-only / immutability

```sql
create or replace function app.block_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Ledger is append-only: % on % is forbidden. Post a reversing entry.',
    tg_op, tg_table_name;
end $$;

create trigger journal_no_update      before update or delete on journal
  for each row execute function app.block_ledger_mutation();
create trigger journal_line_no_update before update or delete on journal_line
  for each row execute function app.block_ledger_mutation();
```

Corrections create a new `journal` with `reverses_id` set and inverted lines. The original is never touched. This is **P1**: one figure, one history, auditable.

---

## 3. Sub-ledgers (operational; each posts a balanced journal)

Each sub-ledger row carries a `journal_id` (nullable only while a draft; **`NOT NULL` once `status='posted'`**, enforced by trigger). This is the structural guarantee against V1's "parallel aggregators" — there is no path to a posted business document without a matching ledger entry.

| Sub-ledger | Table(s) | Posts to GL |
|---|---|---|
| Sales (e-Fatura/e-Arşiv) | `sales_invoice`, `sales_invoice_line` | 120 DR / 600 CR / 391 KDV CR |
| Purchases | `purchase_invoice`, `purchase_invoice_line` | 153/770 DR / 191 KDV DR / 320 CR |
| Expenses | `expense` | 7xx DR / 100/102/320 CR |
| Inventory | `inventory_lot`, `inventory_allocation` | COGS via FIFO/weighted allocation |
| Partner finance (PCLE) | `partner`, `capital_commitment`, `partner_loan`, `partner_finance_event` | 500/501/331 etc. |
| Governance | `resolution`, `dividend` | 590/331/360 stopaj |
| Tax | `tax_return`, `tax_line` | 360/391/193 |

### 3.1 Inventory — lots + allocations (no "current quantity" column to drift)

```sql
create table inventory_lot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  product_id uuid not null references product(id),
  received_at date not null,
  qty_in      numeric(20,4) not null check (qty_in > 0),
  unit_cost_try numeric(20,4) not null,
  source_journal_id uuid not null references journal(id)
);

create table inventory_allocation (    -- every consumption draws from specific lots
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  lot_id     uuid not null references inventory_lot(id),
  qty_out    numeric(20,4) not null check (qty_out > 0),
  consumed_by_journal_id uuid not null references journal(id),
  consumed_at date not null
);
```

> **V1 anti-pattern killed:** on-hand quantity is a **VIEW** (`qty_in − Σqty_out` per lot), never a stored mutable column. V1 had stored running-balance columns that drifted from the underlying movements. **P1: one canonical figure, computed once.** A `CHECK`-style trigger forbids allocating more than the lot's remaining quantity.

### 3.2 Partner finance ledger (the PCLE differentiator)

`partner_finance_event` is itself **append-only** (capital injections, loan draws, interest accruals, repayments). The interest-accrual cron is the riskiest writer.

```sql
-- V1's interest-accrual double-post was a TOCTOU (SELECT-then-INSERT) into an
-- append-only ledger that could double-fire. V2 makes the dedup grain a DB UNIQUE
-- constraint so a concurrent second accrual is rejected by the database, not by hope.
create unique index uq_loan_interest_accrual
  on partner_finance_event (company_id, event_type, event_date, reference)
  where event_type = 'LOAN_INTEREST_ACCRUAL';
```

This is the generalized idempotency pattern (§5): **the dedup key is a DB constraint, never an app-level check.**

---

## 4. Periods, snapshots & the period lock

```sql
create table period (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  year int not null, month int not null,
  status text not null default 'open'
         check (status in ('open','closing','closed','locked')),
  closed_at timestamptz, closed_by uuid references auth.users(id),
  unique (company_id, year, month),
  check (month between 1 and 12)
);
```

### 4.1 Period-lock trigger (V1 never had one)

V1 had **no** period-lock trigger — a closed month's ledger could still be written. V2:

```sql
create or replace function app.assert_period_open()
returns trigger language plpgsql as $$
declare v_status text;
begin
  select status into v_status from period where id = new.period_id;
  if v_status not in ('open','closing') then
    raise exception 'Period % is %; no postings allowed.', new.period_id, v_status;
  end if;
  return new;
end $$;

create trigger journal_period_guard before insert on journal
  for each row execute function app.assert_period_open();
```

### 4.2 Close = immutable snapshot

Closing a period runs `app.close_period(p_period)`: assert balanced trial balance, write a **`period_snapshot`** (JSONB trial balance + statement line totals + a content hash), flip status to `closed`. The snapshot is the legal record of that month; statements for closed periods read the snapshot, not a live re-aggregation. **P3: legal-by-construction** — close is atomic and gated, and a closed period's numbers can never silently change.

---

## 5. Idempotency (generalized)

```sql
create table idempotency_key (
  company_id uuid not null references company(id),
  scope text not null,                 -- 'post_sales_invoice','accrue_interest', ...
  key   text not null,                 -- caller-supplied or derived natural key
  result_id uuid,                      -- the row/journal produced
  created_at timestamptz not null default now(),
  primary key (company_id, scope, key)
);
```

Every mutating posting function takes an idempotency key, `INSERT ... ON CONFLICT DO NOTHING` into this table, and returns the prior `result_id` on conflict. **No SELECT-then-INSERT anywhere** — the unique constraint is the arbiter, immune to concurrency.

---

## 6. Audit log (tamper-evident hash chain)

V1's hash chain was added late and verified by a `SECURITY DEFINER` function that (until patched) leaked another tenant's audit ids. V2 ships it correct on day one:

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  actor uuid references auth.users(id),
  action text not null, entity_type text not null, entity_id uuid,
  old_data jsonb, new_data jsonb,
  created_at timestamptz not null default now(),
  prev_hash text, content_hash text not null   -- stamped by BEFORE INSERT trigger
);
```

- A `BEFORE INSERT` trigger computes `content_hash = sha256(payload || prev_hash)` so the chain is closed inside the DB, not by the app.
- `audit_log` is append-only (same `block_ledger_mutation` family of trigger).
- The verifier is `SECURITY DEFINER` **with the membership guard** — no cross-tenant leak.

---

## 7. Scale & partitioning stance (deliberately restrained — P5)

An SME of 5–50 people posts on the order of **10³–10⁴ journals/month** → low single-digit millions of `journal_line` rows over a *decade*. That is a rounding error for Postgres.

- **No partitioning at launch.** B-tree indexes on `(company_id, entry_date)` and `(company_id, account_code)` are more than enough. Range-partitioning `journal_line` by year is a *documented escape hatch*, triggered only if a single tenant crosses ~50M lines — which for this segment means never.
- **No sharding, no read replicas at launch.** Supabase primary handles it.
- **No materialized statement tables.** Trial balance is a fast indexed aggregate; only *closed* periods get snapshotted (and that's for legal immutability, not performance).
- One database, RLS-isolated tenants. We do **not** do schema-per-tenant — it multiplies migration surface by tenant count, the exact kind of sprawl that killed V1.

> Over-engineering scale is itself a V1 sin: complexity nobody's data volume justified. The stance is *small surface, room to grow, no speculative machinery.*

---

## 8. What from V1 I will NEVER repeat (concrete, verified)

| V1 pattern (verified in repo) | Why it was fatal | V2 replacement |
|---|---|---|
| **Balanced-journal check inside a function** (`create_journal_entry`) | Any direct INSERT or 2nd code path bypassed it → unbalanced ledger | `CHECK` constraint + deferred constraint trigger; can't exist unbalanced |
| **No period-lock trigger** | Closed months were still writable | `assert_period_open` BEFORE INSERT trigger |
| **App-level TOCTOU dedup** (interest accrual) | Concurrent double-fire double-posted into append-only ledger | Unique-index dedup grain; DB rejects the second write |
| **`SECURITY DEFINER` trusting caller-supplied `company_id`** (6 funcs) | Cross-tenant GL forgery / data read by any authenticated user | Mandatory `is_member(auth.uid())` guard in every DEFINER fn |
| **Membership predicate ignoring soft-delete** | Removed members kept full access | Explicit `revoked_at`/`accepted_at` excluded from predicate at birth |
| **Blanket `anon` write grants on all tables** | "Future table without RLS is world-writable" | `anon` = SELECT-only on a reference allowlist; start closed |
| **220-service / 527-file sprawl** writing the same figures via parallel paths | 3+ net-income paths, two balance sheets disagreeing (P1 violation) | One posting engine (`app.post_journal`); screens are read-only views |
| **Stored running-balance / on-hand columns** | Drifted from underlying movements | Balances are VIEWS over lots/lines; no mutable aggregate columns |
| **Fictional columns read by services** (drift tables) | Code read columns the table never had → silent nulls/500s | Schema is the contract; CI fails on any `select` of an undefined column |
| **`UPDATE`/`DELETE` on posted financial rows** | Untraceable mutation of statutory records | Append-only triggers; corrections are reversing entries |
| **Dormant/"shadow-mode" GL** | Statements ran off parallel aggregators with silent row caps | GL is PRIMARY row-zero; sub-ledger `status='posted'` ⇒ `journal_id NOT NULL` |

---

## 9. Migration discipline (so V2 doesn't *become* V1)

- **Forward-only, timestamped, idempotent** migrations; every one validated with `BEGIN; … ROLLBACK;` against a prod-shaped DB before apply — exactly the discipline the late V1 hardening migrations finally adopted, applied from migration `0001`.
- **A schema-drift CI gate**: a generated TypeScript type from the live schema must match the committed types; a service referencing a non-existent column fails the build. This single check would have caught V1's entire class of "fictional columns read by services."
- **Cross-tenant probe in CI**: log in as tenant A, attempt every `SECURITY DEFINER` function and PostgREST table with tenant B's ids; any success fails the build.

**Key decisions:**
- Double-entry GL (journal + journal_line) is PRIMARY from row zero; every sub-ledger must post a balanced journal in the same transaction — no shadow mode, no parallel aggregators (P1/P2).
- Balanced-journal is enforced by a CHECK constraint plus a DEFERRABLE constraint trigger that ties header totals to line sums — in the DB, not in a function a second writer can bypass (V1's fatal flaw).
- Period-lock is a BEFORE INSERT trigger (assert_period_open); closed periods are immutable JSONB snapshots with content hashes — V1 had no period-lock trigger at all.
- Ledger and audit_log are append-only via block-mutation triggers; corrections are reversing entries (reverses_id), never UPDATE/DELETE.
- Multi-tenancy = company_id + RLS (FORCE) on every table, doubled by SECURITY DEFINER functions that ALWAYS check is_member(auth.uid()) and NEVER trust a caller-supplied company_id.
- Membership predicate excludes revoked_at and unaccepted invites from day one; anon role is SELECT-only on a reference allowlist, zero write grants — both V1 holes closed at birth.
- Idempotency is a DB unique constraint (idempotency_key + partial unique indexes), never app-level SELECT-then-INSERT TOCTOU.
- No partitioning/sharding/materialized statements at launch — SME volume is low-millions of rows over a decade; partitioning is a documented escape hatch only.


---

## Deliverables 3 + 8 — Flowra V2 Navigation Map (Information Architecture) + Service Architecture (layering, one-owner-per-figure rule, service count target, Financial Core consumption)

## Deliverable 8 — Service Architecture

### The V1 autopsy that sets every rule here

Measured from the live repo, not memory: **220 `.service.ts` files**, **41 files in `lib/services/`**, **7 parallel "engines"**, **25 dashboard hubs**, and (per the consolidation memory) **6 independently-evolved duplicate service pairs** plus **two parallel kurumlar-vergisi calculators** (`financial-summary` + `cfo-metrics`) and **two financial summary paths**. That is the architecture that produced "3+ net-income paths" (P1's failure). 220 services is not a layering choice — it is the *absence* of one. A service got created every time someone needed a number, instead of every time a new *concept* was introduced.

V2's service layer is designed so that this is **mechanically impossible**, not just discouraged.

### The five layers (and nothing between them)

```
┌─────────────────────────────────────────────────────────────┐
│ 5. VIEW MODELS        read-only. shape kernel output for ONE  │
│    (per screen)       screen. ZERO arithmetic on money.       │
├─────────────────────────────────────────────────────────────┤
│ 4. ROUTE HANDLERS     thin. authn/authz + zod-parse + call    │
│    app/api/**         ONE domain service + serialize. <40 LOC │
├─────────────────────────────────────────────────────────────┤
│ 3. DOMAIN SERVICES    THE canonical owner of a concept.       │
│    domain/<concept>/  exactly one per concept. ~30 total.     │
│                       The Financial Core lives here.          │
├─────────────────────────────────────────────────────────────┤
│ 2. REPOSITORIES       the ONLY code that writes SQL / calls   │
│    db/repos/          Supabase. company_id scoped by type.    │
├─────────────────────────────────────────────────────────────┤
│ 1. DATABASE           Postgres + RLS. The GL is PRIMARY (P2). │
│    schema + RLS       Statements are SQL views over the ledger.│
└─────────────────────────────────────────────────────────────┘
```

**The directional rule (lint-enforced):** a layer may only import the layer directly beneath it. View models import services. Services import repos. Routes import services and view models. **Repos never import services. Services never import other services' internals — they call each other only through a published port interface.** No layer skips downward (a route may never touch a repo; a view model may never touch the DB).

### Layer-by-layer contract

**1. Database.** Double-entry GL is primary from day one (P2). `journal_entry` + `journal_line` (every txn balanced, enforced by a deferred constraint that `SUM(debit) = SUM(credit)` per entry). Financial statements are **Postgres views / materialized views over posted lines**, not application aggregators with row caps. RLS on `company_id` on every table. There is no "shadow GL".

**2. Repositories (`db/repos/`).** The only place `supabase.from(...)` / raw SQL appears. One repo per aggregate root (≈ one per primary table cluster): `journal.repo`, `party.repo` (customers+suppliers+partners as one party table), `invoice.repo`, `inventory.repo`, `loan.repo`, etc. Repos return **rows/DTOs, never computed money**. They take `company_id` as a non-optional first argument — eliminating V1's class of "missing company_id scoping" bugs by type signature. ~25 repos.

**3. Domain services (`domain/<concept>/`) — the heart.** Exactly **one canonical service per business concept**, and each *financial figure has exactly one service that owns it* (P1). A service is the *only* code allowed to compute its figure. The **Financial Core** is the subset of these services that produce statutory/financial numbers:

| Core service | Owns (the canonical figure) | Reads |
|---|---|---|
| `ledger` | journal posting, trial balance | repos only |
| `statements` | income statement, balance sheet, cash flow | `ledger` |
| `tax` | KDV, Kurumlar Vergisi, GVK 94 stopaj | `statements`, `ledger` |
| `dividend` (PCLE) | distributable profit, TTK 509/519 reserve gates, GVK 94 withholding, partner waterfall | `statements`, `tax`, `equity` |
| `equity`/`loan` (PCLE) | partner capital, shareholder loans, interest accrual | `ledger` |
| `working-capital` | DSO/DPO/DIO, cash conversion cycle | repos + `ledger` |
| `forecast` | 12-month cash projection (one engine, not 7) | `statements`, `working-capital` |

Non-financial concepts each get one service too: `invoicing` (e-Fatura/e-Arşiv, P4), `e-defter`, `inventory`, `party`, `document`, `period` (close/guard), `workflow` (approvals), `audit` (hash chain), `alert`, `insight`, `auth`/`membership`. **A service may compose another service but may never re-derive a figure another service owns** — `tax` asks `statements` for net income; it does not recompute it. This is the single rule that kills "two tax engines / two balance sheets that disagree".

The 7 V1 "engines" collapse into **one `forecast` service + one `alert` service + one `insight` service** (anomaly/duplicate-detector become *methods* of `insight`, not standalone engines).

**4. Route handlers (`app/api/**/route.ts`).** Thin and uniform: `authz → zod parse → call ONE domain service → serialize`. Hard cap ~40 LOC, no business logic, no money math, **no second service call that re-computes** (a handler may read from at most one *write* service per request to keep transactions atomic — P3 dividend/close are atomic). This is where V1 leaked: routes like `cfo-metrics` and `financial-summary` each grew their own tax math. In V2 both would be `GET` handlers calling `tax.corporateTax(companyId, period)` — same function, same number, always.

**5. View models (`view/<screen>/`).** Pure, read-only mappers: take canonical service output and shape it for a specific screen (labels, ordering, formatting, drill-down links). **Zero arithmetic on money** — a view model may sum a list the kernel already returned, but may never apply a rate, a tax, or a margin. `fmt()`/formatting lives here in *one* shared module (V1 had `fmt()` duplicated in 30+ files).

### The "one owner per figure" guard (the rule that has teeth)

A convention nobody enforces is how V1 got to 220 services. V2 enforces it three ways:

1. **Registry + CI test.** `domain/_registry.ts` is a hand-maintained map: `figure → owning service.method`. A CI test (`figure-ownership.test.ts`) asserts: (a) every entry resolves to a real export; (b) **no two services export a function whose name matches a `compute*Tax|*NetIncome|*Balance|*Distributable*` pattern** outside the registered owner; (c) grep-guard — no `*.service` / `*Service` file may be created outside `domain/`. A second service computing net income fails the build.
2. **Import-boundary lint** (`eslint-plugin-boundaries` or dependency-cruiser). Encodes the directional rule above: route→service→repo→db only; cross-service access only via published `port.ts` interfaces. Breaking the layering is a lint error, not a review comment.
3. **One file per concept, named for the concept** (`domain/tax/index.ts`), not for the screen. You cannot create `cfo-tax.service.ts` and `report-tax.service.ts` — the directory shape forbids it.

### Honest service-count target

V1: **220**. The concept count of a Turkish KOBİ ERP+finance+governance product is roughly **28–32 distinct business concepts** (the 28-domain roadmap is the right granularity for *domains*, and a domain ≈ a service). So:

> **Target: ~30 domain services** (Financial Core ≈ 8 of them), **~25 repositories**, **~50 view models** (roughly one per tab + a few shared), **~60 route handlers**. Total "service-like" files **≈ 30**, an **order of magnitude below V1's 220** (≈ 7× fewer). Anything trending back toward 100+ services means the one-owner rule has been bypassed — the CI guard exists precisely to catch that drift early.

The reduction is not aggression for its own sake: 220 → ~30 is exactly the gap between "a file per number" and "a file per concept."

---

## Deliverable 3 — Navigation Map (Information Architecture)

### Principle applied: altitude, not tabs (P7 + P5)

V1 shipped **25 dashboard hubs** and (per memory) **48 top-level tabs**, later jammed down to 15 *groups* by bolting a `groups` prop onto `UnifiedTabNav` — a patch, not an IA. V2 starts from the job-to-be-done. Two distinct users (P7): the **first-time owner** who needs to be *guided*, and the **CFO at month-end** who needs *expert depth*. The same nav serves both by **altitude switching**, not by showing everyone everything.

- **Guided Home (altitude 1)** — the default landing. Not a hub of hubs; a single adaptive page: "what needs your attention", a short next-best-action list, and big entry points to the 6 centers. A new owner can run the whole business from here without ever opening a hub.
- **Expert Hubs (altitude 2)** — the 6 centers below. A CFO sets their default landing to a hub and lives in the tabs.

Altitude is a **per-user preference + role default**, persisted, with a one-click toggle ("Guided ⇄ Expert"). Progressive disclosure is real: expert-only tabs (e-Defter, GL Journal, Reserves) are hidden at altitude 1 and surfaced at altitude 2.

### The 6 centers (down from 25)

The consolidation already proved the shape (Partners 18→4, Finance 10→4, etc.). V2 commits to it as the *original* design: **6 centers, 28 tabs.**

```
🏠 HOME  (guided, altitude-1 default — adaptive, no sub-tabs)

💸 SALES & CASH-IN            /sales
   ├─ Overview                /sales                (deep: ?range=mtd)
   ├─ Invoices (e-Fatura/Arşiv) /sales/invoices     ← P4 system-of-record
   ├─ Customers               /sales/customers      (deep: /sales/customers/[id])
   ├─ Collections & Aging     /sales/collections
   └─ Quotes / Proforma       /sales/quotes

🛒 PURCHASING & STOCK         /supply
   ├─ Overview                /supply
   ├─ Bills & Suppliers       /supply/bills
   ├─ Inventory               /supply/inventory     (deep: /supply/inventory/[sku])
   ├─ Products & Costing      /supply/catalog
   └─ Expenses & Approvals    /supply/expenses      (workflow > threshold)

📒 ACCOUNTING & TAX           /accounting   ← the Financial Core, read-only views
   ├─ Income Statement        /accounting/income
   ├─ Balance Sheet           /accounting/balance
   ├─ Cash Flow               /accounting/cashflow
   ├─ Trial Balance           /accounting/trial-balance   ⓔ expert
   ├─ GL Journal              /accounting/journal         ⓔ expert (deep: /journal/[entryId])
   ├─ Tax (KDV · Kurumlar)    /accounting/tax
   └─ e-Defter / Period Close /accounting/books           ⓔ expert ← P4

🤝 PARTNERS & CAPITAL (PCLE)  /partners   ← the differentiator
   ├─ Overview & Positions    /partners             (deep: /partners/[partnerId])
   ├─ Capital & Loans         /partners/capital
   ├─ Dividends (TTK 509/519) /partners/dividends   ← P3 legal-by-construction
   └─ Distribution & Risk     /partners/distribution

🧭 COMMAND (CEO/CFO)          /command
   ├─ Cockpit                 /command              (situation band + alerts + KPIs)
   ├─ Forecast & Cash Runway  /command/forecast
   ├─ Simulation / What-If    /command/simulation
   ├─ Reports & Packs (PDF)   /command/reports
   └─ Insights (AI/anomaly)   /command/insights     ⓔ expert

⚙️ ADMIN & GOVERNANCE         /admin
   ├─ Members & Roles         /admin/members
   ├─ Board Resolutions       /admin/resolutions    ← gates dividends (P3)
   ├─ Audit Trail (hash chain)/admin/audit          ⓔ expert
   └─ Settings & Company      /admin/settings        (deep: ?tab=integrations)
```

**Count: 1 home + 6 centers + 28 tabs** (5 marked ⓔ expert, hidden at altitude 1 → a first-time owner sees ~23). Squarely in the ~6 centers / 25–31 tabs target.

### Why this shape (the load-bearing decisions)

- **Centers map to a person's *job*, not to a data model.** "Sales & Cash-in", "Purchasing & Stock" are how an owner thinks; V1's `sales-flow` vs `sales` vs `collections` vs `proformas` as four separate hubs was the data model leaking into the IA.
- **Accounting is a center of *views*, never a calculator (P1/P2).** Every tab here is a read-only view model over a Financial Core service. Income/Balance/Cashflow all read the *same* `statements` service that reads the *same* `ledger`. They cannot disagree because they share one kernel — the structural fix for V1's two-balance-sheet death.
- **Partners/PCLE stays its own center** because it's the genuine differentiator (TTK 509/519, GVK 94). Dividends is deliberately separated from "Distribution & Risk": declaring a dividend is a statutory, board-gated, atomic action (P3), not a dashboard.
- **Command is the altitude-2 expert surface for leadership**; Insights/anomaly is one tab, not the 7-engine sprawl of V1.
- **Resolutions and Audit live in Admin** so the legal gating (board resolution → dividend) and the immutable record are first-class, not buried.

### Deep-linking & routing rules

1. **Every tab is a real URL** (App Router segment), shareable and bookmarkable — `/accounting/tax`, not `?tab=tax` state. State that is genuinely view-config (date range, sub-filter) goes in **search params** (`/sales?range=mtd`, `/admin/settings?tab=integrations`) so links restore exact view.
2. **Entities are path params** (`/sales/customers/[id]`, `/partners/[partnerId]`, `/accounting/journal/[entryId]`) — deep-linkable to a single record, drill-down from any view model lands here.
3. **One canonical path per destination; legacy/typo paths are redirects, not duplicate pages.** V1's 18 redirect stub pages → a single `middleware` redirect map. No screen has two URLs.
4. **No duplicate dashboards/reports (P5).** There is one Reports tab (`/command/reports`) producing the CFO Pack; there is not a "reports" page per center. If a center needs a printout, it links into `/command/reports?pack=...`.
5. **Progressive disclosure is route-aware:** ⓔ-expert routes are reachable by direct URL (a CFO can bookmark `/accounting/journal`) but are omitted from the rendered nav at altitude 1 — disclosure hides chrome, it never 404s a valid link.

### Nav as data, with a test guard (mirrors the service guard)

The nav tree is a single typed config (`nav.config.ts`): `Center → Tab[]`, each tab carrying `{ path, label, roles, altitude }`. A CI test asserts: every `path` resolves to an existing route segment (no dead nav entries — V1 shipped orphaned nav links and 404 hubs), no two tabs share a `path`, and total tab count stays within the **6 centers / ≤31 tabs** budget. The IA cannot silently sprawl back to 48 tabs, for the same reason the service layer cannot sprawl back to 220: the budget is a test, not a hope.

**Key decisions:**
- One canonical domain service per concept; every financial figure has exactly one owning service (P1) — enforced by a figure→owner registry + CI test + import-boundary lint, not by convention.
- Five strict layers (DB → repos → domain services → thin routes → read-only view models) with a directional import rule: no layer skips downward, services cross-talk only via published ports, only repos touch SQL.
- Honest service target ~30 domain services (≈7× below V1's measured 220), ~25 repos, ~50 view models, ~60 thin route handlers — a concept-per-service, not a number-per-service.
- Financial Core is ~8 of those services (ledger→statements→tax→dividend/PCLE); every accounting screen is a read-only view over them, so statements physically cannot disagree.
- IA collapses V1's 25 hubs / 48 tabs into 6 centers + 28 tabs (1 guided Home), mapped to the owner's jobs, not the data model.
- Progressive disclosure via per-user altitude (Guided Home ⇄ Expert Hubs) with role defaults; 5 expert-only tabs hidden at altitude 1 but still reachable by direct URL.
- Nav is typed data with a CI guard (paths must resolve, no dupes, ≤31-tab budget) — same anti-sprawl mechanism as the service layer; tabs are real URLs, entities are path params, legacy paths are redirects.


---

## Deliverables 9 + 10 — Dashboard Architecture + User Journeys (Flowra V2)

## Deliverable 9 — Dashboard Architecture

### 9.0 The governing rule: the dashboard computes nothing

The V1 dashboard was a liability because it was a *second opinion* — it aggregated rows itself, capped silently, and disagreed with the statements. In V2 the dashboard is structurally incapable of disagreeing with the ledger because **it never reads rows; it reads kernel outputs.**

Every tile is a pure render of a `KernelResult`:

```ts
type KernelResult<T> = {
  kernel_id: string;        // e.g. "cash.runway", "pnl.net_income", "ttk509.headroom"
  value: T;
  as_of: ISODateTime;       // ledger watermark this was computed at
  basis: 'posted' | 'posted+scheduled';
  source_ref: DrillTarget;  // where "show me why" lands the user
  confidence: 'exact' | 'partial' | 'no_data';
};
```

The tile component receives this and may only: format `value`, show `as_of`, render the `source_ref` link, and branch on `confidence`. **A tile has no fallback math, no `?? 0`, no client-side sum.** If two tiles show the same concept (e.g. cash) they reference the same `kernel_id` — there is one `cash.balance`, not a "dashboard cash" and a "statement cash."

> **P1 enforced in code review:** a PR that introduces arithmetic inside a `*Tile.tsx` or `dashboard/*` file fails lint. Math lives in `lib/kernels/*` with golden tests; the dashboard imports results.

### 9.1 The adaptive landing — three objectively-gated states

The landing page is a server component that first calls `getTenantStage(company_id)`. The stage is derived from **real counts of posted artifacts**, never from a self-reported "progress %". This is what makes "never a fabricated score" structural rather than a promise.

| Stage | Gate (all server-computed) | What the landing renders |
|---|---|---|
| **SETUP** | no company profile OR `journal_lines = 0` | Welcome + setup checklist. No tiles. No numbers at all. |
| **ACTIVATING** | company exists AND `journal_lines > 0` AND (`< 1 closed period` OR `< 30 days of postings`) | Real tiles for what *exists* (cash, AR/AP if present). Concepts lacking data render an explicit empty state. No score, no trend lines that need ≥2 periods. |
| **COCKPIT** | ≥1 closed period OR ≥30 days continuous postings | Full role-aware cockpit, trends, period-over-period, runway. |

```
getTenantStage()
   │
   ├─ journal_lines == 0 ──────────────► SETUP   (checklist only)
   ├─ has_postings && !close_ready ─────► ACTIVATING (partial tiles)
   └─ close_ready ─────────────────────► COCKPIT (full cockpit)
```

**Critical anti-pattern we refuse (P6):** in ACTIVATING, a tile whose kernel returns `confidence: 'no_data'` renders:

> **Net profit margin** — *Not enough posted data yet. Margin appears after your first closed period.* → [Post your opening balances]

…not `0%`, not a grey gauge at the bottom of a dial. An empty tenant therefore **cannot** display a "Company Health: 72" — the number does not exist until its inputs do.

#### SETUP state (zero-data welcome)
A single column, no chrome, four real actions ordered by dependency:

1. **Tell us about your company** — VKN/TCKN, NACE, KDV periyodu, fiscal year. (Drives statutory defaults: KDV cycle, Kurumlar Vergisi calendar.)
2. **Open your books** — opening trial balance (import or guided). *This posts a real balanced opening journal.* The ledger is now primary (P2).
3. **Connect e-Fatura/e-Arşiv** — GİB integration or entegratör credentials.
4. **Issue your first invoice** — see Journey A.

A live completeness bar tracks *capability* ("3 of 4 set up"), which is honest, not a fabricated quality score.

### 9.2 Role-aware cockpit — same kernels, different altitude (P7)

There is **one** cockpit. Role changes *which tiles, in what order, at what altitude* — never the underlying figure. The owner's "cash" and the accountant's "cash" are the identical `cash.balance` kernel.

#### Owner / Patron (guided altitude — "am I okay?")
Default landing for the primary persona. Five tiles, decision-oriented:

| Tile | Kernel | Answers |
|---|---|---|
| **Cash today + 13-week runway** | `cash.runway` | "Will I make payroll / rent?" |
| **Money owed to me vs by me** | `ar.open` / `ap.open` | Net working-capital pressure |
| **This month vs last** (revenue, profit) | `pnl.month_compare` | Direction of travel |
| **Tax & SGK due next** | `statutory.upcoming` | "What do I owe the state and when?" |
| **Action needed** | `tasks.owner` | Dividend resolution to sign, close to approve, overdue invoices |

No GL accounts, no debit/credit, no 20-row tables. Each tile drills to the expert view if they want it.

#### CFO (control altitude — "is the month right?")
Reorders the cockpit toward close & integrity:

| Tile | Kernel | Answers |
|---|---|---|
| **Close status** | `close.readiness` | "Can I close? What's blocking?" |
| **Unreconciled items** | `recon.exceptions` | Bank/ledger drift |
| **Margin & cost trend** | `pnl.margin_trend` | Profitability quality |
| **AR aging / collection risk** | `ar.aging` | Cash conversion |
| **PCLE position** | `pcle.position` | Shareholder loans/capital, TTK 509/519 headroom — the differentiator |

#### Accountant / Mali Müşavir (execution altitude — "what's my queue?")
Not a dashboard at all — a **work queue**. Cockpit collapses to a prioritized task list reading `tasks.accountant`: unposted documents, KDV beyanname window open, e-Defter berat due, exceptions to clear. One screen, zero vanity.

### 9.3 "One number, one source" made visible
Every tile carries an info affordance that, on click, shows: **kernel id · as_of watermark · basis (posted vs posted+scheduled) · drill link to the posted journals behind it.** This is the trust contract: any number on screen can be traced to journal lines in ≤2 clicks. There is no number on any screen without a `source_ref`.

---

## Deliverable 10 — User Journeys

Design target: the **owner's steady-state surface is ~5 destinations** (Cockpit, Cash, Invoices, Close, Governance) versus V1's 48 tabs. Everything else is reached by *drilling from a tile*, so cognitive load scales with the question being asked, not with the feature count (P5).

---

### Journey A — First-run onboarding (signup → company setup → first e-Fatura)
**User:** Owner (often non-accountant). **Goal:** be legally invoicing inside Flowra in one sitting.

| # | Step | Screen | System computes / **prevents** |
|---|---|---|---|
| 1 | Sign up, create tenant | Auth → Welcome | Provisions `company_id`, RLS scoped from row zero. |
| 2 | Company profile | Setup §1 | Validates VKN/TCKN checksum; sets KDV periyodu, fiscal year, NACE → seeds statutory calendar. **Prevents** invoicing without a valid tax identity. |
| 3 | Open the books | Setup §2 | Guided opening trial balance → **posts a balanced opening journal**. Ledger is now primary (P2). **Prevents** an unbalanced opening (debits≠credits blocks save). |
| 4 | Connect e-Fatura/e-Arşiv | Setup §3 | Stores entegratör/GİB creds; checks counterparty e-Fatura mükellef status live. |
| 5 | Issue first invoice | Invoice composer | Picks correct **e-Fatura vs e-Arşiv** automatically from recipient's registration; computes KDV by line; on send, **posts the AR + KDV + revenue journal atomically** and transmits to GİB. **Prevents** a "sent" invoice that didn't post, and a manual KDV typo (rate comes from the tax matrix, not a free field). |
| 6 | Land in ACTIVATING cockpit | Cockpit | First real tiles appear (cash, this AR). Honest empty states for the rest. |

**Clicks vs V1:** one linear wizard with 4 dependency-ordered steps, ending in a real legal artifact — not a tour of 48 tabs followed by "now go find invoicing."

---

### Journey B — Monthly close (Accountant / CFO)
**Goal:** lock a correct period, produce a signed snapshot.

| # | Step | Screen | System computes / **prevents** |
|---|---|---|---|
| 1 | Open Close | **Close** destination | `close.readiness` lists blockers: unposted docs, unreconciled bank lines, KDV not computed. |
| 2 | Clear exceptions | Reconciliation queue | Bank ↔ ledger matching; each cleared item posts. **Prevents** closing with drift — unreconciled count must be 0 or explicitly waived with a reason (audit-logged). |
| 3 | Review statements | P&L / BS / KDV preview | All read the **posted ledger** (P2); balance sheet balances by construction. KDV beyanname figure = `kdv.period` kernel, same number that files. |
| 4 | Pre-close validation gate | Close confirm | Hard gate: debits=credits, no unposted source docs, prior period closed, KDV reconciled. **Prevents** close on invalid input (P3). |
| 5 | Lock period | — | Atomic: stamps period closed, writes an **immutable signed snapshot** (hash-chained to prior), opens next period. Reopening requires a logged reversal entry, not a delete. |

**Cognitive load:** one workflow, checklist-driven, with the system telling you *what blocks close* rather than the accountant hunting across 10 finance tabs.

---

### Journey C — Year-end dividend declaration (Owner) — *legal-by-construction*
**This is the journey V1 got fatally wrong** (owner typed the net income that "proved" TTK 509 safety). V2 makes that input impossible.

A **5-gate wizard**; the owner advances only when each server-side gate passes against the **posted, closed-period ledger**:

| Gate | What it computes (read-only to owner) | **What it prevents** |
|---|---|---|
| **1. Distributable profit** | `dividend.distributable` from closed ledger: net income − prior losses − legal reserve obligations | Owner **cannot type** net income; it's derived. **Prevents** the V1 failure entirely. |
| **2. TTK 519 reserves** | `ttk519.reserves` — %5 genel kanuni yedek until 20% of capital; 2nd-tier reserve check | **Prevents** distributing reserve-locked profit. |
| **3. TTK 509 / capital integrity** | `ttk509.headroom` — distribution cannot impair stated capital | **Prevents** a distribution that breaches capital maintenance. |
| **4. GVK 94 stopaj** | `gvk94.withholding` — computes dividend withholding by shareholder type | **Prevents** a net payout that ignores statutory withholding. |
| **5. Board resolution** | Generates the resolution doc; requires recorded approval before execution | **Prevents** an un-authorized distribution (P3). |

**Execution:** atomic and reversible — posts the dividend payable, the stopaj liability, the reserve transfers in **one balanced journal**; reversible via a compensating entry, never a row delete. The PCLE engine (capital & shareholder-loan modeling) is what feeds gates 1–3 — Flowra's genuine differentiator, kept in spirit.

**Owner experience:** four read-only "here's what the law allows: ₺X distributable" screens + one signature. They never see a debit/credit. The legality is the system's job, not the owner's typing.

---

### Journey D — Daily cash check (Owner)
**Goal:** answer one question in <10 seconds: *"Can I pay this / make payroll?"*

| # | Step | Screen | System computes |
|---|---|---|---|
| 1 | Open Cash (or read cockpit tile) | **Cash** destination | `cash.balance` (posted) + `cash.runway` (posted + scheduled AP/AR/payroll/tax) → **13-week runway**. |
| 2 | Ask "can I pay supplier X / payroll?" | Same screen | Shows runway *after* the hypothetical outflow; flags if it breaches a threshold or collides with an upcoming tax/SGK due date from `statutory.upcoming`. |

One screen, one kernel family, no tab-hopping. Replaces V1's scattered cash/treasury/forecast tabs with a single decision surface. The runway number is the *same* `cash.runway` the CFO cockpit shows — one number, one source.

---

### How load is minimized vs V1's 50-tab sprawl
- **Destinations, not tabs:** ~5 owner destinations; depth reached by drilling from a tile (each tile *is* the entrance to its detail), so the nav never grows with features.
- **Altitude adapts to user (P7):** owner gets decisions, accountant gets a queue, CFO gets close — without forking the numbers.
- **Workflows replace tab-hunting:** close, dividend, invoice are *guided sequences* that tell you the next valid step, instead of leaving the user to assemble the workflow across many tabs.
- **The dashboard never lies (P6):** no fabricated score on thin data; honest empty states until the ledger earns the tile.

**Key decisions:**
- Dashboard is a read-only VIEW over kernels, never a calculator — every tile carries a kernel_id + as_of timestamp + drill-to-source link; a tile with no posted ledger data renders an explicit 'No data yet' empty state, never a zero or a fabricated score (P1, P6).
- Three-state adaptive landing keyed on objective data thresholds, not vanity: SETUP (no company/ledger) → ACTIVATING (some data, partial tiles only) → COCKPIT (close-able books). State is computed server-side from real row counts, so an empty tenant can NEVER reach a populated CEO score.
- Role determines altitude, not access to different numbers: Owner sees guided cash+risk altitude, CFO sees the close cockpit, Accountant sees the work queue. All three read the SAME kernels — there is no owner-net-income vs CFO-net-income.
- Legal-by-construction dividend journey is a 5-gate wizard where each gate is server-validated against the posted ledger; the owner can NEVER type the net income — it is computed, displayed read-only, and the action is atomic+reversible (P3).
- Daily cash check is a single screen answering one question ('can I make payroll / pay this supplier') with a 13-week runway from posted+scheduled ledger entries — replaces V1's scattered cash tabs.
- Monthly close is a checklist-driven single workflow (reconcile → review exceptions → lock period) with a hard pre-close validation gate; close is irreversible-by-design but produces a signed snapshot, not a deletion.
- Total surface for the primary owner persona at steady state is ~5 destinations (Cockpit, Cash, Invoices, Close, Governance), vs V1's 48 tabs — every other capability is reached by drilling from a tile, not by a top-level tab (P5, P7).