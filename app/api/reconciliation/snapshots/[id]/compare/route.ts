import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const previousId = req.nextUrl.searchParams.get('previous_id')
  if (!previousId) return NextResponse.json({ error: 'previous_id required' }, { status: 400 })

  const [curr, prev] = await Promise.all([
    supabase.from('reconciliation_snapshots').select('id,reconciliation_date,sections').eq('id', params.id).eq('company_id', companyId).maybeSingle(),
    supabase.from('reconciliation_snapshots').select('id,reconciliation_date,sections').eq('id', previousId).eq('company_id', companyId).maybeSingle(),
  ])

  if (!curr.data || !prev.data) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })

  const cs = curr.data.sections as any
  const ps = prev.data.sections as any

  const metrics = [
    { field: 'total_cash_try',       label: 'Nakit',           path: ['section2', 'total_cash_try'] },
    { field: 'total_receivables',    label: 'Alacaklar',       path: ['section3', 'total_receivables_try'] },
    { field: 'total_payables',       label: 'Borçlar',         path: ['section4', 'total_payables_try'] },
    { field: 'total_inventory',      label: 'Stok',            path: ['section5', 'total_inventory_try'] },
    { field: 'partner_loans',        label: 'Ortak Kredileri', path: ['section8', 'partner_loans'] },
    { field: 'total_equity',         label: 'Özkaynak',        path: ['section9', 'total_equity'] },
    { field: 'ytd_distributions',    label: 'Dağıtımlar',      path: ['section13', 'ytd_total'] },
    { field: 'net_income',           label: 'Net Kâr',         path: ['section15', 'net_profit_try'] },
  ]

  function getVal(obj: any, path: string[]): number {
    return path.reduce((o, k) => o?.[k] ?? 0, obj) as number
  }

  const fmtCur = (n: number) => new Intl.NumberFormat('tr-TR', {style: 'currency', currency: 'TRY', maximumFractionDigits: 0}).format(Math.abs(n))

  const deltas = metrics.map(m => {
    const current = getVal(cs, m.path)
    const previous = getVal(ps, m.path)
    const change = current - previous
    const change_pct = previous !== 0 ? Math.round((change / Math.abs(previous)) * 100) : null
    const absChgPct = Math.abs(change_pct ?? 0)
    return {
      field: m.field, label: m.label, previous, current, change,
      change_pct,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      significance: absChgPct > 25 ? 'critical' : absChgPct > 10 ? 'notable' : 'minor',
    }
  })

  const governanceSummary: string[] = deltas
    .filter(d => d.significance !== 'minor' && d.change !== 0)
    .map(d => {
      const dir = d.direction === 'up' ? 'arttı' : 'azaldı'
      return `${d.label} ${fmtCur(d.change)} ${dir}`
    })

  return NextResponse.json({
    current_id:    params.id,
    previous_id:   previousId,
    current_date:  curr.data.reconciliation_date,
    previous_date: prev.data.reconciliation_date,
    deltas,
    governance_summary: governanceSummary,
  })
}
