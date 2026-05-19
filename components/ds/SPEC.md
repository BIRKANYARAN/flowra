# Flowra Design System — Visual Specification v2.0
> **Status: AUTHORITATIVE**
> This document supersedes `GOVERNANCE.md` where they conflict.
> `GOVERNANCE.md` remains valid for backwards-compatible rules not covered here.
> All new work follows this spec. All refactor work migrates toward it.
>
> **Visual target:** Bloomberg terminal density · Linear interface clarity · Stripe financial seriousness
> **Anti-target:** startup dashboard · widget farm · Tailwind component showcase

---

## 0. Philosophy

Flowra is serious financial software. Every design decision must answer: "Does this help an executive make a faster, more confident financial decision?" If the answer is no, the element should not exist.

Information density is a feature, not a problem. The professional user of Flowra is not overwhelmed by a full mizan table. They are slowed down by decorative cards, oversized padding, and scattered visual weight.

**Three constraints that govern everything:**
1. A number must never be ambiguous. Format, unit, and sign are always explicit.
2. Status must never require color alone to be understood. Shape + label + color together.
3. A page must have a single dominant reading direction. Top-down or left-right, never both.

---

## 1. Layout System

### 1.1 Application Shell

```
┌───────────────────────────────────────────────────────────────────┐
│  NAV RAIL (168px)  │  CONTEXT STRIP (40px) — period · FX rates   │
│                    ├────────────────────────────────────────────── │
│  bg: #0f172a       │  PAGE HEADER (56–72px) — title · actions     │
│  ink-1             ├────────────────────────────────────────────── │
│                    │  MAIN CONTENT (scrollable, p-6)               │
│                    │  max-w-6xl mx-auto                            │
└───────────────────────────────────────────────────────────────────┘
```

- **Nav rail**: `w-[168px]` fixed, `bg-[#0f172a]` (ink-1), `flex flex-col h-full`
- **Context strip**: `h-10 bg-white border-b border-[#e2e8f0]` — period status LEFT, FX rates RIGHT
- **Page header**: `px-6 pt-5 pb-4 bg-surface-2 border-b border-[#e2e8f0]` — title + contextual CTAs
- **Main content**: `flex-1 overflow-y-auto p-6`, inner wrapper `max-w-6xl mx-auto space-y-4`

### 1.2 Content Grid Rules

```
Two-column split:         grid grid-cols-[1fr_320px] gap-4
Equal columns:            grid grid-cols-2 gap-4
Three columns:            grid grid-cols-3 gap-4
Five-column KPI strip:    grid grid-cols-5 gap-0 (borderless, divide-x)
Full-width:               no wrapper class needed
```

**Rule**: Never nest grids more than one level deep inside a page section.
**Rule**: `gap-4` (16px) is the standard section gap. `gap-3` for intra-section. `gap-6` forbidden.

---

## 2. Typography

### 2.1 Type Scale

```
Page title:       text-base font-bold text-[#0f172a]                (16px / 700)
Section label:    text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]
Body:             text-xs text-[#334155]                             (12px / 400)
Body emphasized:  text-xs font-medium text-[#0f172a]
Caption:          text-[0.65rem] text-[#94a3b8]                     (10.4px)
Table header:     text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]
Table cell:       text-xs text-[#334155]
Number (display): font-mono tabular-nums                              (always on financials)
Number (KPI lg):  text-xl font-black font-mono tabular-nums
Number (KPI md):  text-base font-black font-mono tabular-nums
Number (inline):  text-xs font-mono tabular-nums
```

### 2.2 Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'system-ui', 'Segoe UI', sans-serif;
font-family (mono): ui-monospace, SFMono-Regular, 'SF Mono', 'Fira Code', monospace;
```

**No custom web fonts.** System fonts render faster, match the OS, and look more native on professional hardware.

### 2.3 Typography Rules

- Section labels are **always** `text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]`. Never `font-bold`, never `text-xs`.
- Financial numbers are **always** monospace. Including percentages, ratios, and days counts.
- Page titles are **never** larger than `text-base`. This is not a marketing page.
- `font-black` (900) is reserved for: section labels, KPI values, table totals. Not for body text.

---

## 3. Color System

### 3.1 Semantic Color Palette

```
ink-1:   #0f172a   — primary text, headings, nav background
ink-2:   #334155   — body text, table cells
ink-3:   #64748b   — secondary text, subtitles
ink-4:   #94a3b8   — labels, captions, disabled
ink-5:   #cbd5e1   — dividers, placeholder text

surface-1:      #ffffff   — card backgrounds
surface-2:      #f8fafc   — page background, table rows (alternate)
surface-3:      #f1f5f9   — table headers, input backgrounds
surface-border: #e2e8f0   — all borders
surface-divider:#f1f5f9   — table row dividers (lighter than border)

brand:          #5b21b6   — active nav, primary CTA background
brand-light:    #7c3aed   — hover state for brand
brand-subtle:   #ede9fe   — avatar background, light tint

pos:            #059669   — positive values, healthy status
pos-text:       #065f46   — positive text on light background
pos-light:      #d1fae5   — positive background tint

neg:            #dc2626   — negative values, critical status
neg-text:       #991b1b   — negative text on light background
neg-light:      #fee2e2   — negative background tint

warn:           #d97706   — warning values, caution status
warn-text:      #92400e   — warning text on light background
warn-light:     #fef3c7   — warning background tint

info:           #2563eb   — informational status
info-text:      #1e40af
info-light:     #dbeafe
```

### 3.2 Color Application Rules

- **Positive financial values**: `text-pos` (`#059669`) — never `text-green-600`
- **Negative financial values**: `text-neg` (`#dc2626`) — never `text-red-600`
- **Warning states**: `text-warn` (`#d97706`) — never `text-amber-600` or `text-orange-500`
- **Brand accent**: `bg-brand text-white` — never `bg-violet-600`, never `bg-indigo-600`
- **No raw hex in JSX** unless it matches exactly the token above. No exceptions.
- **No arbitrary colors**: `text-[#somecolor]` — always use the semantic token.
- **Status is never conveyed by color alone**. Color + shape (dot) + label together.

### 3.3 Forbidden Colors

```
❌ text-green-*    → text-pos
❌ text-red-*      → text-neg
❌ text-amber-*    → text-warn
❌ text-violet-*   → text-brand or text-brand-light
❌ text-indigo-*   → text-brand
❌ text-zinc-*     → text-ink-*
❌ text-slate-*    → text-ink-*
❌ bg-green-*      → bg-pos/10 or bg-pos-light
❌ bg-red-*        → bg-neg/10 or bg-neg-light
❌ Any tailwind color not in the palette above
```

---

## 4. Border & Radius System

### 4.1 Border Rules

```
Standard border:    border border-[#e2e8f0]      (all panels, tables, inputs)
Divider (table row):border-b border-[#f1f5f9]    (lighter, denser)
Focus ring:         ring-1 ring-brand/30           (inputs, focused elements)
Separator:          h-px bg-[#e2e8f0]             (horizontal rules)
```

**Rule**: All borders use `#e2e8f0` (surface-border). Never `gray-200`, never `gray-300`.

### 4.2 Border Radius Rules

```
Panels/cards:   rounded            (4px — not rounded-xl, not rounded-2xl)
Buttons:        rounded            (4px)
Inputs:         rounded            (4px)
Badges/pills:   rounded            (4px — not rounded-full)
Avatars/dots:   rounded-full       (circles only)
Nav items:      rounded            (4px — not rounded-lg)
```

**Single rule**: `rounded` (4px) everywhere except circles. No `rounded-xl`, no `rounded-lg`, no `rounded-2xl` in new code.

This is the single biggest visual shift from the previous system. It creates the flat, serious, professional feel of Bloomberg/Stripe vs the rounded startup feel.

---

## 5. Table System (Primary Data Pattern)

Tables are the primary way Flowra displays financial data. Not cards. Not grids of metrics. Tables.

### 5.1 Table Anatomy

```tsx
<div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
  {/* Optional header */}
  <div className="px-4 py-2.5 border-b border-[#e2e8f0] flex items-center justify-between">
    <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
      Section Title
    </span>
    <ActionLink />
  </div>
  {/* Table */}
  <table className="w-full text-xs">
    <thead>
      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
        <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Column
        </th>
        <th className="px-4 py-2 text-right text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Amount
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-[#f1f5f9]">
      <tr className="hover:bg-[#f8fafc] transition-colors">
        <td className="px-4 py-2 text-[#334155]">Item name</td>
        <td className="px-4 py-2 text-right font-mono tabular-nums text-[#0f172a]">
          {fmtTRY(value)}
        </td>
      </tr>
    </tbody>
    {/* Optional footer for totals */}
    <tfoot>
      <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc] font-semibold">
        <td className="px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Toplam
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0f172a]">
          {fmtTRY(total)}
        </td>
      </tr>
    </tfoot>
  </table>
</div>
```

### 5.2 Table Density Rules

```
Row padding:           py-2     (standard) — never py-3 or py-4
Row padding (compact): py-1.5   (dense tables: transaction logs, journal entries)
Header padding:        py-2.5   (slightly more prominent than rows)
Cell horizontal:       px-4     (always — never px-3 or px-5)
Total row:             border-t-2 (double border to visually separate)
```

### 5.3 Number Column Rules

- Always `text-right`
- Always `font-mono tabular-nums`
- Positive: `text-[#0f172a]` (default ink) or `text-pos` if explicitly positive signal
- Negative: `text-neg` — always, never parentheses `(1.000,00)` in tables
- Zero / null: `text-[#94a3b8]` with `—` dash, never `0,00`
- KDV/percentage: `font-mono` still applies

### 5.4 Sort / Interaction Rules

- Clickable rows: `cursor-pointer hover:bg-[#f8fafc]`
- Selected row: `bg-brand-subtle border-l-2 border-brand` (left accent, not full background)
- No zebra stripes. Hover only.

---

## 6. KPI Strip System

### 6.1 Pattern

KPI values belong in a horizontal instrument strip — a single bordered container divided vertically. Never a grid of separate card boxes.

```tsx
<div className="grid grid-cols-5 gap-0 border border-[#e2e8f0] rounded overflow-hidden">
  {kpis.map((k, i) => (
    <div key={i} className={`px-4 py-3 bg-white ${i < 4 ? 'border-r border-[#e2e8f0]' : ''}`}>
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        {k.label}
      </div>
      <div className={`text-xl font-black font-mono tabular-nums leading-none mb-1 ${k.color}`}>
        {k.value}
      </div>
      <div className="text-[0.65rem] text-[#94a3b8]">{k.sub}</div>
    </div>
  ))}
</div>
```

### 6.2 KPI Rules

- **Label**: always `0.65rem font-black uppercase tracking-widest ink-4`
- **Value**: always `text-xl font-black mono` minimum — `text-2xl` for hero single KPI
- **Sub**: always `0.65rem ink-4` — supporting context, not another KPI
- **Color**: `text-ink-1` default, `text-pos` for explicitly healthy, `text-warn` for caution, `text-neg` for critical
- **Count**: 4–6 KPIs maximum in a strip. Never 7+. Split into two strips if needed.
- **Units**: always in the value string (₺, g, ay, %) — never in the label

---

## 7. Panel / Card System

### 7.1 Standard Panel

```tsx
<div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
  {/* Header (optional) */}
  <div className="px-4 py-2.5 border-b border-[#e2e8f0]">
    <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
      Panel Title
    </span>
  </div>
  {/* Body */}
  <div className="p-4">
    {/* content */}
  </div>
</div>
```

### 7.2 Panel Tone System

For panels that carry a status signal (situation bar, alert panel, period status):

```tsx
// Healthy
"border-[#059669]/30 bg-[#059669]/5"

// Caution
"border-[#d97706]/30 bg-[#d97706]/5"

// Critical
"border-[#dc2626]/30 bg-[#dc2626]/10"

// Info
"border-[#2563eb]/20 bg-[#2563eb]/5"
```

**Rule**: Tinted borders + very light tinted backgrounds. Never solid colored backgrounds on panels.
**Rule**: Tones only appear when the panel itself carries a status signal. Not for visual variety.

---

## 8. Badge & Status System

### 8.1 Status Dot (inline, minimal)

For status signals within dense content (table cells, inline text):

```tsx
// Dot: 6px circle, no text
<span className={`inline-block w-1.5 h-1.5 rounded-full bg-pos shrink-0`} />
```

Use the dot when: a badge would be too heavy, the context is clear, the signal is binary.

### 8.2 Badge (explicit label)

For status that needs a visible label:

```tsx
<span className="inline-flex items-center px-1.5 py-0.5 text-[0.65rem] font-semibold rounded border bg-warn/10 text-warn-text border-warn/20">
  Gecikmiş
</span>
```

Badge color map:
```
pos:  bg-pos/10  text-pos-text  border-pos/20
neg:  bg-neg/10  text-neg-text  border-neg/20
warn: bg-warn/10 text-warn-text border-warn/20
info: bg-info/10 text-info-text border-info/20
gray: bg-[#f1f5f9] text-[#334155] border-[#e2e8f0]
```

### 8.3 Status Rules

- **No emoji** in status indicators. No ✅, ⚠️, 🔴 in data displays. Ever.
- Dots for inline status. Badges for labeled status. Never mix in the same column.
- Status colors follow the semantic palette. Never `bg-green-100 text-green-800`.
- A badge has maximum 2 words. If more are needed, it's not a badge — it's a message.

---

## 9. Button System

### 9.1 Button Variants

```tsx
// Primary — one per view maximum
className="px-3 py-1.5 text-xs font-semibold bg-brand text-white rounded hover:bg-brand-light transition-colors"

// Secondary — default for most actions
className="px-3 py-1.5 text-xs font-semibold border border-[#e2e8f0] rounded bg-white text-[#334155] hover:border-[#64748b] transition-colors"

// Ghost / text action (in tables, inline)
className="text-[0.65rem] font-semibold text-brand hover:text-brand-light"

// Destructive
className="px-3 py-1.5 text-xs font-semibold border border-neg/20 rounded bg-neg-light text-neg-text hover:bg-neg/20 transition-colors"

// Disabled (any variant)
className="... opacity-50 cursor-not-allowed pointer-events-none"
```

### 9.2 Button Rules

- **One primary button per view**. The most consequential action. Everything else is secondary.
- CTA position: always top-right of the page header or the section header. Never floating.
- Destructive actions require a confirmation state — never fire immediately from a single click.
- Loading state: replace label with `"..."` or a spinner — never disable + show spinner separately.
- No icon-only buttons without a tooltip. No icon+label unless the icon adds information.

---

## 10. Navigation Rail

### 10.1 Structure

```tsx
<nav className="w-[168px] bg-[#0f172a] flex flex-col h-full shrink-0">
  {/* Brand — top */}
  <div className="px-4 pt-5 pb-4 flex items-center gap-2.5 border-b border-white/[0.06]">
    <LogoMark />  {/* 28×28, rounded, brand bg */}
    <div>
      <div className="text-xs font-bold text-white">Flowra</div>
      <div className="text-[0.65rem] text-white/40">ERP</div>
    </div>
  </div>
  
  {/* Nav items */}
  <div className="flex-1 py-3 px-2 space-y-0.5">
    {/* Active item */}
    <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-semibold bg-brand text-white text-left">
      <Icon className="w-4 h-4" />
      <span>Komuta</span>
    </button>
    {/* Inactive item */}
    <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.05] text-left transition-colors">
      <Icon className="w-4 h-4" />
      <span>Finans</span>
    </button>
  </div>
  
  {/* User — bottom */}
  <div className="p-3 border-t border-white/[0.06]">
    <UserAvatar />
  </div>
</nav>
```

### 10.2 Nav Rules

- Background: `#0f172a` (ink-1). Never a lighter color.
- Active item: `bg-brand` (violet). One active item only.
- Hover: `hover:bg-white/[0.05]` — subtle, not obvious.
- Icons: 16×16, `stroke-width={1.75}`. No filled icons. No oversized icons.
- Item height: `py-2` — creates comfortable but dense spacing.
- Groups: separated by a labeled group header in `text-white/20`.
- Never more than 8 items in the primary group.

---

## 11. Tab Navigation

### 11.1 Pattern (within a hub page)

```tsx
<div className="flex items-center gap-0 border-b border-[#e2e8f0]">
  {tabs.map((t, i) => (
    <button key={i} onClick={() => setTab(i)}
      className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
        tab === i
          ? 'border-brand text-brand'
          : 'border-transparent text-[#64748b] hover:text-[#334155]'
      }`}>
      {t}
    </button>
  ))}
</div>
```

### 11.2 Tab Rules

- Always `border-b-2` underline style. Never pill/background tabs.
- Active: `border-brand text-brand`. Inactive: `border-transparent text-ink-3`.
- Tab labels: sentence case, concise (≤2 words). Never uppercase tab labels.
- Maximum 8 tabs per strip. If more, group into a dropdown.
- Tab content starts with 4px gap after the strip — achieved by `-mb-0` on the strip container.

---

## 12. Empty State Rules

```tsx
// Minimal empty state — within a table or panel
<tr>
  <td colSpan={n} className="px-4 py-8 text-center">
    <div className="text-xs font-medium text-[#64748b]">Kayıt bulunamadı</div>
    <div className="text-[0.65rem] text-[#94a3b8] mt-1">Bu dönem için veri mevcut değil</div>
  </td>
</tr>

// Action empty state — full page section with CTA
<div className="flex flex-col items-center justify-center h-40 bg-white border border-[#e2e8f0] rounded">
  <div className="text-xs font-medium text-[#334155] mb-1">Proforma oluşturulmamış</div>
  <div className="text-[0.65rem] text-[#94a3b8] mb-3">İlk proformayı oluşturun</div>
  <button className="...">+ Yeni Proforma</button>
</div>
```

### 12.1 Empty State Rules

- **No illustration graphics** in empty states. Text only.
- **No emoji** (no 📭, no 🎉, no ✅).
- Two lines maximum: what's missing + why or what to do.
- Action button only when the user can directly fix the empty state from this view.

---

## 13. Loading State Rules

```tsx
// Skeleton line — for single-line values
<div className="h-4 w-24 bg-[#f1f5f9] rounded animate-pulse" />

// Skeleton row — for table rows
<tr>
  {columns.map((_, i) => (
    <td key={i} className="px-4 py-2">
      <div className="h-3 bg-[#f1f5f9] rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
    </td>
  ))}
</tr>

// Panel loading — full panel content
<div className="p-4 space-y-2">
  <div className="h-3 w-1/3 bg-[#f1f5f9] rounded animate-pulse" />
  <div className="h-3 w-2/3 bg-[#f1f5f9] rounded animate-pulse" />
  <div className="h-3 w-1/2 bg-[#f1f5f9] rounded animate-pulse" />
</div>
```

### 13.1 Loading Rules

- `animate-pulse` on `bg-[#f1f5f9]` skeletons — never spinners inside content areas.
- Skeletons mirror the shape of the content they replace.
- Never show a zero-value (₺0,00) during loading. Show skeleton until data arrives.
- Loading state must be indistinguishable from the eventual content layout.
- `Suspense` at route segment level — not individual component level.

---

## 14. Motion Rules

```
transition-colors:  120ms ease — color/border/background hover states
transition-all:     150ms ease — complex hover with shadow + border
animate-pulse:      loading skeletons ONLY (2.5s cycle)
```

**Never use:**
- `animate-bounce`
- `animate-spin` (except inside loading buttons)
- `animate-ping`
- Custom `@keyframes` in component files
- Transition durations above 200ms for UI interactions
- Transform-based animations on data displays

---

## 15. Forbidden Patterns

These are banned from all new code and must be removed during refactors:

```
❌ rounded-xl, rounded-2xl, rounded-lg                → rounded only
❌ gap-6, gap-8 between page sections                 → gap-4 max
❌ text-xl font-black for page titles                 → text-base font-bold
❌ border-gray-200, border-gray-300                   → border-[#e2e8f0]
❌ text-green-*, bg-green-*                           → text-pos, bg-pos/*
❌ text-red-*, bg-red-*                               → text-neg, bg-neg/*
❌ text-violet-*, text-indigo-*                       → text-brand
❌ text-zinc-*, text-slate-*                          → text-ink-*
❌ Any emoji in data displays, table cells, status    → dots + badges
❌ Cards as primary data display for list data        → tables
❌ Grid of separate card boxes for KPIs              → KPI strip
❌ shadow-md, shadow-lg on panels                     → no shadow or shadow-sm
❌ Padding px-5, py-5 or larger in tables/panels     → px-4, py-2/py-3
❌ inline .toLocaleString(), .toFixed() for display  → fmtTRY() / fmtMoney()
❌ hardcoded hex in className strings                 → use tokens
❌ Loading spinner inside table cell                  → skeleton row
❌ ₺0,00 displayed while data is loading             → skeleton
❌ useEffect fetch in dashboard components           → RSC / TanStack Query
❌ Import from @/components/ui-kit/Flowra* directly  → @/components/ds barrel
```

---

## 16. Component Import Rules

```tsx
// ✅ ALWAYS import from canonical barrel
import { FlowraButton, FlowraTable, FlowraKpiCard, Badge, StatusDot } from '@/components/ds'

// ✅ Format utilities
import { fmtTRY, fmtMoney, fmtDate, fmtPct, fmtCompact } from '@/lib/format'

// ❌ NEVER direct import from sub-package when barrel exports it
import { FlowraCard } from '@/components/ui-kit/FlowraCard'   // ← wrong

// ❌ NEVER inline number formatting
<td>{value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>  // ← wrong
<td>{fmtTRY(value)}</td>  // ← correct
```

---

*Version: 2.0 — 2026-05-19*
*Supersedes: components/ds/GOVERNANCE.md (where conflicts exist)*
*Next review: when a new hub module is added or when a new data display pattern is introduced*
