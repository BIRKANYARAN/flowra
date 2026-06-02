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
