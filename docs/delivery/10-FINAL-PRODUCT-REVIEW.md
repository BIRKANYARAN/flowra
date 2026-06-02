# FLOWRA — FINAL PRODUCT REVIEW (evaluation only, no changes)

Five reviewers — ERP consultant, CFO, CEO, external auditor, product architect — each walked
Flowra exactly as it exists today against the real code. Findings are classified A–H, each with
severity / impact / frequency / recommended direction. Nothing here was implemented.

> **One-line verdict.** Flowra is an impressively deep partner-financing / CFO-analytics engine
> bolted onto a thin, untrustworthy transactional core. Its headline numbers are wrong at the root
> (gross KDV booked as "Net Satışlar", a dormant GL, 10+ duplicated services that disagree); its
> highest-stakes action (dividend distribution) projects fake TTK 509 "safety" on a hand-typed
> number; and it cannot legally invoice in Turkey. Before another feature, it must earn trust in
> **one source of truth**, make **dividends genuinely safe**, and ship **e-Fatura**.

---

## A. What is confusing
- **[critical]** Revenue labeled "Net Satışlar" is actually **gross KDV-inclusive** (`finance.service.ts getRevenue` sums `total`, never subtracts `kdv_amount_try`; a net column exists from the proforma migration but the read path ignores it). Overstates top-line ~18–20% and every downstream margin/matrah. The label actively misleads.
- **[critical]** Balance sheet **always "balances"** — retained earnings is a residual plug (`retainedEarnings = assets − liabilities − paidInCapital`), so `isBalanced` is always true and can never surface a posting error.
- **[high]** ~50 sub-tabs are **invisible in the sidebar** (`nav-config.ts NavItem.children` unpopulated; tabs reached only via `?tab=` URLs). Day-one discoverability ≈ zero.
- **[high]** **Two "Yönetişim" destinations** (`/dashboard/governance` vs `/dashboard/admin/governance`); the Partners hero links to the lesser one, so owners can't find resolution-voting when authorizing a distribution.
- **[high]** Partners hub passes **`companyId=""`** to LoanCovenantPanel / RiskCompositeTab / ContributionTimelineTab / EquityWaterfallTab (page.tsx ~527/530/538/567) → empty-scope queries (empty/error render, possible cross-tenant risk). *Correctness bug, not just UX.*
- **[medium]** "Where do I create a sale?" — no `/dashboard/sales`; it's a tab inside "Ticari Akış" (cockpit calls it "Ticari"), and proformas exist in two places. Three names for one flow.
- **[medium]** Default landing is an advanced CEO cockpit — wrong altitude for a user with no data.
- **[medium]** Effective tax disagrees across screens: income-statement `EBT×25%` vs financial-core `matrah×25%` (EBT ≠ matrah).
- **[medium]** Trial-balance close checklist flags every credit-normal account (liability/equity/revenue) as "abnormal" — false alarms erode trust in the close wizard.

## B. What is duplicated
- **[critical]** **220 `*.service.ts` with no canonical owner**: working-capital ×3, burn-rate ×2, breakeven ×2, treasury ×2, revenue-forecast ×2, plus capital-statement / customer-credit / supplier / cohort families. Different hubs show different numbers for the same metric.
- **[critical]** **Two corporate-tax matrah engines disagree**: `getCorporateTax` (revenue − FIFO COGS − deductible, honors KKEG) vs `estimateCorporateTax` (gross − all-expenses, no COGS, hardcoded 0.25). Neither defensible for geçici vergi.
- **[high]** **Exact-name service collisions**: `tax-calendar.service.ts` and `tax-compliance.service.ts` exist under *both* `lib/services/tax/` and `lib/services/finance/`.
- **[high]** **8 overlapping distribution tabs** (Geri Ödeme, Kâr Dağıtımı, Dağıtım Simülatörü, Temettü, Dağıtım Geçmişi, Getiri Projeksiyonu, Getiri, Huzur Hakkı) over **7 services** — a TTK fix must land in up to 7 places.
- **[high]** **Two balance-sheet implementations** (Finance residual-plug vs board-pack `BalanceSheetService`) — on-screen Bilanço can differ from the download.
- **[high]** **CFO Paketi vs Yön. Paketi** — two overlapping report assemblies; unclear which is the signed board deliverable.
- **[medium]** Competing intelligence engines: two health scorers, kpi-scorecard/threshold/tracker, situation-engine ×2, two narrative generators.

## C. What is missing
- **[critical]** **No onboarding flow** — signup → `/dashboard` (auto-creates a generically-named company), no wizard for name/currency/fiscal year, no redirect to the (existing) setup checklist.
- **[critical]** **No e-Fatura / e-Arşiv / e-Defter** — zero implementation, no GİB/integrator connector, no UBL-TR. A KOBİ above threshold cannot legally invoice → Flowra is a shadow ledger, not the system of record. *Blocks adoption.*
- **[critical]** **Double-entry GL dormant by default** (`gl_mode='shadow'`, `dualWrite` returns null) — no posted Mizan/journal; statements run on parallel TS aggregators with row caps. No statutory book of record.
- **[high]** **Setup checklist is orphaned** — the single best onboarding asset, surfaced nowhere on the landing/sidebar/nav.
- **[high]** **No accounting-period lock at write time** — backdated entries into a closed/filed period silently change reported numbers. Control/audit failure.
- **[high]** **No automated bank feed** (manual import only; no MT940/CAMT/PSD2) — cash position drifts from reality.
- **[high]** **No recurring/subscription invoicing** — MRR analytics exist but nothing generates the next invoice.
- **[high]** **Dividend declaration irreversible + non-atomic** (sequential non-transactional inserts; no void path) — one typo from an unfixable partial distribution.
- **[medium]** CFO Pack doesn't generate the PDF/ZIP it advertises (no server-stored immutable per-period deliverable).
- **[medium]** Audit hash-chain opt-in/best-effort (silent no-op, no server HMAC) — presented as stronger than it is.
- **[medium]** KDV engine omits purchase input VAT (returns 0), devreden KDV carry-forward, KDV-2 tevkifat, rate validation — net KDV payable overstated.
- **[medium]** Period-close journal lacks 580 prior-year loss offset / second legal reserve / first dividend — non-compliant kâr dağıtım waterfall.
- **[medium]** Payroll is analytics-only (no employee master / bordro / SGK). Email-confirmation register strands the user.

## D. What is unnecessary
- **[high]** **Analytics over-built ~5–10× beyond what a 5–20-person SME acts on** (cohort/RFM/market-basket/heatmaps/concentration ×4). Budget spent here is budget not spent on e-Fatura / bank feeds / payroll.
- **[medium]** **Silent COGS row caps** (`.limit(2000…20000)`, only `console.warn`) understate cost → overstate profit and tax, with no on-screen signal.
- **[medium]** No demo/sample-data path for normal users (seed locked behind admin/ENABLE_SEED) — can't see a healthy populated Flowra before committing real data.
- **[low]** Partners Risk/Capital sections force-stack three advisory panels each → tab sprawl traded for long vertical scroll.

## E. What would frustrate a first-time user
- **[critical]** No onboarding gate — lands on an executive dashboard built for a populated company; first impression is a wall of ₺0 KPIs with no next step. High 60-second abandonment.
- **[high]** Empty company shows a misleading amber "dikkat gerektiriyor" health banner with fabricated-looking scores (situation-engine neutral defaults produce a mid-range composite on null data) — looks like the system invented numbers.
- **[high]** The best onboarding asset (setup checklist) is invisible.
- **[medium]** Empty hubs dead-end with terse "Henüz … yok" and no first-step CTA; no safe demo-data explore option.

## F. What would frustrate a CFO
- **[critical]** Every headline statement is an **estimate, not a posted ledger** (GL shadow) — a CFO cannot sign a close on un-posted aggregations with row caps and 1:1 FX fallbacks.
- **[high]** "Distributable" cash is cash-basis and **ignores COGS, corporate tax, and TTK 509 reserves** — read as "we can pay this out" → over-distribution exposure.
- **[high]** **No period lock / immutable close** — last month's board pack stops matching the system after a backdated edit.
- **[medium]** FX falls back to 1:1 with no data-quality indicator.
- **[low]** AI Insights limited to anomalies/duplicates — no margin-walk / variance commentary for the board pack.

## G. What would frustrate an accountant / auditor
- **[critical]** Revenue & corporate-tax matrah on **gross KDV-inclusive sales** — output KDV is the state's money, never revenue (MSUGT/TTK); inflates Kurumlar Vergisi.
- **[critical]** **GL dormant** — no yevmiye/defter-i kebir/Mizan; auditor gets an empty-but-balanced ledger that doesn't tie to the statements.
- **[critical]** Dividend distributable derives from `accounting_periods.net_profit_try` which can include uncollected KDV and exclude the tax provision → platform green-lights **TTK 509 over-distribution** and prints an authorizing Turkish narrative.
- **[high]** Two corporate-tax engines disagree; **no write-time period lock**; KDV engine missing input VAT / devreden / tevkifat.
- **[high]** **Multiple parallel net-income paths** (FinanceService SQL, income-statement re-sum, GL trial-balance, `net_profit_try`) with no enforced reconciliation — the structural cause of the divergences (the repo even ships gl-divergence tooling because they disagree).
- **[medium]** FX 1:1 silent default; close journal missing 580/reserve/first-dividend; hash-chain weak; trial-balance checks raise false "abnormal" flags.

## H. What would frustrate a company owner
- **[critical]** Dividend legal safety is computed on a number the owner **types by hand** — the typed "Dönem Net Gelir" flows straight into PCLEEngine and produces the green "TTK 509 uyumlu / 4-layer safety" verdict with zero validation against the actual P&L.
- **[critical]** **Three disagreeing net-income definitions** on the single dividend path — contradictory distributable figures depending on which tab/button, all systematically overstating.
- **[high]** **Zero-revenue escape hatch** — declare guards wrapped in `if (ytdRevenue > 0)`, so a company with no sales can declare *any* dividend.
- **[high]** The ledger-writing dividend path **bypasses board approval**; the TTK-compliant resolution-linked path exists but is dead code — a paid dividend can't be traced to its authorizing Genel Kurul resolution.
- **[high]** **No single "where do I stand" per-partner roll-up** — capital, loans, lifetime dividends, ROI/MOIC, equalization, risk smeared across 6+ tabs each with its own number base.
- **[high]** Dividend declaration irreversible / non-atomic with no surfaced void path.

---

# FLOWRA V2 PRODUCT ROADMAP (prioritized by business value)

### 1 · One source of truth for the numbers — *the trust foundation* `[L]`
Revenue overstated ~18–20%, two tax engines disagree, 3+ net-income paths diverge → **no figure on any screen can be trusted.** Prerequisite for everything else being sellable.
- Single **net-revenue** function (`revenue = total_try − kdv_amount_try`); relabel any gross figure "Brüt Satış (KDV dâhil)"; regression test asserting revenue excludes output KDV.
- Collapse to **one matrah/corporate-tax kernel** (COGS + deductible-only + KKEG + shared rate); derive the P&L provision from it; show EBT→matrah reconciliation.
- One **net-income kernel** consumed by Kâr/Zarar, Gelir Tablosu, dividend basis, report packs; CI asserts they agree to the cent.
- Push COGS aggregation DB-side to remove silent row caps; visible data-completeness warning if a cap is hit.
- **Never** default FX to 1:1 — flag/exclude missing-rate rows + exception list.

### 2 · Make dividend distribution actually legally safe (TTK 509/519 + governance linkage) `[M]`
The highest-stakes owner action projects false confidence → direct TTK 509 criminal-liability exposure. Fixing it turns the partner-financing depth from a liability into the flagship differentiator.
- Pre-fill "Dönem Net Gelir" from the canonical after-COGS, after-tax P&L; manual entry becomes a loud "manuel giriş — denetlenmemiş" override that strips the "uyumlu" wording.
- Define distributable **PROFIT** (net-of-tax accumulated profit less 580 prior losses and mandatory reserves) separate from distributable **CASH**; gate the verdict on the legal figure.
- Replace the `revenue>0` escape hatch with an equity/retained-earnings-backed test; block (not silently allow) on missing data.
- Route the UI through the compliant (Pattern A) path or require a `resolution_id` on the write; surface the authorizing resolution in Dağıtım Geçmişi.
- Make declaration **atomic** (single Postgres function) + admin reversal/void with reason.

### 3 · e-Fatura / e-Arşiv / e-Defter — become the legal system of record `[XL]`
Without legal e-invoicing the target customer must re-key every invoice into a separate GİB tool. This single capability gates adoption and willingness to pay for the whole platform.
- Integrate a licensed entegratör (Logo/Foriba/Uyumsoft); emit UBL-TR from existing sales/proforma records.
- Treat invoice issuance as a first-class transaction state, not a PDF afterthought.
- e-Defter (XBRL-GL) export once the GL is live; validate KDV rates (1/10/20) + basic KDV-2 tevkifat.

### 4 · Activate the double-entry GL and lock periods (auditable books) `[XL]`
The "TTK double-entry" selling point is currently *off*. Activating it + period locks gives a defensible book of record, an immutable close, and reproducible board packs.
- Surface GL state in the UI (posted vs estimate banner); treat shadow-mode statements as "preview".
- Run parallel mode with the existing gl-divergence tooling, reconcile daily, guided cutover to `gl_primary`.
- Enforce **period locks at write time** — reject/route backdated edits in closed periods to an adjustment workflow.
- Snapshot/freeze period statements on lock; drive the balance sheet from the GL (stop presenting the residual plug as a control).
- Make audit hash-chain **mandatory/transactional** (DB trigger) + HMAC-keyed.

### 5 · First-run onboarding + adaptive empty states `[M]`
Cheap relative to conversion impact; surfaces assets already built.
- First-run gate: confirm/rename company, currency + fiscal year → land on the setup checklist until required steps done.
- Promote the orphaned checklist (first-login redirect + persistent "Kurulum %X" card + sidebar entry).
- Detect zero-data state — render a welcome/empty cockpit, never a composite health score from neutral defaults.
- Adaptive landing (simple home until a data threshold, then the CEO cockpit); standardized rich EmptyState with a "create your first X" CTA; safe reversible "Demo verisiyle keşfet" sandbox; fix register/confirm flow.

### 6 · Consolidation: collapse duplicate services and tab sprawl `[L]`
220 service files with 10+ competing implementations mean screens disagree and every fix lands in N places.
- Declare one canonical service per concept (extend FLOWRA_CANONICALS.md); lint/test forbidding re-introduced parallels; start with exact-name collisions.
- **Fix the `companyId=""` bug** in Partners (pass the real active company id).
- Collapse 14 partner tabs → ~5 (Ortaklar, Sermaye, Krediler, Dağıtım, Risk); 8 distribution tabs → one declare workflow + one read-only simulator; de-dup the two Risk surfaces.
- Add a per-partner **"Pozisyon Özeti"** roll-up as the Partners default landing.
- Pick one governance home; one canonical reporting dataset behind both packs; populate `NavItem.children` so tabs show in the sidebar; relegate retail analytics behind one optional "İleri Analiz" area.

### 7 · Table-stakes operational integrations `[XL]`
Keep the core promise (cash visibility) accurate; remove manual re-entry.
- Automated bank-statement ingestion (MT940/CAMT/CSV, ideally TR open-banking) into the existing matcher.
- Recurring-invoice templates + scheduled job feeding the MRR analytics.
- Server-side, period-stamped immutable CFO/board PDFs/ZIP.
- Decide payroll scope (minimal bordro→GL posting, or integrate) — don't ship payroll analytics with no engine.
- Expose inventory valuation method (FIFO vs ağırlıklı ortalama) as a setting; wire the workflow engine as a hard gate on expense/PO above threshold + 3-way match; extend Insights to variance narration.

---

## How to read this roadmap
Themes 1–2 are **trust/legal correctness** — they change *numbers and statutory outcomes*, so each needs your accounting/tax sign-off before implementation (they are exactly the PROTECTED clusters flagged in `09-UX-ARCHITECTURE.md`). Themes 3–4 & 7 are **large capability builds** (integration + GL cutover) needing a project plan, not an autonomous edit. Theme 5 (onboarding) and the consolidation in Theme 6 — plus the **`companyId=""` correctness bug** — are the parts that are safely buildable without authority decisions and would be the natural next execution targets *if and when you move from review back to build*.
