# Flowra Web UI Kit

A high-fidelity, click-through recreation of the **Flowra dashboard** — the only product surface Flowra ships. Components are simple cosmetic versions of the real ones (Supabase calls and Next.js plumbing stripped out), styled to match the production code in `BIRKANYARAN/flowra` exactly.

## Files

| File | What it is |
|---|---|
| `index.html` | Interactive shell — login → dashboard → drill into proforma. |
| `Shell.jsx` | App chrome — sidebar + header + main area. |
| `Sidebar.jsx` | Persistent left nav, grouped (Finans / Operasyon / Araçlar / Yönetim). |
| `Header.jsx` | Top bar with breadcrumb title + user + bell. |
| `Auth.jsx` | Login / register screen. |
| `Dashboard.jsx` | KPI grid + alerts + FX widget + recent table. |
| `Proformas.jsx` | List page. |
| `ProformaDetail.jsx` | Detail with line items + GENEL TOPLAM. |
| `Customers.jsx` | List page with the inline-form pattern. |
| `Primitives.jsx` | `Btn`, `Card`, `Input`, `StatusBadge`, `Money`, `Label`, `Icon`, `Alert`, `KpiCard`. |

## Conventions

All Tailwind classes match the real app. Lucide icons via CDN. State stored locally in React; "save" / "send" actions just `setState` to fake a backend.
