# FLOWRA V2 — STRATEGIC TRANSFORMATION REPORT

*Synthesis of every prior audit: production findings, architecture, UX, security, accounting,
governance and the five-lens final product review. This determines what Flowra must become and
moves from current → ideal. Safe items are executed autonomously; authority items become decision
packages.*

---

## STEP 1 — ROOT CAUSE ANALYSIS

The symptom catalog (≈60 findings) collapses into **six root causes**. Everything else is downstream.

### RC-1 · No single source of truth for any financial figure
**Cause.** Figures are computed wherever they're displayed. 220 `*.service.ts` files, 3+ net-income paths (FinanceService SQL, income-statement re-sum, GL trial-balance, `accounting_periods.net_profit_try`), two corporate-tax engines, two balance-sheet implementations, two report packs — none designated canonical. The codebase even ships *gl-divergence tooling* because the paths disagree.
- **Affected modules:** Finance (all tabs), Partners (distribution/dividend), Planning, CFO/board packs, Tax.
- **Affected workflows:** monthly close, tax provision, dividend declaration, board reporting.
- **Business impact:** different screens show different numbers for the same metric → the product cannot be trusted; unsellable to a CFO.
- **Accounting impact:** revenue overstated ~18–20% (gross KDV as "Net Satışlar"); matrah inherits it; tax provisions disagree.
- **Security impact:** none directly.
- **Maintenance impact:** every fix must land in N places; divergence is structural and permanent.

### RC-2 · The statutory book of record is switched off
**Cause.** Double-entry GL runs in `gl_mode='shadow'` by default — `dualWrite` returns null, nothing posts. Statements are produced by parallel TS aggregators with silent row caps (`.limit(2000…20000)`, `console.warn` only). There is no write-time period lock, so backdated entries mutate filed periods.
- **Affected modules:** GL, Mizan, all statements, period close, audit.
- **Affected workflows:** close, audit, board pack reproduction.
- **Business impact:** the headline "TTK double-entry" capability is non-functional in production.
- **Accounting impact:** auditor gets an empty-but-balanced ledger that doesn't tie to the P&L; closed-period figures silently change; profit/tax quietly understated when a row cap trips.
- **Security/maintenance impact:** audit hash-chain is best-effort (silent no-op, no server HMAC) → weak tamper-evidence presented as strong.

### RC-3 · High-stakes legal actions run on un-validated inputs
**Cause.** The dividend path takes a **hand-typed** "Dönem Net Gelir" straight into the PCLE engine and prints a green "TTK 509 uyumlu" verdict with no check against the actual P&L. Three disagreeing net-income definitions on the one path; a `if (ytdRevenue > 0)` escape hatch lets a zero-revenue company declare anything; the ledger-writing path bypasses board approval; declaration is irreversible, non-atomic, with no void.
- **Affected modules:** Partners (dividend/distribution), Governance (resolutions — dead-coded out of the path).
- **Business/legal impact:** the product green-lights TTK 509 over-distribution → **criminal-liability exposure for the customer.**
- **Accounting impact:** distributable computed on a figure that may include uncollected KDV and exclude the tax provision.

### RC-4 · Built for a populated expert company, not for a new user
**Cause.** No onboarding gate; signup auto-creates a generically-named company and drops the user on an executive CEO cockpit that fabricates a mid-range health score from neutral defaults (50/50/100/50/50 on null). The one good asset — a setup checklist — is orphaned (surfaced nowhere). ~50 tabs are invisible in the sidebar (`NavItem.children` unpopulated). EmptyStates are inconsistent and CTA-less.
- **Affected modules:** dashboard landing, nav/sidebar, auth/register, every hub's empty state.
- **Business impact:** high 60-second abandonment; the depth reads as "too complex for me"; fabricated scores erode trust in *every* number.

### RC-5 · Analytics over-built; statutory table-stakes missing
**Cause.** Engineering invested ~5–10× in advanced analytics (cohort/RFM/market-basket/heatmaps/concentration ×4) while the legally-required core is absent: **no e-Fatura/e-Arşiv/e-Defter**, no bank feed, no recurring invoicing, payroll analytics with no bordro engine, KDV engine missing input VAT / devreden / tevkifat.
- **Business impact:** a Turkish KOBİ above threshold cannot legally invoice → Flowra is a shadow ledger, not the system of record. Adoption-blocking.
- **Accounting impact:** net KDV payable overstated; personnel cost hand-keyed elsewhere.

### RC-6 · Surface sprawl mirrors the service sprawl
**Cause.** Because each calculation has its own service, each got its own tab — 8 overlapping distribution tabs, two governance homes, two report packs, three names for "create a sale". The UX duplication is the *visible shadow* of RC-1.
- **Impact:** cognitive overload; an owner can't tell which of 8 tabs is the real one to act in; a TTK fix must touch up to 7 surfaces.

> **The through-line:** RC-1 (no canonical figure) is the master cause; RC-2/3 are its dangerous expressions in the ledger and the dividend; RC-6 is its UX shadow; RC-4/5 are the missing foundations around it.

---

## STEP 2 — FINAL PRODUCT VISION (Flowra V2, built today)

**Principle:** one canonical kernel per figure → one service → one surface. Calculations live in a
typed **Financial Core**; every screen is a *view* over it, never its own calculator.

### Final module map (6 centers)
| Center | Purpose | Composition |
|---|---|---|
| **Ana Sayfa** | adaptive landing | getting-started until data threshold → CEO cockpit after |
| **Ticari** | sell-side lifecycle | Pipeline (+proforma), Satışlar (+e-Fatura issuance), Tahsilatlar, Müşteriler |
| **Operasyon** | buy-side & stock | Giderler (+e-Fatura inbound), Katalog, Stok, Satın Alma (PO→receipt→3-way) |
| **Finans** | the books & reporting | Tablolar (Kâr/Zarar·Bilanço·Nakit, all GL-posted) · Vergi (one KDV + one Kurumlar kernel) · Yönetim (CFO cockpit incl. Mizan, one Rapor Paketi, AI Analiz) |
| **Ortaklar** | partner financing | Pozisyon Özeti (roll-up landing) · Sermaye · Krediler · Dağıtım (one declare + one read-only simulator) · Risk |
| **Yönetişim** | governance & audit | Kararlar (actions+resolutions+decisions) · Takvim&Taahhüt · Denetim (hazırlık+iz+export+belgeler) |

### Final accounting architecture
GL is **primary** (not shadow). Every transaction posts a balanced journal; statements read the
posted ledger. Periods **lock at filing** — backdated edits route to an adjustment workflow. Retained
earnings is derived independently (no residual plug). One net-revenue function (ex-KDV), one matrah
kernel (COGS + deductible + KKEG), one net-income kernel consumed everywhere, CI-asserted to agree.

### Final governance architecture
Dividends flow **only** through the resolution-linked path: a declaration requires a `resolution_id`
and is gated on a *system-computed* distributable-profit figure (net-of-tax, less 580 losses and
mandatory reserves). Declaration is atomic; reversal/void exists. The audit hash-chain is mandatory,
transactional, HMAC-keyed.

### Final reporting / finance / dashboard architecture
One canonical dataset behind a single **Rapor Paketi** (CFO + board views are tabs of it), generated
server-side into period-stamped immutable PDFs. The dashboard detects zero-data and never invents a
score. AI Analiz is a Finance tab over the canonical dataset (margin-walk, variance, close-readiness).

### Per-module classification
| Module / surface | Verdict | Note |
|---|---|---|
| Financial Core (typed calc kernel) | **REWRITE** | one canonical service per figure; the heart of V2 |
| getRevenue (gross→net) | **REWRITE** | subtract KDV; consume existing net column |
| Corporate-tax (2 engines) | **MERGE→1** | one matrah kernel (authority decision) |
| Balance sheet (2 impls, residual plug) | **MERGE→1 + REWRITE** | GL-driven, derived retained earnings |
| Net-income paths (×3+) | **MERGE→1** | single kernel, CI-asserted |
| GL (shadow) | **KEEP+ACTIVATE** | cutover to primary; the builders already exist |
| Period locking | **SPLIT (new)** | write-time lock + adjustment workflow |
| Dividend/distribution (8 tabs/7 svcs) | **MERGE→1 declare + 1 simulator** | resolution-gated, system-computed basis |
| Partners Pozisyon Özeti | **SPLIT (new)** | per-partner roll-up = hub landing |
| 220 services | **DELETE losers / MERGE** | declare canonicals; lint forbids re-introduction |
| Retail analytics (cohort/RFM/basket) | **MOVE** | behind one optional "İleri Analiz" |
| e-Fatura/e-Arşiv/e-Defter | **SPLIT (new)** | licensed integrator; system of record |
| Bank feed / recurring invoicing | **SPLIT (new)** | table-stakes ops |
| Payroll analytics (no engine) | **REWRITE or integrate** | don't ship analytics with no bordro |
| Onboarding + setup checklist | **REWRITE (wire)** | first-run gate; promote the orphaned checklist |
| Sidebar children | **KEEP+POPULATE** | expose tabs |
| Two governance homes | **MERGE→1** | one Yönetişim |
| Two report packs | **MERGE→1** | one dataset, CFO/board as views |
| Insights hub | **MOVE** | → Finance AI Analiz tab |
| Documents hub | **MOVE** | → Yönetişim Denetim |
| Komuta tab | **MERGE** | → always-on banner |

---

## STEP 3 — GAP ANALYSIS (current → target)
| # | Gap | Sev | Business value | Effort | Risk | Expected impact |
|---|---|---|---|---|---|---|
| G1 | Revenue is gross KDV (no net kernel) | CRIT | trust foundation | L | med | every figure becomes correct |
| G2 | Two corporate-tax engines disagree | CRIT | defensible tax | M | med | one filed number |
| G3 | 3+ net-income paths diverge | CRIT | trust | L | med | screens agree to the cent |
| G4 | GL dormant; statements un-posted | CRIT | auditable books | XL | high | statutory book of record |
| G5 | Dividend "safety" on typed input | CRIT | legal safety | M | med | removes TTK 509 exposure |
| G6 | No e-Fatura/e-Defter | CRIT | adoption gate | XL | high | becomes system of record |
| G7 | No write-time period lock | HIGH | immutable close | M | med | reproducible board packs |
| G8 | No onboarding / fabricated empty scores | HIGH | conversion | M | low | new users activate |
| G9 | 220 services / tab sprawl | HIGH | maintainability+trust | L | med | one number per concept |
| G10 | `companyId=""` in Partners panels | HIGH | correctness/tenant | S | low | panels render correct scope |
| G11 | No bank feed / recurring invoicing | HIGH | daily stickiness | XL | med | cash stays accurate |
| G12 | Silent COGS row caps | MED | quiet wrong P&L | S | low | visible completeness warning |
| G13 | Sidebar tabs invisible | MED | discoverability | S | low | product surface visible |
| G14 | EmptyState CTA-less | MED | activation | S | low | every tab pulls forward |
| G15 | Register/confirm strands user | MED | conversion | S | low | fewer signup dead-ends |
| G16 | KDV missing input/devreden/tevkifat | MED | KDV accuracy | M | med | correct net KDV |
| G17 | Audit chain best-effort | MED | tamper-evidence | M | med | real audit trail |
| G18 | Payroll analytics, no engine | MED | completeness | XL | med | personnel in-system |
| G19 | Over-built analytics | LOW | focus | M | low | engineering refocus |

---

## STEP 4 — EXECUTION ROADMAP (priority order: correctness → accounting → security → data → reliability → UX → maintainability → perf → polish)
1. **Trust kernel** — G1, G3, G2 (one net-revenue / net-income / matrah; CI-asserted). *Authority.*
2. **Dividend safety** — G5 (system-computed basis, resolution-gated, atomic+void). *Authority.*
3. **GL activation + period lock** — G4, G7. *Project + authority (cutover).*
4. **e-Fatura/e-Defter** — G6. *Project + vendor.*
5. **Onboarding + correctness fixes** — G8, **G10**, G13, G14, G15, G12. *Mostly SAFE.*
6. **Consolidation** — G9 (canonical services; tab merges). *Mixed.*
7. **Ops integrations** — G11, G16, G17, G18. *Project + authority.*
8. **Refocus** — G19. *Safe-ish.*

---

## STEP 5 — AUTONOMOUS EXECUTION (SAFE vs DECISION)
**SAFE TO EXECUTE (number-neutral, low-risk — verified against code before any edit):**
- **G10** `companyId=""` Partners panels — pure correctness/tenant-scope fix.
- **G13** populate `NavItem.children` — additive nav links, no behavior change.
- **G14** consistent EmptyState + first-step CTA — presentational.
- **G15** register/confirm accurate message + resend link — UX-only (no auth-logic change).
- **G8 (part)** zero-data dashboard → welcome state instead of a fabricated score — number-neutral.
- **G12 (part)** *visible* data-completeness warning when a COGS row cap trips — adds a warning, changes no figure.
- **Honest relabel (part of G1)** "Net Satışlar" → "Brüt Satış (KDV dâhil)" *without recomputing* — makes the label truthful while the real net-revenue recompute stays a decision.

**REQUIRES BUSINESS DECISION (decision packages — DP-#):**
- **DP-A (G1 recompute):** revenue net-of-KDV — changes every reported figure. *Recommend: yes, with a regression snapshot; revenue = total − kdv_amount_try.*
- **DP-B (G2):** canonical corporate-tax engine. *Recommend: the COGS+KKEG matrah kernel (`getCorporateTax`), retire `estimateCorporateTax`.*
- **DP-C (G3):** canonical net-income kernel — pick the one all screens consume.
- **DP-D (G5):** dividend basis = system-computed distributable profit; route through resolution path. *Recommend: yes.*
- **DP-E (G4/G7):** GL shadow→primary cutover + period lock. *Recommend: parallel-run, reconcile, guided cutover.*
- **DP-F (G6):** e-Fatura integrator selection. *Recommend: licensed entegratör (Logo/Foriba/Uyumsoft).*
- **DP-G (G9 dividend/capital/tax surfaces):** which of the duplicate statutory surfaces is canonical (the 3 PROTECTED clusters from doc 09).

---

## STEP 6 — QUALITY STANDARD (the scorecard V2 is measured against)
Fewer workflows · fewer duplicate calculations · fewer duplicate services · fewer duplicate dashboards
· fewer duplicate tabs · fewer contradictions — while increasing trust · accounting accuracy ·
operational clarity · maintainability · production readiness. **No new feature ships until the figure
it displays comes from the canonical kernel.**

---

## STEP 7 — EXPECTED FINAL STATE
A KOBİ owner signs up → guided setup → issues a legal e-Fatura → it posts to a real GL → the P&L,
tax, and board pack all read the *same* net figure → at year-end the dividend wizard pre-fills a
system-computed, legally-safe distributable profit, gated on a board resolution, atomic and
reversible. One number per concept, one surface per workflow, every screen a view over a trusted
core. **6 centers · ~31 tabs · 0 contradictory figures.**

*(Execution log of the SAFE items appended below as they land.)*
