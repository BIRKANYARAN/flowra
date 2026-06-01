# Flowra — Final Delivery Package

Produced by the FLOWRA FINAL DELIVERY PROGRAM (independent audit → fix → verify →
deploy → deliver). Every code fix referenced here is on `main` and deployed to
Vercel production.

| Doc | Contents |
|---|---|
| `01-AUDIT-REPORT.md` | Phase-1 independent audit: 8 scores, verdict, critical/high defects (evidence-cited) |
| `02-CREDENTIAL-GATED-AND-DECISIONS.md` | Work requiring Supabase admin access or business/legal sign-off (exact specs) |
| `03-FINAL-DELIVERY-REPORT.md` | Final architecture, module/DB map, deployment & test state, re-scored readiness |
| `guides/USER-GUIDE-TR.md` | End-user guide (Turkish) |
| `guides/ADMIN-GUIDE.md` | Company administrator guide |
| `guides/CFO-GUIDE.md` | How the financial numbers are computed and where they live |
| `guides/DEPLOYMENT-GUIDE.md` | Fresh install, upgrade, env vars, CI gate, rollback |
| `guides/BACKUP-RECOVERY-GUIDE.md` | Backup cadence, restore procedures, post-recovery integrity checks |

**Install package:** `supabase/FLOWRA_PRODUCTION_INSTALL.sql` (+ `supabase/CLEAN_INSTALL_GUIDE.md`)
**Upgrade package:** `supabase/FLOWRA_PRODUCTION_UPGRADE.sql` + `supabase/migrations/`

Production-readiness moved **34 → 66**; the ceiling is held by credential-gated
items (existing-prod migration apply, event-outbox RPC alignment) documented in `02`.
