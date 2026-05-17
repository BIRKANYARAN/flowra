// ── WhatIfTab — Interactive Scenario Engine ────────────────────────────────────
// Server wrapper loads current-month baseline financials.
// Client island renders sliders + live P&L recalculation (zero API calls on slide).

import { createClient }     from '@/lib/supabase-server'
import { FinanceService }   from '@/lib/services/finance.service'
import { WhatIfClient }     from './_whatif/WhatIfClient'

interface Props { companyId: string; userId: string }

export async function WhatIfTab({ companyId, userId }: Props) {
  const supabase = createClient()
  const now   = new Date()
  const from  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to    = now.toISOString().slice(0, 10)
  const period = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  // Load current financials + debt service as baseline
  let revenue = 0, cogs = 0, expenses = 0, salesVat = 0, purchaseVat = 0, monthlyDebtService = 0

  try {
    const fs = await FinanceService.getFinancialSummary(userId, companyId, { from, to }, undefined, undefined, supabase)
    revenue      = fs.revenue_try
    cogs         = fs.cost_try
    expenses     = fs.expenses_total_try
    salesVat     = fs.sales_vat_try
    purchaseVat  = fs.purchase_vat_try + fs.expense_vat_try
  } catch { /* zero baseline is fine */ }

  try {
    const { data: tranches } = await supabase
      .from('partner_loan_tranches')
      .select('outstanding_try, annual_interest_rate')
      .eq('company_id', companyId)
      .eq('status', 'active')
    monthlyDebtService = (tranches ?? []).reduce((s, t) => {
      const p = Number(t.outstanding_try ?? 0)
      const r = Number(t.annual_interest_rate ?? 0)
      return s + (r > 0 ? p * r / 12 : p * 0.015)
    }, 0)
  } catch { /* zero */ }

  return (
    <WhatIfClient
      period={period}
      baseline={{ revenue, cogs, expenses, salesVat, purchaseVat, monthlyDebtService }}
    />
  )
}
