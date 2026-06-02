# FLOWRA — Ideal UX Architecture (Product-Architect Redesign)
### Reduce *user* complexity ≥50% — not code complexity

A 5-dimension product audit mapped every hub, tab, and workflow against the actual code. Flowra's structure is already mature (every center uses 2-level grouped nav), so the user-complexity problem is **feature/tab sprawl + redundant and overlapping tabs**, not flat walls.

**Current:** 8 nav centers · **60 tabs** · 2 single-page hubs · 7 cross-hub duplications.
**Ideal:** 6 centers · **31 tabs** · 0 redundant hubs. **−48% tabs raw; >50% user complexity** once the 2 demoted hubs + 7 cross-hub dups collapse.

---

## The ideal architecture (target)

| Center | Now | Ideal | Move |
|---|---|---|---|
| **Finance** | 10 | **6** | Tablolar (Kâr/Zarar, Bilanço, Nakit) · Vergi&Risk (Vergi[absorbs Kurumlar V.], Riskler) · Yönetim (CFO[absorbs Mizan], Raporlar[CFO+Board pack merged]). Gains an **AI Analiz** tab (from Insights). |
| **Partners** | 18 | **8** | Sermaye (Ortaklar, Sermaye Hesabı[+contributions+dilution], Sermaye Ekstresi) · Krediler (Defter, Borç Dilimleri[+Amortisman +Borç Baskısı]) · Dağıtım&Risk (Kâr Dağıtımı[unifies distribution+simulator+dividend+ledger+compensation+waterfall], Getiri[+returns], Risk[+risk-composite]). |
| **Planning** | 11 | **6** | Senaryo (Senaryolar, Gerçek vs Plan) · Karlılık&Nakit (Karlılık[unit-profit+breakeven], Nakit Projeksiyonu) · Plan (Bütçe, Takvim). debt-pressure/partner-impact→Partners; tasks→Tasks; **scenario-compare deleted**. |
| **Commercial** | 5 | **4** | Pipeline[absorbs Proformalar + a collapsible Dönüşüm Analizi], Satışlar, Tahsilatlar, Müşteriler. |
| **Operations** | 5 | **4** | OpsCommandPanel banner = landing (Komuta folded in), then Giderler, Katalog, Stok, Satın Alma. |
| **Governance** | 9 | **3** | Kararlar (actions+resolutions+decisions) · Takvim&Taahhüt · Denetim (Hazırlık + Denetim İzi + Sertifikalı Export + Belge Kütüphanesi). Sermaye Hesapları→Partners. |
| **Insights** | hub | **→ Finance tab** | AI Analiz Merkezi demoted to a Finance tab (shares the CFO audience). |
| **Documents** | hub | **→ Governance** | Belge Kütüphanesi folds into the Denetim page (already deep-linked from audit readiness). |

---

## Executed now (safe — zero capability loss, deployed)
1. **DELETE Planning `Karşılaştırma` (scenario-compare).** Verified it renders **illustrative/fake data** — `MultiScenarioTab.tsx:142` "(illustrative)" and `:591` "Gerçek veri entegrasyonu production ortamında etkinleştirilir" (i.e. NOT real data). The real comparison lives in the `Senaryolar` tab (real DB), its debt-timeline in `Borç Baskısı`. Removing a misleading fake-data tab is both a simplification **and** a "no mock data" quality fix. (tab + nav entry + component removed.)
2. **MOVE Partners `Huzur Hakkı` (compensation)** from the *Krediler* (debt) group into the *Dağıtım* (payout) group — it is a partner payout (TTK 394), not a loan. Pure regrouping, loses nothing.

(Gate: tsc 0 · 25558 tests · build green.)

---

## NEEDS YOUR DECISION (the bulk of the 50% — feature merges, not blind deletes)
Each preserves a distinct data source or render mode, or is an accounting/governance call:

**Finance**
- MERGE `Kurumlar V.` → `Vergi` — pick the authoritative corporate-tax source (`TaxService.estimateCorporateTax` vs `TaxComplianceService` obligation-tracked provision).
- MERGE `Yön. Paketi` (board pack) → `CFO Paketi` — same period→generate→download flow, but two APIs; the board pack's on-screen exec-summary/ratios/alerts preview must be preserved.
- MOVE `Mizan` into the CFO cockpit (it's the only full interactive trial balance; placement decision).

**Partners** (18→8 — the biggest win)
- MERGE `Dağıtım Simülatörü` + `Temettü` → `Kâr Dağıtımı` — three surfaces run the same TTK 509/519 + GVK 94 math; **which dividend-declare path is canonical** (direct vs admin-approval workflow) is a governance decision.
- DELETE `Risk Skoru` (risk-composite) → `Risk` — a 3rd partner-risk scorer producing the same A–F grades; pick the canonical scoring service.
- MERGE `Getiri` (returns) → `Getiri Projeksiyonu` (equity-waterfall superset) — reconcile ROI vs return_ratio.
- FOLD `Taahhüt Takvimi` → `Sermaye Hesabı`; `Amortisman` → `Borç Dilimleri` (layout work).

**Planning / cross-hub**
- MOVE `Borç Baskısı` (debt-pressure) → Partners *Krediler*; MERGE `Ortak Etkisi` (partner-impact) → Partners distribution simulator (confirm tax models match); MOVE `Görevler` (tasks) → the Tasks hub.

**Other**
- Governance `Sermaye Hesapları` → Partners (reconcile the two capital-account services); MOVE Insights → Finance tab; MOVE Documents → Governance; MERGE Commercial `Proformalar` → Pipeline; FOLD Operations `Komuta` → its always-on banner; MERGE Governance `Denetim İzi` + `Veri Dışa Aktarma` into a unified Denetim page.

---

## Cross-hub duplications to resolve
Capital accounting (Partners ↔ Governance) · debt analytics (Planning ↔ Partners) · distribution simulation (Planning ↔ Partners) · AI analytics (Insights ↔ Finance/CFO) · documents (Documents ↔ Governance) · tasks (Planning ↔ Tasks hub).

## Stop condition
The 2 zero-capability-loss consolidations are executed and deployed. The remaining redesign (which carries the rest of the >50% reduction) consists of **feature merges with accounting/governance implications** — each needs your sign-off on which surface/figure is canonical before I implement it. Pick any cluster above and I'll execute it.

---

## Execution status (authorized run — "do pure-UX, defer authority changes")

**Done autonomously (pure UX — zero accounting/legal/tax/governance authority change, deployed). Tabs 60 → 55:**
- DELETE Planning `Karşılaştırma` (scenario-compare) — fake/illustrative data; real view is `Senaryolar`. (−1)
- MOVE Partners `Huzur Hakkı` (compensation) → payout group (regroup, ±0 tabs).
- Partners `Amortisman` → `Borç Dilimleri`, and `Taahhüt Takvimi` + `Seyreltme` → `Sermaye Hesabı` — two views of the **same object** co-located (genuinely more coherent, not just stacked). (−3)
- Governance `Veri Dışa Aktarma` (certified export) → `Denetim Hazırlığı` — one low-frequency action folded. (−1)

Old deep-links to every removed tab alias to the host tab; all capabilities preserved; tsc · 25,558 tests · build green at each step.

**Deferred — BUSINESS MEANING changes (need your accounting/governance sign-off; the bulk of the remaining reduction):**
- Finance `Kurumlar V.`→`Vergi` (authoritative corporate-tax source); Partners `Temettü`+`Dağıtım Simülatörü`→`Kâr Dağıtımı` (canonical dividend-declare path); `Risk Skoru`→`Risk` (canonical scorer); `Getiri`→`Getiri Projeksiyonu` (ROI vs return_ratio); Planning `Ortak Etkisi`→Partners simulator (tax models must match); Governance `Sermaye Hesapları`→Partners (reconcile two capital-account services).

**Deferred — needs INTEGRATION DESIGN (pure-UX in principle, but blind stacking would create scroll/overload, violating the anti-scroll goal — needs a unified view, not co-location):**
- Finance `Yön. Paketi`→`CFO Paketi` (one report selector, preserve board preview); `Mizan`→CFO cockpit (placement in an already-dense view); Commercial `Proformalar`→`Pipeline` (integrate two funnels); Operations `Komuta`→banner (expandable drill-downs); Governance 9→3 (build sub-tab nav per group); cross-hub MOVES Insights→Finance tab, Documents→Governance (relocate hub-as-tab + repoint nav/deep-links).

**Honest tally:** the safe-blind pure-UX reductions take Flowra 60 → 55 tabs. Reaching the 31-tab target requires the **6 accounting/governance decisions** and the **integration-design merges** above — each preserves a distinct figure or render mode, so doing them blind would either change a number or make the UX worse. Approve any cluster (e.g. "Partners canonical: dividend=approval-workflow, risk=pcle, returns=equity-waterfall") and I'll implement that consolidation end-to-end.

---

## Product-owner consolidation run (authorized: do all non-authority changes)

**Executed (pure-UX, verified-safe, deployed). Tabs 60 → 52:**
- Partners: `Amortisman`→`Borç Dilimleri`; `Taahhüt Takvimi`+`Seyreltme`→`Sermaye Hesabı`; **`Risk Skoru`→`Risk`** (advisory composite scorer). 18→14.
- Commercial: **`Proformalar`→`Pipeline`** (same teklif→satış lifecycle). 5→4.
- Planning: **`Birim Kâr`+`Başabaş`→one `Karlılık` tab**; `scenario-compare` deleted (fake data). 11→9.
- Governance: `Veri Dışa Aktarma`→`Denetim Hazırlığı`. 9→8.
- All via verbatim component co-location, graceful URL aliasing, no calc change. tsc · 25,558 tests · build green at every step.

**Corrected an agent error:** the finance `CFO Paketi` (`reports`) tab is NOT a dead stub — it's a functional 273-line CFO-pack generator. NOT removed.

**Remaining safe items — implementable but need careful per-item work + visual QA (cross-hub relocation risks silently breaking a relocated component's internal navigation; blind execution can't verify the rendered result):**
- Insights hub → a Finance `AI Analiz` tab (extract the insights page body; repoint nav/MobileBottomNav/middleware).
- Documents hub → Governance tab (reuse DocumentsClient; **must repoint its internal router.replace targets** or filters break).
- Operations `Komuta` → always-on banner (changes the default landing tab).
- Planning `Borç Baskısı` → Partners (DebtPressureTab is an RSC; partners page is a client component — needs a server wrapper).
- Partners `Getiri`→`Getiri Projeksiyonu` (advisory, but requires porting the ROI figure into equity-waterfall.service — a calc-path change).
- → each takes Flowra toward ~47 tabs; recommend doing one at a time with a visual check.

**PROTECTED — do NOT auto-consolidate (statutory figures differ):**
1. **Capital accounts** (Governance `Sermaye Hesapları` vs Partners `Sermaye Hesabı`) — the two services compute DIFFERENT per-partner capital (committed/unpaid vs book-equity). Also a **live bug**: `capital-account.service.ts:118` selects non-existent `share_ratio`/`is_active` columns → Partners book-equity is NaN/0 today. Needs a shareholder/accounting ruling on the canonical capital definition (and the bug fixed regardless).
2. **Corporate tax** (`Kurumlar V.` vs `Vergi`) — `estimateCorporateTax` (no COGS, ×25%) vs `computeCorporateTaxProvision` (60% COGS proxy) give materially different KV. Tax-authority decision.
3. **Distribution simulators** (Planning `Ortak Etkisi` vs Partners `Dağıtım Simülatörü`) — **KEEP BOTH**: cash-basis equalization (no withholding) vs TTK 509/519 + GVK 94 net-of-stopaj — different statutory payout numbers.
