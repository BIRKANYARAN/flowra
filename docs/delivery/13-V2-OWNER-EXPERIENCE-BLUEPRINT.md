# FLOWRA V2 — OWNER EXPERIENCE BLUEPRINT

*A second clean-sheet review of the V2 blueprint, re-lensed for ONE user: a Turkish SME owner — not an accountant, CFO, or auditor. The test applied to every module: "Would a company owner use this weekly?" If no → hide / move / merge / automate. Design only — no code.*


---

## Executive summary

The accountant-coherent V2 (6 centers / 28 tabs organized around the data model) is correct engineering and wrong product for this user. A non-financially-trained Turkish SME owner with 10 minutes a day does not have an accounting job to do; they have five recurring worries — do I have cash, am I making money, who owes me, can I pay my people, and (rarely) how much can I legally take out. The blueprint's job is therefore not to expose the 12 modules but to convert them into answers and approvals. Every statement, matrah, mizan, journal, and close checklist is plumbing that already proves correctness via CI to the kuruş; none of it earns a pixel in the owner's product. The owner-first inversion is total: the data model stays as-is underneath, and a thin owner skin sits on top that surfaces only DECISIONS and STATUS, in owner language, pushed rather than pulled.

Concretely, the owner product is a notification-first surface with one default landing ('Bugün') that answers 'am I okay?' in a single traffic-light line, a Cash/runway view expressed in weeks-of-affordability, a profit direction line, an approvals inbox, and a dividend home where the distributable number is computed and read-only (legal-by-construction). All four angles converge on the same shape and disagree only on count and packaging; the resolution is six owner destinations (Bugün, Param, Kârım, Ortaklar & Dağıtım, Onaylar, and one quiet Muhasebe door for the mali müşavir) with Bugün as a 0-3 card feed where a green empty queue tells the owner to close the app. Tax, close, statements, FX, e-Defter, equalization, and the audit chain all become background jobs that surface — if at all — as a single push ('vergi için X TL ayır, son gün 26') or a one-line status badge ('Mayıs kapandı'). The success metric is fewer owner-minutes, not more engagement.


> **Verdict.** Keep the kuruş-correct accountant engine exactly as built, then bury all 28 tabs behind six owner-decision destinations — Bugün, Param, Kârım, Ortaklar & Dağıtım, Onaylar, and one quiet Muhasebe door — so the owner only ever sees a green light, a runway in weeks, a name to chase, a profit direction, and a read-only 'dağıtabilirsin' number, and is pushed in only when a real decision needs them.


---

## The 9 questions, answered

**1. What does the owner see in the first 30 seconds?**

Owner opens the app and lands on 'Bugün'. The very first line is a traffic-light verdict in plain Turkish — green 'Her şey yolunda' or red/amber 'Dikkat: ...'. Directly under it: nakit (e.g. 'Kasada 480.000 TL — ~9 hafta yeter'), then a 0-3 card action queue (kimi arayayım / şu ödemeyi onayla / şu kadar dağıtabilirsin). On a clean day the queue is empty, the line is green, and the honest message is 'bir şey yapmana gerek yok' — the owner can close the app. No chart, no widgets, no tabs to scan. The whole 'am I okay?' answer is resolved above the fold on a phone in one vertical glance.


**2. The 5 most important decisions Flowra helps the owner make**

- D1 — Maaş/ödeme yapabilir miyim? A YES/NO with the gap in TL and weeks ('Evet, maaşlar güvende' or 'Hayır, 35.000 TL eksik, 2 hafta içinde'). Sourced from cash.ts + forecast.engine.ts runway.
- D2 — Kimi arayayım? Exactly ONE name to chase, ranked by amount × overdue-days ('Önce Acme A.Ş. — 120.000 TL, 45 gün gecikme'), with a one-tap reminder send. The full aging table is demoted to the Muhasebe door.
- D3 — Bunu karşılayabilir miyim? For any proposed spend/hire, runway-before vs runway-after in weeks ('Bu gideri eklersen 9 hafta → 6 hafta'). Forecasting baked into one before/after line, not a scenario tool.
- D4 — Ne kadar dağıtabilirim? The distributable ceiling computed by governance + PCLE, shown read-only as 'Dağıtılabilir: X TL' with a single approve button — the owner can never type the number, which is simultaneously the owner-first and the compliance win. Sourced from dividend-calculator.service.ts.
- D5 — Gerçekten kâr ediyor muyum? A direction + recent average ('Bu ay kâr +85.000 TL, son 3 ay ortalaması artıyor'), never a P&L. Sourced from financial-core.ts / Gelir Tablosu collapsed to one number.

**3. Modules that become background automation**

- Ledger Kernel — every sale/expense/e-Fatura posts double-entry automatically; owner never sees a debit/credit.
- Financial Core (Figure<T>/provenance) — computes every owner number once; owner sees the answer, never the calculation graph.
- KDV — nets automatically from posted invoices; surfaces only as a 'set aside X TL by the 26th' push.
- GVK stopaj — auto-derived from payroll/rent/professional payments; folds into the single monthly tax set-aside figure.
- e-Fatura ingestion (incoming) — supplier invoices auto-ingest and post as payables; owner pulled in only to approve the payment.
- FX (kur) — rates fetched and revaluation posted automatically; owner pulled in only if exposure becomes a fire.
- PCLE equalization / returns (denkleştirme) — waterfall math runs automatically; only each partner's distributable share reaches the owner, and only at dividend time.
- Governance audit hash-chain — tamper-evidence runs fully in the background as evidence for auditors/disputes.
- Period-close mechanics — the engine runs; the owner receives only a 'Mayıs kapandı' confirmation push once the accountant finishes.

**4. Dashboards that disappear (from the owner's view)**

- Bilanço (Balance Sheet) — moved to the Muhasebe door, auto-emailed to the mali müşavir at close.
- Gelir Tablosu (Income Statement) — collapsed into the single 'bu ay kâr/zarar' line on Bugün; full statement stays accountant-side.
- Nakit Akış statement (3-section operating/investing/financing) — replaced for the owner by the 13-week runway; formal statement lives in Muhasebe.
- Mizan (Trial Balance) — hidden completely; pure reconciliation artifact that exists only so CI ties to the kuruş.
- Reports library surface — removed from owner nav; the 2-3 numbers that matter are pushed to Bugün, never browsed.
- Close monitoring surface — accountant-only; owner sees at most a one-line 'kapandı' badge.
- Forecasting / scenario tool — its one useful output (the runway / 'cash runs out' line) is baked into Param; deep simulation hidden until a D3 decision needs it.

**5. Reports generated automatically (pushed, not browsed)**

- Bilanço, Gelir Tablosu, Nakit Akış — generated at period-close and auto-emailed to the mali müşavir, never to the owner's inbox.
- e-Defter (legal ledger book) + berat — generated and filed to GIB in the background; owner never opens the XML.
- KDV beyanname / matrah worksheet — computed in the background; owner sees only the 'set aside X TL, son gün 26' push.
- Kurumlar matrah — computed at close; surfaces to owner only as the tax set-aside figure.
- 'Aylık Karne' (monthly plain-language verdict) — auto-generated AFTER the accountant finishes close, gated so the owner only ever sees a final clean verdict + optional distribution approval.
- 'Sizin için ne hallettik' confidence line — auto-compiled (e-Fatura count, invoices processed, reminders sent) as the trust mechanism for boring-by-default.

**6. Workflows that genuinely require human (owner) action**

- A1 — Approve a large outgoing payment (above a safe-default threshold); default is HOLD, don't send.
- A2 — Chase / approve a collection — confirm the one 'kimi arayayım' reminder goes out (D2).
- A3 — Approve a new recurring cost / hire — shown with the runway-before/after impact (D3).
- A4 — Consent to a dividend/distribution — one-tap on the read-only computed ceiling, which also auto-drafts the governance resolution (D4).
- A5 — Respond to a fire — a critical alert (payroll gap, cash cliff, debt pressure) needs an owner call now.
- A6 — Confirm a flagged anomaly — a one-tap 'bu doğru mu?' on an unusual transaction. (Plus, rarely, confirm an ortak hareketi — a partner putting money in or pulling it out — with equalization running underneath.)

**7. The daily experience**

Most days the owner never opens the app: the system runs, and if nothing needs a human it stays silent. When the owner does open Bugün, it is a 0-3 card feed under a green verdict line and the nakit/runway figure. A perfect day is zero cards and one green line — the explicit message is 'leave the app'. Only critical-severity events (payroll gap, cash cliff, true fire) generate an immediate/daily push; everything else waits. Daily action, if any, is A1/A2/A5 — approve a payment, send one chase, or respond to a fire — each resolvable in one or two taps without navigating a tab tree.


**8. The weekly experience**

Monday brings a single batched digest rolling up the week's warning-severity items (a slipping receivable, a thinning runway, an upcoming tax set-aside) into a short owner-language summary, plus the 'what we handled for you' confidence line (e-Fatura issued, invoices processed, reminders sent). The owner spends a few minutes confirming the chase list (D2), eyeballing runway (D3 if a spend is pending), and clearing the Onaylar inbox. No mizan, no statements, no close — those are never on the weekly path.


**9. The monthly experience**

Monthly is explicitly NOT the close. The period-close engine, mizan, and KDV beyanı stay 100% in the Muhasebe area and run as the accountant's job. The owner's monthly moment is GATED behind the accountant finishing close: once locked, the owner receives a clean plain-language 'Aylık Karne' (did I make money, where's cash heading, here's the tax set-aside already reserved) and, only when governance + PCLE prove it legal AND cash-feasible, a 'Dağıt' card showing the read-only distributable ceiling (D4). If distribution isn't legal/affordable, that card simply doesn't appear. The owner never sees the close checklist, the locks, or the adjustments — only the final verdict and at most one approval.


---

## Owner navigation — redesigned around decisions, not accounting concepts

- BUGÜN (default landing) — the 'am I okay?' glance: traffic-light verdict line → nakit + runway in weeks → 0-3 card action queue → 'bu ay kâr' direction line. A green empty queue tells the owner to close the app. Behind it: situation.engine.ts, alert.engine.ts, cash.ts, financial-core.ts.
- PARAM (Cash) — 'param var mı, kime ödeyebilirim, kim bana borçlu': the 13-week runway as '~X hafta yeter', this-week money in/out, and the single 'kimi arayayım' chase card (D1, D2, D3). Behind it: forecast.engine.ts + cash.ts; the Nakit Akış statement and aging table are NOT here — they live in Muhasebe.
- KÂRIM (Profit) — 'gerçekten kâr ediyor muyum': one direction + average line and the tax-set-aside reminder folded into the cash picture (D5). Behind it: financial-core.ts / collapsed Gelir Tablosu; full P&L lives in Muhasebe.
- ORTAKLAR & DAĞITIM (Partners & Distribution) — the wedge and the one thing the owner actively wants: 'ne kadar dağıtabilirim' shown read-only as 'Dağıtılabilir: X TL' with one approve button (auto-drafts the resolution), plus rare one-tap 'ortak hareketi' confirms (D4). Behind it: dividend-calculator.service.ts, PCLE equalization, governance resolutions — all computed, never typed.
- ONAYLAR (Approvals inbox) — the push channel made into a destination: the owner's entire job as a queue of A1-A6 (approve large payment, approve chase, approve hire, consent to dividend, respond to fire, confirm anomaly), each one-tap with a safe default (hold/retain). Behind it: alert.engine.ts with actionLabels translated to owner language.
- MUHASEBE (one quiet accountant door) — everything accountant-facing quarantined behind a single door the owner can reach but is never routed to: Bilanço, Gelir Tablosu, Nakit Akış statement, mizan, journals, chart of accounts, matrah/KDV/stopaj worksheets, e-Defter XML/berat, period-close checklist + locks, audit hash-chain, Figure provenance drill. This is the mali müşavir's destination, not the owner's daily path.

### What the owner LITERALLY never sees

- Mizan (trial balance) — pure reconciliation artifact, hidden entirely; exists only so CI ties to the kuruş.
- Journal lines / debit-credit postings — every sale, expense, e-Fatura, and FX revaluation posts invisibly.
- Chart of accounts / Tek Düzen hesap numbers (590, 690, etc.) — never shown; owner language only.
- Kurumlar matrah worksheet — surfaces only as a 'vergi için X TL ayır' set-aside push.
- KDV beyanname form — surfaces only as 'bu ay KDV X TL, son gün 26'.
- GVK stopaj derivation / tahakkuk detail — folded silently into the monthly tax set-aside.
- e-Defter XML and berat — generated and filed to GIB in the background.
- Bilanço, Gelir Tablosu, and the formal 3-section Nakit Akış statement — auto-emailed to the mali müşavir, behind the Muhasebe door, never on the owner's path.
- Retained-earnings / PCLE equalization waterfall — only each partner's distributable share ever reaches the owner, and only at dividend time.
- Period-close checklist, locks, and adjusting entries — accountant workflow; owner gets only a 'Mayıs kapandı' badge.
- Governance audit hash-chain — tamper-evidence for auditors/disputes, fully background.
- Figure<T> provenance / calculation drill — owner sees the answer, never the graph.
- FX rate management — rates and revaluation handled automatically; owner pulled in only if exposure becomes a fire.
- Reports library and scenario/forecasting simulation UI — replaced by pushed numbers on Bugün and the runway line; deep simulation appears only when a D3 decision needs it.
- Raw alert actionLabels in accounting language (Mizan Görüntüle, Tranche Detayı, Dönemi Kapat, Waterfall Simüle Et) — translated to owner language or hidden before they ever reach the owner.

---

## Module-by-module automation triage

| Module / surface | Owner weekly? | Verdict | Why |
|---|---|---|---|
| 1. Ledger Kernel (posted double-entry GL) | — | BACKGROUND_AUTOMATION | The journal is plumbing; every sale/expense/e-Fatura posts automatically. The owner must never see a debit/credit. Pure engine. |
| 2. Financial Core (Figure<T> with provenance) | — | BACKGROUND_AUTOMATION | The compute-once engine that feeds every owner number. Invisible by design — owner sees the answer, never the calculation graph. |
| 3a. Statements — Bilanço (Balance Sheet) | — | MOVE_TO_ACCOUNTANT | Owner can't read a balance sheet and doesn't need to weekly. Lives in the accountant's pack; auto-generated at close, emailed to muhasebeci. |
| 3b. Statements — Gelir Tablosu (Income Statement) | — | MERGE_INTO_DECISION | Owner cares about 'am I making money', not the P&L format. Collapse to a single 'Bu ay kâr/zarar' number on the glance screen; full statement stays accountant-side. |
| 3c. Statements — Nakit Akış (Cash Flow Statement) | — | MERGE_INTO_DECISION | The formal 3-section cash flow statement is for the accountant. Owner's cash question is answered by the 13-week runway, not by operating/investing/financing buckets. |
| 3d. Statements — Mizan (Trial Balance) | — | HIDE | Pure accounting reconciliation artifact. Zero owner value, ever. Exists only so CI ties to the kuruş. Hide completely from owner UI. |
| 4a. Tax — Kurumlar matrah (corporate tax base) | — | MOVE_TO_ACCOUNTANT | Matrah is a filing artifact the owner can't influence by viewing. Compute in background; surface to owner only as 'Vergi için ~X TL ayır' set-aside, push as alert. |
| 4b. Tax — KDV (VAT) | — | BACKGROUND_AUTOMATION | KDV nets automatically from posted invoices. Owner only needs the push: 'Bu ay KDV ödemesi: X TL, son gün 26'. No KDV screen. |
| 4c. Tax — GVK stopaj (withholding) | — | BACKGROUND_AUTOMATION | Withholding is auto-derived from payroll/rent/professional payments. Pure background calc; folds into the monthly 'tax to set aside' figure. |
| 5a. Compliance — e-Fatura / e-Arşiv issuance | ✅ | OWNER_FRONT_STAGE | This IS the owner's daily act — 'send the invoice'. Keep it dead-simple and front-stage; the ledger posting behind it is invisible. The one compliance touchpoint owners actually use. |
| 5b. Compliance — e-Fatura ingestion (incoming) | — | BACKGROUND_AUTOMATION | Incoming supplier invoices auto-ingest and post as payables. Owner is pulled in only to approve payment, not to file the document. |
| 5c. Compliance — e-Defter | — | MOVE_TO_ACCOUNTANT | Legal ledger book generation/submission is 100% accountant/GIB territory. Generated and filed in background; owner never opens it. |
| 6a. Governance — Resolutions (kararlar) | — | MERGE_INTO_DECISION | Not weekly. Surface only when a decision legally REQUIRES a resolution (e.g. dividend) — present as a one-tap 'Onayla & karar oluştur', auto-drafted. Otherwise hidden. |
| 6b. Governance — Audit hash-chain | — | HIDE | Tamper-evidence infrastructure. Owner never sees it; it's evidence for auditors/disputes. Fully background. |
| 6c. Governance — Dividend (kâr dağıtımı) | — | MERGE_INTO_DECISION | Rare but high-value owner moment. Legal-by-construction: owner can't type a number, system shows 'dağıtılabilir: X TL' and a single approve button. Decision, not a module. |
| 7a. PCLE — Capital accounts (sermaye hesapları) | — | MOVE_TO_ACCOUNTANT | Per-partner capital ledgers are accounting detail. Owner sees only the distillation when taking profit ('senin payın: X'). Not a weekly screen. |
| 7b. PCLE — Partner loans (ortak cari/borç) | — | MERGE_INTO_DECISION | Matters only at a moment of action (a partner puts in / pulls out money). Surface as a simple 'ortak hareketi' confirm; the equalization math runs underneath. |
| 7c. PCLE — Equalization / returns (denkleştirme) | — | BACKGROUND_AUTOMATION | Pure waterfall math. Runs automatically; only its OUTPUT (each partner's distributable share) ever reaches the owner, and only at dividend time. |
| 8. Period-close engine + close checklist | — | MOVE_TO_ACCOUNTANT | Close is explicitly the accountant's job. The checklist, locks, and adjustments live in the accountant workspace. Owner only gets a 'kapanış tamam' confirmation push. |
| 9. FX (kur) | — | BACKGROUND_AUTOMATION | Rates fetched and revaluation posted automatically. Owner pulled in only if FX exposure becomes a fire (alert), never to manage rates. |
| 10. Alerts (thin alert engine) | ✅ | OWNER_FRONT_STAGE | This is the owner's primary interface — the 'push' channel. 'Is anything on fire?' is answered here. Must be ruthless: only true decisions/risks, no noise. |
| 11a. View — Cockpit (glance screen) | ✅ | OWNER_FRONT_STAGE | The 10-minutes-a-day home. One glance: cash, runway, profit, who owes me, can I pay people. The owner's whole world should fit here. |
| 11b. View — Reports surface | — | MOVE_TO_ACCOUNTANT | Formal report library is accountant-facing. Owner never browses reports; the 2-3 numbers that matter are pushed to the Cockpit, not pulled from a reports tab. |
| 11c. View — Cash surface (13-week runway) | ✅ | OWNER_FRONT_STAGE | 'Do I have cash / can I pay people' — the single most-checked owner question. The runway view earns front-stage; fold the cash-flow statement away behind it. |
| 11d. View — Close surface | — | MOVE_TO_ACCOUNTANT | Close monitoring/locks are accountant workflow. Owner sees a one-line status badge at most ('Mayıs kapandı'), not a surface. |
| 12. Forecasting | — | MERGE_INTO_DECISION | Owner won't open a scenario tool weekly. Bake its single useful output — the runway / 'when does cash run out' line — into the Cash glance. Deep simulation hidden until a decision needs it. |


---

# Detailed designed angles



## A — The Owner's Decisions & First Glance

## Angle A — The Owner's Decisions & First Glance

The owner opens Flowra the way they open WhatsApp: standing up, coffee in hand, 10 minutes, looking for one feeling — **"am I okay or is something on fire?"** Everything below is built so that feeling arrives in the first screen, in Turkish owner-language, with zero accounting vocabulary. The posted GL, Financial Core (`lib/finance/financial-core.ts`), `situation.engine.ts`, `forecast.engine.ts`, `cash.ts`, and `alert.engine.ts` already compute every number needed — the owner just never sees the machinery that produces them.

---

### 1. The First 30 Seconds — the literal landing ("Bugün" / Today)

There is **one** landing screen. Not a dashboard with 12 widgets. Not a nav with 28 tabs. A single vertical scroll, phone-first, that answers "am I okay?" before the owner's thumb moves. Five blocks, in this exact order, because this is the order an anxious owner's brain asks the questions:

**Block 0 — The one-line verdict (the "headline")**
A single sentence + a single color, top of screen, the size of a headline. This is the only thing 60% of owners will ever read.

> 🟢 **"İşler yolunda. Bu hafta seni bekleyen kritik bir şey yok."**
> 🟡 **"Dikkat: 1 müşteri 45 gün gecikti, maaş gününe 11 gün var."**
> 🔴 **"ACİL: 9 gün sonra kasada maaş için para kalmıyor."**

Source: `situation.engine.ts` reduces all alerts to a single worst-state verdict. One traffic light. If it's green, the owner can close the app and go run their business — and that is a feature, not a failure.

**Block 1 — Nakit (Cash): "Param var mı, ne kadar dayanır?"**
The single most important number for an SME owner, biggest type on the screen.

```
₺ 847.000   bugün kasada + bankada
────────────────────────────────
Bu paghazır gidişatla  ~9 hafta yeter
(maaş, kira, vergi, ödemeler düşülmüş hâliyle)
```
A 13-week runway, but expressed as **"~9 hafta yeter"** — never "13-week cash projection." Source: `forecast.engine.ts` / `cash.ts`. The bar underneath is a simple horizontal fuel-gauge (yeşil → sarı → kırmızı), not a line chart. No axes, no journal, no "590 hesabı."

**Block 2 — Bu hafta para hareketi: "Bu hafta ne girecek, ne çıkacak?"**
Two numbers, side by side, owner-language:

```
↘ Çıkacak bu hafta   ₺ 210.000   (maaş ₺140k, tedarikçi ₺55k, KDV ₺15k)
↗ Girecek bu hafta   ₺  95.000   (3 müşteri ödemesi bekleniyor)
```
The KDV/tax line appears here as a **payment the owner must make** ("vergi ödemesi ₺15k, son gün 26 Haziran"), never as "matrah" or "tahakkuk." Source: forecast inflows/outflows + the tax module's *due dates only* (the calculation stays with the accountant).

**Block 3 — Sana düşen işler (Owner's action queue): "Benden ne bekleniyor?"**
The push, not pull. 0–4 cards, each a **decision or approval**, each tap-to-resolve. If empty: *"Şu an senden bekleyen bir şey yok 👍"*. Examples:
- 🔴 *"Ahmet Tekstil 45 gündür ödemedi (₺62.000). Hatırlatma gönder?"* → [Hatırlat] [Ertele] [Ara]
- 🟡 *"Yeni proforma onayın bekliyor: Beta Ltd, ₺38.000"* → [Onayla] [Reddet]
- 🟢 *"Bu çeyrek ₺120.000 kâr payı dağıtabilirsin (yasal sınır içinde)."* → [İncele]

Source: `alert.engine.ts` filtered to **owner-actionable only**. Accountant tasks (close, reconciliation, e-Defter) never surface here — they go to the accountant's separate area (O1).

**Block 4 — Kâr ediyor muyum? (this month, one line)**
The owner's second-biggest anxiety, but deliberately *fourth* because cash beats profit for survival. One sentence, no income statement:

> **"Bu ay şu ana kadar ₺73.000 kâr** (geçen aya göre +%8). Satış ₺410k, gider ₺337k."

Tappable to a plain-language trend, never to "Gelir Tablosu / 6xx hesapları."

> **Design rule:** if Blocks 0–4 all render green and empty-queue, the screen literally says *"Her şey yolunda, görüşmek üzere 👋"* and the owner is **encouraged to leave**. Flowra's success metric is *fewer* owner-minutes, not more.

---

### 2. The 5 Decisions — the spine the whole owner experience hangs on

Every owner-facing surface in V2 exists to serve one of these five decisions. If a screen doesn't feed one of these, it belongs to the accountant (O2). Each decision = **one question in owner words → one number that resolves it → where it comes from.**

| # | Owner's question (verbatim) | The ONE answer | Source (existing plumbing) |
|---|---|---|---|
| **D1** | *"Bu ay maaşları / kirayı ödeyebilir miyim?"* | **"Evet — maaş gününde kasada ~₺430k olacak, ihtiyaç ₺140k. Rahatsın."** (or "Hayır, ₺60k açık var, şu 2 tahsilatı öne çek") | `forecast.engine.ts` runway projected to the next payroll date; outflow schedule from cash module. Binary YES/NO + the gap if NO. |
| **D2** | *"Hangi müşterinin peşine düşeyim?"* | **"Ahmet Tekstil — ₺62.000, 45 gün gecikme. En büyük ve en geç olan bu."** One name, not an aging table. | Receivables (`alacak`) ranked by `amount × overdue-days`, surfaced as a single "chase this one" card. The full aging list lives one tap deeper for the curious; the owner sees the top 1. |
| **D3** | *"Bu kişiyi işe alabilir / bu makineyi alabilir miyim?"* | **"₺25k/ay maaşlı birini alırsan paran 9 → 6 hafta düşer. Riskli ama mümkün."** A before/after runway, in weeks. | `forecast.engine.ts` re-run with the new recurring/one-off outflow (the "ne olur eğer" simulator, stripped to one slider + one sentence). No NPV, no scenario matrix for the owner. |
| **D4** | *"Ne kadar kâr payı çekebilirim — yasal olarak?"* | **"Bu yıl ₺120.000 dağıtabilirsin. Bunu aşamazsın (yasal sınır)."** The owner *reads* the number; cannot *type* it. | Governance + Partner Capital (PCLE): dividend is **legal-by-construction** — distributable amount = computed from posted equity, reserves (yedek akçe), prior losses. Owner sees the ceiling + a one-tap "Dağıt" that generates the resolution. |
| **D5** | *"Gerçekten para kazanıyor muyum, yoksa öylesine mi dönüyor?"* | **"Son 3 ay: kâr ediyorsun, ayda ortalama ₺68k. Trend yukarı."** A direction (↑/→/↓) + an average, not a P&L. | Financial Core profit `Figure<T>` over a trailing window. Resolves the "ciro çok ama para yok" confusion by pairing profit with cash (D1) on the same card. |

---

### Why this ordering and these five (opinionated calls)

- **Cash before profit, always.** SMEs die from running out of cash, not from a bad income statement. D1 outranks D5. The landing leads with Nakit (Block 1), not "kârlılık."
- **One name, not a table** (D2). An owner with 10 minutes will not read an aging report. Flowra does the ranking and points at the single highest-leverage action. The table is the accountant's tool, demoted one level.
- **The owner can never type the dividend** (D4). This is the single most dangerous number an untrained owner could fabricate. Legal-by-construction means the worst case is the owner reads a *correct, conservative* ceiling. This is an owner-first *and* a compliance win simultaneously.
- **D3 is a feeling, not a model.** "Can I afford this hire" becomes "9 weeks → 6 weeks," because weeks-of-runway is the only unit of affordability an untrained owner intuitively grasps. The NPV/IRR machinery (`simulation.service.ts`) stays in the accountant/CFO area.
- **Tax appears only as a due-date and an amount-to-pay**, folded into D1's cash picture (Block 2). The owner never meets "matrah," "KDV beyannamesi," or "stopaj" — only "26 Haziran'da ₺15k vergi ödemen var, kasanda var, sorun yok."

### The spine, stated once
> **Flowra's entire owner experience = the Bugün screen answering "am I okay?" in 30 seconds, plus five decisions (Maaş ödeyebilir miyim · Kimi sıkıştırayım · Şunu alabilir miyim · Ne kadar dağıtabilirim · Kazanıyor muyum) — each collapsed to ONE number the owner reads but rarely types.** Everything that isn't one of these is plumbing, and plumbing is invisible.

**Key decisions:**
- Single landing screen ('Bugün'), phone-first vertical scroll, leading with a one-line traffic-light verdict — not a multi-widget dashboard.
- Order Blocks by owner anxiety: Verdict → Nakit (cash/runway in weeks) → This-week money in/out → Action queue (push) → Profit this month. Cash deliberately outranks profit.
- 13-week runway is always expressed as '~9 hafta yeter', never as a projection/chart — weeks-of-runway is the owner's native unit of affordability.
- Five decisions are the spine: D1 Can I make payroll (YES/NO + gap), D2 Who to chase (one name), D3 Can I afford this (runway before/after in weeks), D4 How much can I distribute (legal-by-construction ceiling, read-only), D5 Am I actually profitable (direction + average).
- Receivables surface as a single 'chase this one' card ranked by amount×overdue-days; the aging table is demoted to the accountant level.
- Dividend number is computed and read-only — owner can never type it — making D4 both an owner-first and a compliance win.
- Tax appears ONLY as a payment due-date + amount folded into the cash picture; never as matrah/KDV/stopaj/beyanname.
- Success metric is fewer owner-minutes: a green, empty-queue landing tells the owner to leave the app.
- All five answers source from existing plumbing (forecast.engine.ts, cash.ts, situation.engine.ts, alert.engine.ts, financial-core.ts, PCLE/governance dividend), so no new computation is invented — only re-lensed.


## ANGLE B — MODULE-BY-MODULE AUTOMATION TRIAGE

## Angle B — Module-by-Module Automation Triage (Owner-First)

The blueprint has ~12 modules and ~28 tabs organized around the **data model**. The owner doesn't have a data model — he has five questions: *do I have cash, am I making money, who owes me, can I pay people, is anything on fire* (and rarely: *can I legally take profit out*). Below, every module and sub-surface is judged by one test: **would the owner open this weekly?** The answer is "no" for almost everything — which is correct. The accountant-coherent app stays; we just stop showing it to the owner.

### The verdict at a glance

Out of 25 modules/sub-surfaces, exactly **4 are owner front-stage**: the **Cockpit glance**, the **Cash runway**, **e-Fatura issuance**, and the **Alerts push feed**. Everything else is engine, accountant territory, or a decision that only appears when it must.

---

### (3) Which modules become background automation

These run silently and never appear in the owner's UI. They only ever surface a *result*, and usually only via a push.

| Module | What runs in the dark | What (if anything) reaches the owner |
|---|---|---|
| **Ledger Kernel** | Every sale, expense, payroll, FX reval, and e-Fatura posts a balanced journal automatically | Nothing. Ever. |
| **Financial Core** | Each figure computed once with provenance | Nothing — owner sees the answer, not the graph |
| **KDV** | VAT nets from posted invoices each period | One push: *"Mayıs KDV: 84.200 TL, son gün 26 Haziran"* |
| **GVK stopaj** | Withholding derived from payroll/rent/serbest meslek | Folds into the single monthly "vergiye ayır" figure |
| **e-Fatura ingestion (gelen)** | Supplier invoices auto-ingest and post as payables | Owner pulled in only to *approve the payment* |
| **PCLE equalization / returns** | Two-phase normalized waterfall recomputes on every capital event | Output only, and only at dividend time |
| **FX** | Rates fetched, revaluation posted | Only if exposure becomes a fire → alert |
| **Audit hash-chain** | Tamper-evidence chain extends on every write | Nothing — it's evidence for auditors, not a screen |

**Design rule:** if a module's job is *accuracy* or *compliance*, it is a background job by default. The owner's involvement is an exception that must be *earned* by a genuine decision — not a tab he's expected to visit.

---

### (4) Which dashboards / surfaces disappear from the owner

These exist in the accountant-coherent app and stay there — but they leave the **owner's** navigation completely. They move to a separate **Muhasebe Çalışma Alanı** (accountant workspace, separate login/role) or vanish.

**Gone to the accountant workspace:**
- **Bilanço (Balance Sheet)** — owner can't read it, doesn't need it weekly.
- **Mizan (Trial Balance)** — pure reconciliation; *zero* owner value forever.
- **e-Defter** — GIB legal-book generation/submission, 100% accountant/GIB.
- **Kurumlar matrah** — a filing artifact the owner can't influence by looking at it.
- **Capital accounts (sermaye hesapları)** — per-partner ledgers; owner sees only the distilled "senin payın" at payout.
- **Period-close engine + close checklist + Close surface** — close is explicitly the accountant's job; owner gets a one-line *"Mayıs kapandı"* badge.
- **Reports library** — the formal report catalog. Owner never browses; numbers come to *him*.

**Collapsed into the Cockpit (no longer their own screen):**
- **Gelir Tablosu** → one line: *"Bu ay kâr: +312.000 TL"*.
- **Nakit Akış statement** → replaced entirely by the 13-week runway on the Cash glance.
- **Forecasting / simulation** → reduced to the single runway line ("nakit ne zaman biter").

**Net effect on the owner's nav:** from ~6 centers / ~28 tabs down to **4 things**: *Bugün* (Cockpit glance), *Nakit* (runway), *Fatura Kes* (e-Fatura), and the *Uyarılar* push feed. The 28-tab map still exists — for the accountant.

---

### (5) Which reports generate automatically (pushed, not pulled)

The owner should never click "generate report." The system produces them on a schedule and **delivers** them. Two delivery lanes: a small set the owner sees as a *push*, and a full pack the accountant gets by email.

**Pushed to the owner (the only reports he ever experiences):**

| Trigger | What's pushed | Form |
|---|---|---|
| Every Monday 08:00 | *"Bu hafta: Nakit 1.2M TL · 9 hafta dayanır · Bu ay kâr +312K · Sana borçlu olanlar 480K (3'ü gecikti)"* | One-glance card + notification |
| ~7 days before a tax due date | *"Haziran ortası: KDV 84K + stopaj 12K için ~96K ayır. Son gün 26."* | Single set-aside alert |
| Runway drops below threshold | *"Dikkat: nakit 6 haftaya iniyor. Sebep: 3 büyük tahsilat gecikti."* | Fire alert with the *why* |
| A receivable goes seriously overdue | *"X firması 220K, 45 gün gecikti. Hatırlat / ara?"* | Actionable alert |
| Distributable profit exists & is legal | *"Dağıtılabilir kâr: 540K TL. Dağıtmak için onayla."* | One-tap decision |

**Generated automatically, emailed to the accountant (owner never opens):**
- Full **CFO/Muhasebe Pack** at each period close: Bilanço, Gelir Tablosu, Nakit Akış statement, KDV özeti, mizan — branded PDF, on the close date.
- **e-Defter** files prepared and queued for GIB submission.
- **Matrah / Kurumlar** working papers.

**Design rule for reports:** *push, don't pull.* If the owner has to navigate to a tab and click "oluştur," we've already failed O3/O4. The correct number arrives in his pocket the moment it's true; the formal documents arrive in the accountant's inbox the moment the period closes.

---

### The owner-first reframe in one sentence

The blueprint is a correct accounting system **plus** a thin owner skin — and the skin should expose only **four surfaces and a notification feed**, with every statement, tax base, ledger, and close turned into either a silent background job or a once-in-a-while one-tap decision.

**Key decisions:**
- Only 4 surfaces survive front-stage for the owner: the Cockpit glance, the Cash runway, e-Fatura issuance, and the Alerts (push) feed. Everything else is engine, accountant-workspace, or a just-in-time decision.
- Every accounting statement (Bilanço, Gelir Tablosu, Nakit Akış, Mizan, e-Defter) leaves the owner's nav entirely — moved to a separate accountant workspace and auto-emailed at close.
- All tax (matrah, KDV, stopaj) becomes background math that surfaces ONLY as a single 'şu kadar TL ayır, son gün şu' push — never a tax screen.
- Governance and PCLE collapse from standing modules into just-in-time decisions: a resolution/dividend/partner-money screen appears only at the moment an action legally needs the owner, pre-computed and one-tap.
- Forecasting and the cash-flow statement merge into one number: the 13-week runway on the Cash glance. No scenario tool in the owner's weekly path.


## ANGLE C — The Daily / Weekly / Monthly Owner Experience (rhythms + the true owner-action set)

# Angle C — The Owner's Daily / Weekly / Monthly Rhythm

> **The whole accountant-coherent V2 (6 centers / 28 tabs) collapses, for the owner, into three time-boxed rhythms and one short list of decisions.** Everything the existing alert engine surfaces in accountant language ("Mizan Görüntüle", "Tranche Detayı", "Dönemi Kapat", "KDV Raporu") is **translated or hidden**. The owner never opens a tab to *go look*; the system pushes the 1–3 things that need a human and stays silent otherwise.

A design rule that governs all three rhythms:

> **The owner's home is a feed of 0–3 cards, not a dashboard of 28 tiles.** A perfect day shows **zero cards** and one green line: *"Her şey yolunda."* The product's success metric is *how often the owner can close the app in 20 seconds.*

---

## (7) DAILY — The 2-minute morning check

**Surface:** A single screen called **Bugün** (Today). It is the app's launch screen — no nav, no tabs visible above it. Push-first: most days the owner gets a **morning push notification** and never opens the app at all.

### What gets pushed (the morning ping, ~07:30)
One notification, one line, picked by the highest-severity live signal:

| Day type | Push line (owner language) | Backed by |
|---|---|---|
| Calm (most days) | "Günaydın. Kasada **₺1.24M**, bu hafta ödenecek yok. Her şey yolunda. ✅" | cash position + 13-week runway |
| Money coming/going | "Bugün **₺180K** tahsilat bekleniyor, **₺95K** ödeme çıkacak. Net **+₺85K**." | AR/AP due-dated today |
| Something needs a tap | "⚠️ **Acme** ödemesi 60 günü geçti (**₺220K**). Hatırlatma göndereyim mi?" | RECEIVABLE_60 → translated |
| On fire | "🔴 14 gün içinde kasa açığa düşebilir. 2 dakikanı ayır." | CASH_RUNWAY_30 → translated |

The owner should be able to act **from the notification** (Approve / Send reminder / Snooze) without opening the app for the calm and money cases.

### What the Bugün screen shows when opened
Three stacked zones, top to bottom, designed to be read in one glance:

1. **The one-line status band** (always): *"Bugün iyi görünüyorsun"* / *"Bu hafta dikkat"* / *"Acil bir şey var"* — a single color + sentence, derived from the SituationEngine but **spoken, not scored** (no "67/100" — the owner sees a word, not a number).
2. **Nakit bugün** — one big number (**bankadaki para**), plus today's expected in/out as two small chips: `+₺180K bekleniyor` / `−₺95K çıkacak`. No accounts, no GL, no "100 hesabı". Just *"the money you can actually touch."*
3. **Sana lazım (0–3 kart)** — the action feed. Each card = one decision, one tap. If empty: a calm green line and nothing else.

### What the owner *does* daily
**Ideally nothing.** The only daily taps that should ever appear:
- **Approve a large payment** that's queued to go out today (one tap: Onayla / Beklet).
- **Send a collection reminder** to one overdue customer (one tap: Gönder — the e-mail/SMS is pre-written).
- **Acknowledge a fire** ("Gördüm") so it stops pinging and routes to the weekly digest if not urgent.

Everything else — e-Fatura issuance, journal posting, interest accrual, overdue flagging, FX revaluation — **runs in the background** (the existing `overdue-update`, `interest-accrual`, `workflow-expire` crons already do this; the owner never sees them).

---

## (8) WEEKLY — The ~10-minute Monday ritual

**Surface:** A single pushed digest called **Haftalık Özet**, delivered **Monday ~08:00** as a notification that opens to one scrollable screen. This is the only "sit down and review" moment in a normal week. It is **generated, not assembled by the owner** — a background job composes it Sunday night.

### The weekly digest — five blocks, in this fixed order

1. **Geçen hafta nasıldı** (How last week went) — three plain numbers vs. the prior week, each with an up/down arrow and a one-word verdict:
   - *Tahsilat:* ₺420K girdi (↑ iyi)
   - *Harcama:* ₺310K çıktı (→ normal)
   - *Kasa:* ₺1.24M (↑ +₺110K)
   No P&L, no statements — those exist for the accountant in Reports; the owner gets the *delta and the direction.*

2. **Kim borçlu — kovalanacaklar** (Collections to chase) — the **top 3–5 overdue customers** ranked by amount × days-late, each a row with a **one-tap "Hatırlat" button** (pre-written reminder) and a **"Aradım/ödeyecek" snooze**. This is the single highest-value weekly action — the existing `RECEIVABLE_30/60` rules feed it, but re-skinned as *people to call*, not as "Tahsilat Sayfası".

3. **Onay bekleyenler** (Approvals queued) — the week's batched approvals that weren't urgent enough to push daily: large POs, a new hire's monthly cost, an above-threshold expense (the `workflow_instances` engine already exists with the 50K TRY threshold — this is its owner-facing inbox). Each = Onayla / Reddet + one-line reason.

4. **Önümüzdeki 2 hafta** (What's coming) — a tiny forward strip: big payments due (vergi, maaş, kira, loan tranche), and a single sentence: *"Maaş ve KDV için yeterli nakit var ✅"* or *"3 hafta sonra maaş için ₺80K eksik kalabilir ⚠️."* This translates `TAX_DUE_SOON`, `PARTNER_LOAN_DUE`, `CASH_RUNWAY_90`, `DSR_*` into one human runway sentence.

5. **Bu hafta arkada hallolanlar** (What we handled for you) — a *confidence line*, not a task list: *"47 e-Fatura kesildi, 31 fatura işlendi, 12 hatırlatma gönderildi, hepsi kayda geçti."* This is what earns trust that "boring-by-default" is actually working — the owner sees the machine worked without being asked to verify it.

### What the owner *does* weekly
- Tap "Hatırlat" on 2–4 overdue customers (30 seconds).
- Clear the approval queue: 1–5 Onayla/Reddet decisions.
- Read the runway sentence and either relax or tap into a fire.
- **That's the whole 10 minutes.** No tab navigation, no reports opened.

---

## (9) MONTHLY — The owner's month-end (NOT the close)

**Hard boundary:** *The close is the accountant's job.* The period-close engine, the 8-item checklist, mizan, tahakkuk, KDV beyanı — all of that lives in the accountant's area and the owner **never sees it**. The owner's month-end is **a result + at most one or two approvals**, and it only arrives **after the accountant has closed the month** (the close *gates* the owner's monthly card — the owner gets a clean, final story, never a draft).

**Surface:** A pushed **Aylık Karne** ("monthly report card") — arrives a few days into the new month, once close is done.

### The monthly card — three parts

1. **Bu ay nasıl gittik** (How we did) — a one-paragraph, plain-language verdict generated from the closed figures:
   > *"Mayıs'ta **₺2.1M** satış yaptın, **₺340K kâr** ettin (geçen aydan ↑%12). Kasa **₺1.24M**'ye çıktı. Tek dikkat: Acme'den ₺220K hâlâ gelmedi."*

   Below it, three big tiles only: **Satış · Kâr · Kasa**, each with a month-over-month arrow and a 6-month sparkline. No balance sheet, no income statement on this screen (a single quiet "Muhasebe raporlarını gör" link exists for the curious, routing to the accountant-facing Reports — but it is *not* the owner's path).

2. **Vergi & yükümlülükler — halloldu mu** (Obligations — handled?) — a reassurance block, not a worklist: *"KDV beyanı verildi ✅ · Muhtasar gönderildi ✅ · Kurumlar geçici vergi: 18 gün sonra, ₺95K ayrıldı ✅."* The owner confirms *nothing* here unless something is red; it exists to answer "are we legal and on time?" in one glance.

3. **Kâr alabilir misin** (Can you take profit?) — **the one genuinely owner-only monthly/quarterly decision.** When the governance + PCLE engines determine a distribution is *legally and cash-wise possible*, the card surfaces:
   > *"Bu çeyrek dağıtılabilir kâr: **₺480K**. Yasal yedekler ayrıldı, nakit yeterli. Dağıtmak ister misin?"*

   The owner taps **"Dağıt"** → the system generates the dividend resolution, the per-partner split (PCLE waterfall), the stopaj, and the journal entries. **The owner never types the number** (legal-by-construction) — they only choose *whether* and *roughly how much within the legal ceiling*. If distribution is **not** legal this period, this block simply doesn't appear (no scary explanation needed).

### What the owner *does* monthly
- Read the karne (2 minutes).
- **If offered:** approve a distribution (the highest-stakes single tap in the product).
- Occasionally: approve next month's budget shifts or a flagged large recurring cost.
- **Never:** close a period, review a trial balance, reconcile, or file a tax form.

---

## (6) What REQUIRES the owner vs. what runs automatically

This is the spine of the whole design. The default is **automate**; the owner is pulled in only at genuine **decision/approval/legal-consent** points. The set is deliberately tiny.

### The complete set of TRUE owner-action points (everything else is automated)

| # | Owner action point | Why it needs a human (the owner specifically) | Rhythm | Default if owner doesn't act |
|---|---|---|---|---|
| A1 | **Approve a large payment** (above a money threshold the owner sets, e.g. ₺50K) | Spending the company's cash is an owner judgment, not a rule | Daily push / weekly queue | Held, not sent — never auto-pays a big bill |
| A2 | **Send / approve a collection chase** on a major overdue customer | Owner often has the relationship; tone & timing are theirs | Daily (big) / Weekly (batch) | Auto-reminder still fires at a gentler tier; owner can escalate |
| A3 | **Approve a new hire's monthly cost** (or a new recurring commitment) | Adds a permanent cash obligation — a strategic call | Weekly queue | Not committed; flagged until approved |
| A4 | **Approve a dividend / profit distribution** | Legal + ownership decision; only the owner can consent to taking profit | Monthly/Quarterly | Profit stays retained — safe default |
| A5 | **Acknowledge / act on a "fire"** (cash runway breach, a bounced obligation, a balance that won't reconcile) | A human must decide the response (cut cost? call the bank? chase cash?) | Daily push, immediate | Keeps escalating until acknowledged |
| A6 | **Confirm an unusual / suspicious item** when the AI anomaly or duplicate-expense detector flags it | "Is this real?" is a judgment the machine can't make | Weekly (or daily if large) | Held in a pending state, not posted as normal |

> **Six action points. That is the owner's entire job in the system.** A1–A3 and A6 are *approvals* (gate a thing the machine prepared). A4 is a *consent* (legal). A5 is a *response* (a fire). Nothing else should ever require the owner.

### What runs fully automatically (owner sees a result line at most, never a task)

- **e-Fatura / e-Arşiv issuance and ingestion** → posts to the GL automatically; surfaces only as "47 fatura kesildi" in the weekly confidence line.
- **All journal posting / double-entry** → invisible, by definition (O1).
- **Overdue flagging, interest accrual, FX revaluation, workflow expiry** → the four existing crons; never owner-visible.
- **Tax computation** (KDV / stopaj / geçici vergi *matrah*) → computed and routed to the accountant; the owner sees only "verildi ✅" / "₺95K ayrıldı".
- **Period close & reconciliation** → 100% accountant; the owner's monthly card is *gated behind it* but never shows its mechanics.
- **Reports, statements, e-Defter** → generated on schedule for the accountant/regulator; the owner gets the *one-paragraph verdict*, not the documents.
- **Legal-reserve allocation, equalization, partner-loan accrual** → computed by PCLE/governance; the owner only sees the *distributable* number when it's a green light.

---

## How the three rhythms connect (one mental model)

```
            PUSH (notification-first)                      PULL (only when invited)
            ─────────────────────────                      ────────────────────────
 DAILY    Morning ping → 0–3 action cards on "Bugün"   → tap to approve A1/A2/A5
 WEEKLY   Monday digest → collections + approval queue → clear A2/A3/A6 + read runway
 MONTHLY  "Aylık Karne" (after accountant closes)      → read verdict + maybe A4 (distribute)
```

- **Severity routes the rhythm:** a critical signal pushes *now* (daily/immediate); a warning batches into the *weekly* digest; informational confidence rolls up *monthly*. The existing alert engine's severity field is the dispatcher — we only change *where and how loudly* each rule speaks, and *into whose language.*
- **Silence is the feature.** If A1–A6 are all clear, the owner gets: one green daily line, a short Monday digest, a once-a-month karne. ~12 minutes a week, fully in owner language, zero ledgers.

**Key decisions:**
- Notification-first, not dashboard-first: the owner's home is a 0-3 card feed; a perfect day shows zero cards and one green line, and most days the owner acts from the push without opening the app.
- Severity becomes the rhythm dispatcher: critical → daily/immediate push, warning → batched into the Monday weekly digest, informational → rolled into the monthly card. The existing 12-rule alert engine is reused unchanged except its accountant-language actionLabels (Mizan Görüntüle, Tranche Detayı, Dönemi Kapat) are translated to owner language or hidden.
- The owner's entire job is exactly SIX action points: A1 approve large payment, A2 chase/approve collections, A3 approve a new recurring cost (hire), A4 consent to a dividend/distribution, A5 respond to a fire, A6 confirm a flagged anomaly. Everything else is automated with safe defaults (hold, don't send; retain, don't distribute).
- Monthly is explicitly NOT the close: the period-close engine, mizan, KDV beyanı stay 100% in the accountant area. The owner's 'Aylık Karne' is GATED behind the accountant finishing close, so the owner only ever sees a final, clean, plain-language verdict plus at most a distribution approval.
- Dividend stays legal-by-construction: the owner never types the number; the monthly/quarterly card only offers 'Dağıt' when governance+PCLE prove it's legal and cash-feasible, and the block simply doesn't appear otherwise.
- A recurring 'what we handled for you' confidence line (e-Fatura count, invoices processed, reminders sent) is the trust mechanism that makes boring-by-default credible without asking the owner to verify anything.


## ANGLE D — Navigation redesign around owner decisions (jobs, not accounting concepts)

## ANGLE D — Navigation Redesigned Around the Owner's Decisions

The V2 IA (~6 centers / ~28 tabs: Finance, Tax, Governance, Partners, Compliance, Close) is **organized around the data model**. That is correct for the accountant and fatal for the owner. An owner with 10 minutes a day does not think "let me open the Tax center to check my matrah." He thinks *"param var mı, kâr ediyor muyum, kim bana borçlu, maaşları çıkarabilir miyim, bir şey mi yandı, ne kadar para çekebilirim."* Those are six **jobs**, not six modules. This redesign throws out the data-model IA for the owner and rebuilds navigation as a list of his jobs, with all accountant machinery sealed behind one door.

---

### The owner's navigation — 6 destinations, named by job

```
┌─────────────────────────────────────────────────────────────────┐
│  FLOWRA          [● Her şey yolunda]              🔔 Onaylar (2)  │   ← always-on status pill + push inbox
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   🏠 BUGÜN        💰 PARAM       📈 KÂRIM                          │
│   ortaklar &      onaylar        ⚙ muhasebe (sessiz kapı)         │
│   dağıtım                                                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

| # | Owner destination | The job it answers | What's literally behind it |
|---|---|---|---|
| 1 | **🏠 Bugün** *(default landing)* | "Her şey yolunda mı?" — one glance | Status pill (yeşil/sarı/kırmızı) + 4 fact cards: **Nakit** (bugün + 13-hafta runway sparkline), **Vadesi geçen alacak** (kim, ne kadar), **Bu ay kâr** (plain TL), **Yaklaşan ödemeler** (maaş/vergi/tedarikçi). Each card is a 1-tap door into the job that fixes it. Plus a "Dikkat" strip that only appears when something is on fire. |
| 2 | **💰 Param** | "Param var mı? Maaşı/tedarikçiyi ödeyebilir miyim? Kim bana borçlu?" | Cash today across bank+kasa, the 13-week runway as a calendar ("3 Temmuz'da maaş günü — o gün kasada ₺X olacak, yeterli ✓"), receivables aging as a **chase list** (not an aging table) with one-tap "hatırlat" per debtor, and upcoming payables. The collections + treasury job. |
| 3 | **📈 Kârım** | "Para kazanıyor muyum? Nereden, neyle?" | This-month and YTD profit in **plain TL with one sentence** ("Bu ay ₺142.000 kâr ettin, geçen aydan %8 fazla"), the 3 biggest revenue sources, the 3 biggest cost buckets, gross margin as "her ₺100 satıştan ₺34 cebinde kalıyor". No P&L statement layout, no account codes. A "neden değişti?" explainer, not a Gelir Tablosu. |
| 4 | **🤝 Ortaklar & Dağıtım** | "Ne kadar kâr dağıtabilirim — ve yasal olarak çekebilir miyim?" | The dividend decision, owner-framed: a single big number — **"Bugün yasal olarak ₺X dağıtabilirsin"** (computed from the ledger, TTK 519 already reserved, stopaj already netted) — and a "Dağıtımı başlat" button that opens the resolution + approval flow. Plus each partner's position in plain terms ("Ahmet şirkete ₺900K koydu, ₺120K kredi verdi"). The owner **cannot type the number**; he can only accept or decline the computed ceiling. |
| 5 | **🔔 Onaylar** | "Benden ne isteniyor?" | The push-driven approval inbox: dividend resolutions awaiting sign-off, large payments over threshold, a supplier bill flagged as duplicate, "dönem kapanışına onayın gerekiyor". The owner lives here *reactively* — the system fills it, he clears it. This is the only place the system is allowed to interrupt him. |
| 6 | **⚙ Muhasebe** *(the quiet door)* | "(Rarely) show me / my accountant the real books" | Everything below. Visually de-emphasized, last in the nav, never the default, never linked from a Bugün card. |

---

### Behind the single quiet **Muhasebe** door — all accountant machinery, present but off the daily path

The owner is *allowed* in but is **never routed here by default and never pushed here**. This is the mali müşavir's room. One tap opens a sub-shell that contains the entire V2 accountant IA, collapsed:

```
⚙ MUHASEBE  (mali müşavir alanı)
├── Tablolar        → Bilanço · Gelir Tablosu · Nakit Akış   (the V2 "statements" surface)
├── Vergi           → Kurumlar matrah · KDV beyanname · GVK stopaj   (the V2 "tax" module)
├── e-Belge         → e-Fatura/e-Arşiv arşivi · e-Defter / berat   (the V2 "compliance" module)
├── Dönem Kapanış   → close checklist · period lock · retained-earnings waterfall   (the V2 "close" engine)
├── Defter          → mizan · yevmiye / journal lines · hesap planı   (the V2 ledger kernel surface)
└── Denetim İzi     → HMAC audit chain · resolution archive · Figure provenance drill   (the V2 "governance/audit")
```

Note this is **the same ~28 accountant-tabs the V2 IA already designed** — they are not deleted, not duplicated, just **relocated out of the owner's six jobs and behind one door**. Same kernels, same Figures, same provenance. Only the routing and framing change: the owner's home is six decisions; the accountant's home is these six folders.

---

### Every real capability in ≤2 taps from Bugün

The discipline: **tap 1** reaches a destination or a Bugün card; **tap 2** performs the decision. No owner capability needs a third tap.

| Owner intent | Tap 1 | Tap 2 | Taps |
|---|---|---|---|
| Am I okay? | *(Bugün is the landing)* | — | **0** |
| Do I have cash / can I make payroll? | Bugün → **Nakit** card | runway calendar shows payroll day | **1–2** |
| Who owes me / chase a debtor | **Param** | "Hatırlat" on the debtor | **2** |
| Am I making money / why did profit move? | **Kârım** | "Neden değişti?" | **2** |
| How much can I legally distribute? | **Ortaklar & Dağıtım** | read the big number | **1** |
| Declare a dividend | **Ortaklar & Dağıtım** | "Dağıtımı başlat" | **2** |
| Approve / decline what's pending | 🔔 **Onaylar** | approve | **2** |
| Issue an invoice | Bugün/Param **+ Yeni** quick-action | confirm sale → e-Fatura auto-posts | **2** |
| (Rare) see the real statements | **Muhasebe** | Tablolar | **2** |
| (Rare) check tax owed | **Muhasebe** | Vergi | **2** |

Contrast the accountant-coherent IA where "how much can I distribute?" is *Partners center → Dağıtım&Risk group → Kâr Dağıtımı tab → compute → read* (3–4 taps through accounting nesting), and "am I okay?" has no single home at all — it's smeared across Komuta + Finans + Param.

---

### Contrast with V1 and V2 — and the boring-by-default mechanics

| | V1 (shipped) | V2 (accountant-coherent) | **V2 owner-first (this angle)** |
|---|---|---|---|
| Top-level destinations | 8 centers (Komuta, Finans, Operasyon, Ortaklar, Planlama, Governance, Insights, Documents) | ~6 centers (Finance, Tax, Governance, Partners, Compliance, Close) | **6 owner jobs** (Bugün, Param, Kârım, Ortaklar & Dağıtım, Onaylar, Muhasebe) |
| Tabs the owner faces | **48–60 tabs** | **~28 tabs** | **~5 cards on Bugün + 5 destinations**; the 28 accountant-tabs survive behind 1 door |
| Organizing principle | feature sprawl | the data model | **the owner's decisions** |
| Default landing | a vanity dashboard | adaptive cockpit | **"am I okay?" in one glance** |
| Reach any capability | up to 4 taps, hunt across hubs | 3–4 taps via accounting nesting | **≤2 taps, always** |
| How the owner is summoned | he must go hunting | mostly pull | **push into Onaylar / Bugün alert only** |

**The push, not pull mechanics that make it boring-by-default:**
- e-Fatura issuance, journal posting, KDV/Kurumlar drafting, and the close checklist run as **background jobs** — the owner is never asked to operate them.
- The system only earns an interruption when there's a real **decision/approval**: it drops a card in 🔔 **Onaylar** or flips the **status pill** on Bugün to sarı/kırmızı with a one-line reason ("Vergi ödemesine 5 gün, kasada yeterli para yok").
- When nothing needs him, the pill is green and **Onaylar is empty** — and that emptiness is the product working, not the product being idle.

---

### What the owner **literally never sees** (present in the system, invisible unless he opens Muhasebe)

- **Mizan / trial balance** — never on any owner screen.
- **Yevmiye / journal lines, the posting doors, idempotency keys** — invisible.
- **Hesap planı / Tek Düzen account codes** (120, 391, 590, 600…) — the owner never reads a 3-digit code.
- **Kurumlar matrah worksheet** (ticari kâr + KKEG − istisna − geçmiş zarar) — owner sees only "tahmini vergi: ₺X" if at all, never the matrah math.
- **KDV beyanname form, tevkifat splits, devreden** — filed in the background; owner sees only the payable on a payables card.
- **e-Defter GUI-XML, berat references** — pure accountant/GİB artifacts.
- **Retained-earnings / TTK 519 waterfall (590→692→590→570, %5 yedek)** — collapses into the single "dağıtabilirsin" number.
- **Period-close checklist, soft_closed/locked/audit_locked states** — "close is the accountant's job"; the owner only sees an Onaylar item *if* his sign-off is required.
- **The HMAC audit hash-chain and Figure<T> provenance drill-downs** — the plumbing that guarantees correctness, shown to no owner ever.
- **The words** *mizan, matrah, tahakkuk, 590 hesabı, beyanname, yevmiye, nazım* — quarantined entirely behind the Muhasebe door.

The owner sees **decisions and status**. The accuracy machinery exists, is CI-verified to the kuruş, and sits one deliberate tap away — for the one person (the mali müşavir) who actually wants it.

**Key decisions:**
- Throw out the 6-center/28-tab accountant IA for the owner. Replace with 6 owner-facing destinations organized by JOB/DECISION: Bugün, Param, Kârım, Ortaklar & Dağıtım, Onaylar, and one quiet Muhasebe door. Bugün is the default landing and answers 'am I okay?' in one glance.
- ALL accountant machinery — statements (Bilanço/Gelir/Nakit Akış), tax (matrah/KDV/stopaj), period-close, e-Defter, trial balance, journals, audit chain — lives behind the single Muhasebe door. The owner can reach it but is never routed there by default; it is a destination for the mali müşavir, not the owner's daily path.
- Every real capability is reachable in <=2 taps from Bugün. Tap 1 = a card on Bugün or a primary nav item; tap 2 = the decision/action. The owner never navigates a tab tree to find money facts.
- Push, don't pull: the system runs close/issuance/filing reminders as background jobs and only summons the owner into Onaylar (approval inbox) or a Bugün alert when a genuine DECISION or APPROVAL is needed. Boring-by-default.
- The dividend decision gets its own top-level home (Ortaklar & Dağıtım) because it is the wedge and the one thing the owner actively wants — but the number is computed and shown as 'şu kadar dağıtabilirsin', never typed.
- Owner language everywhere in the 5 owner destinations (nakit, alacak, kâr, maaş ödeyebilir miyim, ne kadar dağıtabilirim). Accounting language (mizan, matrah, 590, tahakkuk, beyanname) is quarantined behind the Muhasebe door only.
- Named the explicit 'never-sees' list: trial balance, journal lines, chart of accounts, matrah worksheet, KDV beyanname form, e-Defter XML/berat, retained-earnings waterfall, close checklist, audit hash-chain, Figure provenance drill — all present in the system, all invisible to the owner unless they deliberately open Muhasebe.