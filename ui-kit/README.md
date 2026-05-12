# Flowra Design System

> **Flowra — ERP & Satış Yönetim Sistemi** (Turkish-language ERP & sales management SaaS)
> Modern, opinionated, finance-focused dashboard. Violet-primary, heavy type, tabular numerals everywhere.

---

## Index

| File / folder | What it is |
|---|---|
| `colors_and_type.css` | All CSS custom properties — colors, type, spacing, radii, shadows, semantic states. |
| `fonts/` | LiberationSans (Apache-2). **For PDF generation only**, not the UI. UI uses Inter (Google Fonts) as the closest hosted match for the codebase's `ui-sans-serif → system-ui` stack. ⚠️ Substitution flagged below. |
| `assets/` | Logos, mark variations, brand fragments. |
| `preview/` | Cards rendered in the Design System tab — tokens, components, specimens. |
| `ui_kits/web/` | High-fidelity recreation of the Flowra dashboard UI. One product, one kit. |
| `SKILL.md` | Skill manifest — makes this folder usable as a Claude Skill. |

---

## What is Flowra?

A self-hosted-ish (Supabase + Next.js) ERP and sales-management tool aimed at **Turkish small-to-mid businesses**, with a CEO/CFO bias. The dashboard is built for owners who actually look at cash flow daily.

**Surfaces (one product, one app):**
- `app/auth` — login / register
- `app/dashboard` — the entire app: Genel Durum (overview), Analitik, Ortaklar, Simülasyon, Satışlar, Tahsilatlar, Giderler, Proformalar, Stok, Görevler, Müşteriler, Ürünler, Ayarlar, plus admin (Ekip, Denetim Kaydı, Yedekleme).
- `/public/proforma/[id]` — anonymous shareable proforma view.
- PDF generator — proforma invoices via jsPDF + LiberationSans.

**Stack & sources of truth:**
- Source repo: [`BIRKANYARAN/flowra`](https://github.com/BIRKANYARAN/flowra) (default branch `main`, commit `369c8e3` at time of authoring)
- Imported into `components/` and `app/` in this project for direct reading.
- Tailwind config: `tailwind.config.js` — primary aliased to violet, `fg-{1..4}`, `surface{,-subtle,-muted}` semantic tokens, custom shadows `card` / `pdf`.
- Reference design system page in code: `app/dashboard/_ds/page.tsx` (dev-only, `/dashboard/_ds`).
- CVA-driven primitives: `components/ui/index.tsx`.
- Adapters: `components/ui-kit/Flowra*.tsx`.
- Iconography: `components/ui/Icon.tsx` — Lucide registry with emoji fallback aliasing.
- Logo: `components/ui/FlowraLogo.tsx` — gradient-square mark + wordmark.

No Figma was provided. Codebase was the only source of truth.

---

## Content Fundamentals

**Language.** Turkish-first. Every UI string in the codebase is Turkish. Diacritics matter (`ç ğ ı İ ö ş ü`), and the type system has to support them — Inter does, LiberationSans does (specifically chosen for PDF Turkish support).

**Tone.** Direct, professional, finance-literate. No marketing fluff, no hand-holding. The audience is owners and accountants who already know the words *proforma*, *KDV*, *FX kaydı*, *eşitleme açığı*. Sentences are short and declarative.

**Person.** Mostly **second-person formal/imperative**, omitted-pronoun ("Düzenle", "Sil", "Kaydet", "Yenile") — Turkish doesn't always need a pronoun. When forms address the user it leans command-y: *"E-postanızı onaylayın."* Avoid "biz/we" voice.

**Casing.** Sentence-case for body strings ("Bu alan zorunludur"), Title Case for nav labels ("Genel Durum", "Satış Akışı"), and `UPPERCASE WIDE-TRACKED` for tiny meta labels ("GÜNCEL KUR", "DAĞITILABILIR").

**Numbers & money.**
- Currency symbol prefixes the number with a thin neutral color: `<span class="muted">₺</span>1.234,56` — symbol is *de-emphasized*, the digits do the talking.
- Decimal: `,` (comma). Thousands: `.` (dot). Always use `tr-TR` locale.
- Tabular numerals (`font-variant-numeric: tabular-nums`) on every numeric value, no exceptions.
- Sign rendering: `+` for positive (when `signed`), `−` (Unicode minus, not hyphen) for negative.
- Decimals: 2 by default, **0 for KPI tiles** (those values are big and stripped clean).

**Status vocabulary** (from `components/ui/index.tsx`):

| EN key | TR display | Tone |
|---|---|---|
| `draft` | Taslak | gray |
| `sent` | Gönderildi | blue |
| `accepted` | Onaylandı | emerald |
| `rejected` | Reddedildi | red |
| `converted` | Dönüştürüldü | violet (primary!) |
| `paid` / `completed` | Ödendi / Tamamlandı | emerald |
| `unpaid` / `partial` | Bekliyor / Kısmi | amber |
| `overdue` | Gecikmiş | red |

**Emoji.** **No emoji in production copy.** The `Icon` component has emoji aliases (`📦` → `stocks`, `🔥` → `flame`) purely as **legacy fallbacks during the Lucide migration** — the canonical icon is the Lucide glyph. Emoji *do* survive in two places: the empty-state component (`📄`, `👥` as a friendly empty illustration) and a few alert tone calls (kept because they're load-bearing for the meaning, like `🧪 Demo Veri`). When in doubt, use a Lucide icon.

**Examples lifted from the app:**
- `KDV ödemesi: ₺12.345,67 — Beyan döneminde ödenecek.`
- `Nakit ~18 günde tükenebilir — Aylık ₺45K zarar, likit varlık ₺810K.`
- `Henüz müşteri eklenmedi.`
- `Bu alan zorunludur.`
- `▲ 12.3% geçen ay`

---

## Visual Foundations

**Color story.** Single accent color — **violet 600 `#7c3aed`** — used sparingly and confidently: active sidebar item, primary CTA, the Flowra logo gradient, the "converted" status. Surfaces are off-white/white. Borders are very light gray. Text is a 4-step ramp (`fg-1..4`). Semantic state colors are conventional and quiet: emerald for success, amber/orange for warnings, red for danger, blue for info — all use the `*-50` tinted background + `*-700` foreground pattern, never solid blocks.

**Type.** Inter (Google Fonts substitute for the codebase's system stack — see Substitutions). Sizes are conservative: page titles 24px, body 14px, meta 12px, tiny labels 10px. The signature move is **font-weight 900 (`font-black`) + tight tracking (`-0.01em`)** on every heading and KPI value. This is what gives Flowra its "stamped" feeling. Tabular numerals on everything numeric.

**Spacing.** Tailwind scale, with named overrides for `page-x` and `page-y` at `1.5rem` (24px). Card internal padding defaults to `p-5` (20px). Stack gaps mostly use `gap-3` / `gap-4`. The dashboard sidebar is `w-56` (224px), header is `h-14` (56px) — both pinned constants.

**Backgrounds.** No imagery. No patterns. No gradients (except the logo mark itself). Page background is `#f4f4f5` (warm-cool neutral), cards float on white with 1px borders, that's the entire stack. Imagery would feel out of place — this is a numbers tool.

**Animation.** Almost none. Color transitions only — `transition-colors` on hover/active states. The only moving thing is a 6px violet spinner during loading (`border-2 border-primary-500 border-t-transparent rounded-full animate-spin`). No bounces, no slide-ins, no parallax.

**Hover states.**
- Buttons: bump from `*-600` → `*-700` (darker shade). Secondary/ghost: `bg-gray-50`.
- Cards (interactive): border darkens from `gray-200` → `gray-300`. No shadow change.
- Table rows: background `bg-gray-50/60` (60% opacity gray-50 — softer than full).
- Nav: text darkens from `gray-600` → `gray-900`, background `bg-gray-50`.

**Press / active states.** No scale transforms, no shadow press. Active sidebar item gets the violet treatment (`bg-primary-600 text-white font-semibold`). Disabled buttons drop to `opacity-50` and `cursor-not-allowed`.

**Borders.** 1px, `gray-200` (`#e5e7eb`) is the workhorse. Internal table separators use `gray-100` (lighter). Border + radius are the *only* visual containment — Flowra explicitly avoids drop-shadow-as-container.

**Shadows.** Two named shadows: `card` (very subtle, 1+1px stack), `pdf` (heavier, used on the printed proforma preview). Most cards have **no shadow at all** — just border.

**Radii.** Mostly `rounded-xl` (12px) for buttons, inputs, nav items. `rounded-2xl` (16px) for cards, alerts, modals. `rounded-lg` (8px) for icons-in-a-square. `rounded-full` for avatars, role pills.

**Transparency / blur.** Effectively zero. One use: the `bg-gray-50/60` table-row hover. No backdrop-blur, no glassmorphism.

**Imagery vibe.** N/A — there is no imagery. If a customer logo gets uploaded, it's clipped to a 32×32 rounded square with `object-contain`. That's it.

**Layout rules.**
- Persistent left sidebar (`w-56`), always-visible header bar (`h-14`).
- Main content max-width is loose — pages decide. Forms cap at `max-w-3xl` or `max-w-xl`.
- Page-level vertical rhythm uses `space-y-10` between major sections, `space-y-4` within forms, `gap-3` for KPI grids.
- KPI grid is 4 columns at desktop, no breakpoints heavily customized.

**Cards.** White background, 1px `gray-200` border, `rounded-2xl` (16px), `p-5` default. Interactive variants add hover-border-darken. **Never** a left-color-accent stripe — Flowra uses tone-tinted full backgrounds (`bg-amber-50` etc.) for emphasis.

**Capsules vs gradients.** Capsules everywhere (status badges, role pills, alert pills), gradients almost nowhere — the only gradient is the logo (violet 500 → 700, 135deg).

---

## Iconography

**Primary system: Lucide React** (`lucide-react@0.468`). The codebase wraps Lucide in a single `<Icon name="..." />` component (`components/ui/Icon.tsx`) keyed by ~50 semantic names: `dashboard`, `stocks`, `proformas`, `sales`, `collections`, `expenses`, `partners`, `simulation`, `analytics`, `settings`, `customers`, `products`, `arrow-right`, `plus`, `search`, `refresh`, `check`, `x`, `mail`, `phone`, `trash`, `edit`, `bell`, `flame`, `coins`, `alert`, `info`, `filter`, `eye`, `eye-off`, `shield`, `users` (admin), `tasks`, `backup`, etc.

**Style.** Lucide default — outline icons, **stroke-width 1.5** (slightly lighter than Lucide's default of 2, set globally in the wrapper). Sizes: 14 (in pills), 16 (default in nav/buttons), 18 (in card alerts), 20 (in icon grids).

**CDN delivery in this design system.** Lucide is consumed via the Lucide CDN ESM bundle (`https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js`) so the static design previews don't need a bundler. Names are 1:1 with `lucide-react` — `LayoutGrid`, `Package`, etc.

**Emoji.** Not part of the design language for production strings. The `Icon` component has an **emoji-alias registry** (`📦` → `stocks`, `🔥` → `flame`) but only as a **migration shim** so legacy call sites don't break — every emoji has a Lucide equivalent that should win. The empty-state component still uses a single emoji as a "friendly placeholder" (e.g. `📄` for "no proformas yet"), which is the only sanctioned ongoing emoji use.

**Custom SVGs.** Exactly one — the **FlowraLogo mark**, hand-drawn in the React component (an arc + dot composition on a violet gradient square). No other custom SVGs in the codebase. Copied to `assets/flowra-logo-mark.svg` for reuse.

**No icon font / no icon sprite.** Just Lucide + the one logo SVG.

---

## Substitutions / Caveats

- **Font:** UI uses **Inter** (Google Fonts) as the closest hosted match for the codebase's `ui-sans-serif → system-ui` Tailwind default. The actual app at runtime uses each user's system font (San Francisco, Segoe UI Variable, Roboto). If you need pixel parity with the deployed site, ship the system stack instead.
- **LiberationSans** is preserved in `fonts/` exactly as the codebase ships it — for jsPDF / Turkish-character support in PDF output. Don't substitute.
- **No Figma file** was provided. All design context was reverse-engineered from the codebase. If a Figma exists, attaching it would let me cross-check spacing and find any unimplemented states.
- **No marketing site / brand guidelines doc** was provided either — only the product. So the "tone" notes are inferred from in-app copy.
- **Logo wordmark** is rendered as text with a violet gradient (`bg-clip-text`) — there's no separate SVG wordmark in the repo. If a vector wordmark exists elsewhere, drop it in `assets/`.
