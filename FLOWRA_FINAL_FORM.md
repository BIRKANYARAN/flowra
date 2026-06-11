# FLOWRA — FINAL FORM

> Clean-sheet redesign target. Written as if the repo were empty. Grounded in a
> brutal audit of the current product (321 API endpoints, 100 of them orphaned,
> ~60 page/tab surfaces). This document is the north star every refoundation wave
> steers toward. Authored 2026-06-10.

---

## 1. PRIMARY IDENTITY (pick ONE)

**Flowra is the Turkish SME owner's financial operating system.**

NOT an ERP. NOT a generic accounting package. NOT a CFO analytics suite. It is the
*patron's* cockpit for running the money side of a small company — with a **clearly
separate annex for the mali müşavir** (accountant) and an **optional advanced layer**
for those who want depth. Everything else exists only to serve that owner.

- **Primary user:** the owner (patron) — NOT an accountant. Wants answers, not metrics.
- **Secondary user:** the mali müşavir — wants the deep accounting (mizan, journal,
  period-close, KDV/kurumlar, reconciliation).
- **Tertiary:** a salesperson — wants to sell and collect.

## 2. THE FIVE QUESTIONS the owner opens Flowra to answer

1. **Param var mı?** (cash position + runway)
2. **Para kazanıyor muyum?** (profit this month / trend)
3. **Bana kim borçlu?** (receivables + overdue)
4. **Ben ne ödeyeceğim, ne zaman?** (tax + debt + supplier calendar)
5. **Sat → tahsil et → harca** (the daily operating loop)

If a screen doesn't help answer one of these (for the owner) or isn't core accounting
(for the müşavir), it does NOT belong in the primary surface.

## 3. ROOT CAUSES (why it feels like "a pile of features")

- **Feature-as-screen reflex:** every finance/CFO textbook metric became its own
  endpoint + tab. 163 of 321 endpoints are analytics; 100 are fully orphaned.
- **No owner/accountant boundary:** owner-finance (P&L, cash, tax) and accountant-depth
  (mizan, journal, period-close, board pack) live tangled in the same Finance hub.
- **Discovery by accident:** the deep GL tools (`/dashboard/cfo/*`) have NO nav home —
  reachable only by burrowing through a Finance tab. The owner can't find what matters;
  the müşavir can't find their tools.
- **Analytics as default, not on-demand:** consultant-grade analysis is shown inline
  instead of being pulled up when a decision needs it.

## 4. FINAL-FORM INFORMATION ARCHITECTURE

Three audiences, three clearly-separated zones. The owner never wades through the
accountant's tools; the accountant has a real home; advanced analytics are opt-in.

```
OWNER ZONE (default, the daily product)
  • Bugün            — the 5-questions answer in one screen (cash·profit·owed·due·todo)
  • Satış & Tahsilat — proforma → sale → collection → customer   (money IN)
  • Gider & Stok     — expense → supplier → catalog → stock → order (money OUT + ops)
  • Finans           — owner money-health ONLY: P&L · Nakit · Vergi · Bilanço
  • Ortaklar         — partner capital · loans · distributions    (capital)

ACCOUNTANT ZONE (Muhasebe — the müşavir's home, was scattered & hidden)
  • Mizan · Yevmiye (journal) · Defterler · Dönem Kapanış · KDV/Kurumlar detay
  • Mutabakat (reconciliation) · Yönetim Paketi (board pack) · Resmi Export

ADVANCED ZONE (Gelişmiş — opt-in, never in the owner's daily path)
  • Planlama & Senaryo · AI İçgörü · Belgeler · the deep analytics (kept ones)

SYSTEM ZONE (Sistem)
  • Yönetim (users/roles) · İş Akışları · Yönetişim · Ayarlar
```

## 5. PER-SURFACE VERDICT FRAMEWORK

Applied to every screen/endpoint. Default verdict for analytics with 0 owner-decision
value AND 0 UI wiring = **DELETE**.

| Verdict | Meaning | Examples (current → final) |
|---|---|---|
| KEEP | Core to the 5 questions | Bugün, Satış, Tahsilat, Nakit, Vergi |
| RESHAPE | Keep but redesign owner-first | Finance hub (strip accountant tabs) |
| MOVE | Right feature, wrong zone | cfo/* GL tools → Muhasebe zone |
| MERGE | Duplicate/overlapping | command-KPI surfaces, duplicate aging views |
| HIDE | Valuable but not daily | scenarios, deep planning, AI panels → Gelişmiş |
| DELETE | Built-but-never-used sprawl | 100 orphaned endpoints + their dead services |

## 6. TRANSFORMATION ROADMAP (autonomous waves)

Each wave = own gated commit (rm .next · tsc · vitest · build) + deploy. Stop only at
tax/accounting/dividend/partnership/legal CALCULATIONS or data-loss ops.

- **W1 — Dead-code purge:** delete the 100 orphaned API endpoints + services no longer
  imported. ~36% backend surface gone. Pure hygiene, 0 UX risk (0 refs, git-reversible).
- **W2 — Accountant zone:** give the müşavir a real "Muhasebe" home in nav, gathering the
  currently-hidden `/dashboard/cfo/*` GL tools + board pack + certified export.
- **W3 — Finance owner-first:** strip accountant depth out of the Finance hub → Finans =
  Kâr/Zarar · Nakit · Vergi · Bilanço only (CFO/Reports tabs MOVE to Muhasebe).
- **W4 — Analytics opt-in:** the wired-but-non-daily consultant analytics fold into
  "Gelişmiş" / pull-up-on-demand; owner hubs carry only decision-driving numbers.
- **W5 — Bugün home:** the home becomes the definitive 5-questions answer; demote
  overlapping command/KPI surfaces.
- **W6 — Coherence pass:** one voice for empty states, headers, loading, terminology.

## 7. SUCCESS TEST

The owner opens Flowra and within 30 seconds knows their cash, profit, who owes them,
and what's due — without ever seeing a mizan or an HHI index. The müşavir opens
"Muhasebe" and everything they need is in one place. Nobody ever asks "neredeydi bu?".
It reads as one product designed by one team in one sitting — not a decade of accretion.
