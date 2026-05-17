# Flowra Design System — Governance Rules

> **Status: ENFORCED**  
> Every new screen and every modification to existing screens MUST follow these rules.  
> If you are reviewing a PR, reject any deviation.

---

## 1. Card / Panel Rules

There is **ONE** canonical panel style. No exceptions.

```tsx
// ✅ CORRECT — always use Panel component
import { Panel } from '@/components/ds'
<Panel>...</Panel>

// ✅ CORRECT — when needed inline
className="bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)]"

// ❌ FORBIDDEN
"bg-white border border-gray-200 rounded-2xl"        // old DS style
"bg-white border border-gray-100 rounded-xl"         // missing shadow
"border-gray-300"                                     // wrong gray
"rounded-2xl"                                         // wrong radius for panels
```

**Tone variants** (only when semantically appropriate):
- `tone="critical"` → red-50/200 for genuine errors
- `tone="warn"` → amber-50/200 for warnings  
- `tone="ok"` → emerald-50/200 for positive states

---

## 2. Section Label Rules

One canonical pattern for the uppercase category label above content blocks:

```tsx
// ✅ CORRECT
import { SectionLabel } from '@/components/ds'
<SectionLabel>Nakit Akışı</SectionLabel>

// ✅ CORRECT inline
className="text-[10px] font-black uppercase tracking-widest text-gray-400"

// ❌ FORBIDDEN
"text-xs font-semibold uppercase tracking-wide text-gray-400"   // wrong weight
"text-[10px] font-bold uppercase tracking-widest text-gray-400" // font-bold not font-black
"text-xs font-black uppercase tracking-widest"                   // wrong size
```

**Sub-labels** (inside panels, above mini-sections): `text-[9px]` not `text-[10px]`

---

## 3. Page Hero Rules

Every page has exactly ONE hero block at the top:

```tsx
import { PageHero } from '@/components/ds'
<PageHero
  super="Finans Merkezi"   // optional: section breadcrumb
  title="Kâr / Zarar"      // required: text-2xl font-black
  sub="Ciro · Brüt Kâr · Faaliyet Kârı"  // optional: text-sm text-gray-400
  cta={<Link>...</Link>}   // optional: top-right action button
/>
```

**Title sizes** — strictly enforced:
- Main title: `text-2xl font-black tracking-tight text-gray-900`
- Sub-title/breadcrumb: `text-[10px] font-black uppercase tracking-widest text-gray-400`
- Never: `text-xl`, `text-3xl` for page titles

---

## 4. KPI Strip Rules

When showing multiple KPIs in a row, ALWAYS use the instrument strip pattern — never a grid of separate cards.

```tsx
import { KpiStrip, KpiCell } from '@/components/ds'

// ✅ CORRECT — single container, divide-x
<KpiStrip cols={4}>
  <KpiCell label="Ciro" value="₺2.4M" sub="Brüt marj %42" href="/dashboard/commercial" />
  <KpiCell label="Runway" value="14ay" tone="ok" />
  <KpiCell label="Alacak" value="₺340K" tone="warn" sub="₺82K gecikmiş" />
  <KpiCell label="KDV Net" value="₺28K" tone="critical" />
</KpiStrip>

// ❌ FORBIDDEN — separate card boxes
<div className="grid grid-cols-4 gap-3">
  <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">...</div>
  <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">...</div>
  ...
</div>
```

---

## 5. Context Bar Rules

Every hub page (Finance, Partners, Commercial, Operations, Planning) MUST have a persistent context bar below the sticky tab nav.

```
Pattern: sticky div → tab nav (border-b) → context bar (border-b)
Location: always in the same sticky wrapper as the tab nav
```

Context bars use `FinanceContextBar` / `PartnersContextBar` pattern:
- `h-[46px]` minimum height
- `bg-gray-50/40 border-b border-gray-100`  
- Readings: `text-[8px] font-black uppercase` label + `text-[13px] font-black tabular-nums` value
- Loading: `h-[46px] animate-pulse bg-gray-50/60`

---

## 6. Pressure Banner Rules

Adaptive pressure banners must use `PressureBanner` component:

```tsx
import { PressureBanner } from '@/components/ds'

<PressureBanner
  severity="critical"
  tag="⚠ NAKİT KRİZİ"
  message="14g nakit ömrü — acil eylem gerekiyor"
  actionLabel="Eylem Planı"
  actionHref="/dashboard/planning?tab=cash-projection"
/>
```

**Never** inline the pressure banner style across pages. All banners must look identical.

---

## 7. Tab Navigation Rules

There is ONE tab navigation pattern. It comes from `UnifiedTabNav` or the inline border-bottom pattern:

```tsx
// Active tab
"text-gray-900 font-semibold border-b-2 border-gray-900 -mb-px"

// Inactive tab
"text-gray-400 hover:text-gray-600 font-medium"
```

**Never use:**
- Pill-style tabs (bg-primary-600 active)
- Rounded tabs with background colors
- Multiple border widths (`border-b-[3px]` etc.)

---

## 8. Decision Queue / Alert Row Rules

All workflow queues use the `AlertRow` component pattern:
- `border-l-[3px]` left accent (red=critical, amber=warning, gray=info)
- Grouped by severity: ACIL → YAKLAŞIYOR → BİLGİ
- Group labels: `text-[9px] font-black uppercase tracking-widest` in background `bg-{color}-50/60`
- Item action: filled button for critical, outlined for warning, text for info

---

## 9. Spacing Rules

| Context | Value | Notes |
|---------|-------|-------|
| Page main gap | `gap-5` | Between page sections |
| Card padding standard | `px-5 py-4` | Most panels |
| Card padding compact | `px-4 py-3` | Dense data panels |
| Card padding tight | `px-4 py-2.5` | Table headers, compact strips |
| Section grid gap | `gap-3` | Between KPI/summary cards |
| Inner content gap | `space-y-3` | Stacked items inside a panel |

---

## 10. Color Token Rules

| Purpose | Token | Forbidden alternatives |
|---------|-------|----------------------|
| Brand primary | `primary-600` / `primary-700` | `violet-600`, `indigo-600` |
| Success / positive | `emerald-600` / `emerald-700` | `green-600` |
| Warning | `amber-600` / `amber-700` | `yellow-600`, `orange-400` |
| Error / critical | `red-600` / `red-700` | `rose-600` |
| Text primary | `gray-900` | `zinc-900`, `slate-900` |
| Text secondary | `gray-500` | `gray-600` (too dark for secondary) |
| Text tertiary | `gray-400` | `gray-300` (too light) |
| Border default | `gray-100` | `gray-200` (for new OS-style panels) |

---

## 11. Animation Rules

| Animation | Usage |
|-----------|-------|
| `animate-pulse` | Loading skeletons ONLY |
| `transition-colors` | Hover state changes |
| `transition-all` | Complex hover with shadow + border changes |
| `animate-spin` | Loading spinner inside buttons |

**Never** use: custom keyframes, `animate-bounce`, `animate-ping` (except status dots)

---

## 12. Typography Scale (exhaustive)

```
Page title:       text-2xl font-black tracking-tight text-gray-900
Section label:    text-[10px] font-black uppercase tracking-widest text-gray-400
Sub-label:        text-[9px] font-black uppercase tracking-widest text-gray-400
KPI value (lg):   text-[22px] font-black tabular-nums
KPI value (md):   text-xl font-black tabular-nums
KPI value (sm):   text-sm font-black tabular-nums
Body text:        text-sm text-gray-700
Small body:       text-xs text-gray-600
Caption:          text-[10px] text-gray-400
Mini caption:     text-[9px] text-gray-400
Table header:     text-[9px] font-black uppercase tracking-widest text-gray-400
Table cell value: text-xs font-semibold text-gray-800
Mono number:      font-mono tabular-nums
```

---

## 13. Forbidden Patterns

These patterns are BANNED from the codebase:

```
❌ rounded-2xl (except legacy EmptyState components — do not add new ones)
❌ border-gray-200 on new panels
❌ grid gap-3 for primary KPI display (use KpiStrip instead)
❌ text-xl font-black (page hero must be text-2xl)
❌ inline animate-pulse without using Skeleton component
❌ hardcoded hex colors in style=""
❌ text-violet-600 (use text-primary-600)
❌ bg-violet-600 (use bg-primary-600)
❌ margin-based layout (use gap-5 flexbox)
❌ Section with only emoji icons (no emojis in data displays)
```

---

## 14. Component Import Rules

```tsx
// ✅ ALWAYS import from canonical barrel
import { Panel, PanelHeader, KpiStrip, KpiCell, SectionLabel } from '@/components/ds'

// ✅ ACCEPTABLE for specific cases
import { cn } from '@/components/ds'

// ❌ NEVER import from sub-packages directly when barrel exports it
import { FlowraCard } from '@/components/ui-kit/FlowraCard'  // use @/components/ds
```

---

*Last updated: 2026-05-17*  
*Enforced by: System Governor review on all dashboard changes*
