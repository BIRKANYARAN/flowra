// ─────────────────────────────────────────────────────────────────────────────
// lib/intelligence/observations.ts
//
// Pure observation engine — no DB writes, no LLM calls.
// Input: pre-fetched operational data
// Output: ObservationSpec[] with context, severity, and suggested action
// All rules are deterministic — no external API calls.
// ─────────────────────────────────────────────────────────────────────────────

export interface ObservationSpec {
  id: string                    // stable key for dedup
  context: string               // where this appears: 'collections' | 'partners' | 'expenses' | 'period-close' | 'cashflow'
  type: string                  // e.g. 'payment_pattern_deteriorating' | 'partner_loan_concentration'
  title: string                 // short Turkish title
  detail: string                // one sentence explanation
  severity: 'signal' | 'caution' | 'critical'
  actionLabel?: string
  actionHref?: string
}

export interface ObservationInput {
  // Collections context
  collections?: Array<{
    id: string
    customer_name: string
    days_overdue: number
    total_try: number
    payment_status: string
    invoice_count: number
  }>

  // Partner context
  partnerLoans?: Array<{
    partner_name: string
    net_loan_try: number
    total_loans_try: number
    share_ratio: number
  }>

  // Expense context
  expenseAnomalies?: Array<{
    category: string
    current_month: number
    trailing_avg: number
  }>

  // Cashflow context
  cashRunwayMonths?: number
  dsr?: number   // debt service ratio 0–1

  // Period context
  periodEndDate?: string
  daysSincePeriodEnd?: number

  // Receivables aging context
  avgAgingDays?: number
}

export function deriveObservations(input: ObservationInput): ObservationSpec[] {
  const obs: ObservationSpec[] = []

  // ── RULE 1: Customer with 2+ open invoices and overdue > 30 days ─────────
  if (input.collections && input.collections.length > 0) {
    // Group by customer_name
    const byCustomer = new Map<string, typeof input.collections>()
    for (const row of input.collections) {
      const existing = byCustomer.get(row.customer_name) ?? []
      existing.push(row)
      byCustomer.set(row.customer_name, existing)
    }

    for (const [customerName, rows] of byCustomer.entries()) {
      const overdueRows = rows.filter(r => r.days_overdue > 30)
      if (overdueRows.length >= 2) {
        const totalAtRisk = overdueRows.reduce((s, r) => s + r.total_try, 0)
        const maxOverdue  = Math.max(...overdueRows.map(r => r.days_overdue))
        obs.push({
          id:          `collection-multi-overdue-${customerName.replace(/\s+/g, '-').toLowerCase()}`,
          context:     'collections',
          type:        'multi_invoice_overdue',
          title:       'Çoklu Gecikmiş Fatura',
          detail:      `${customerName} adlı müşterinin ${overdueRows.length} açık faturası var ve en fazla ${maxOverdue} gün gecikmiş — tahsilat riski yüksek.`,
          severity:    maxOverdue > 60 ? 'critical' : 'caution',
          actionLabel: 'Tahsilat Görünümü',
          actionHref:  '/dashboard/commercial?tab=collections',
        })
      }
    }

    // RULE 7: Aging acceleration — avg_aging_days > 45
    if (input.avgAgingDays !== undefined && input.avgAgingDays > 45) {
      obs.push({
        id:          'collection-aging-acceleration',
        context:     'collections',
        type:        'aging_acceleration',
        title:       'Alacak Yaşlanması Hızlanıyor',
        detail:      `Açık alacakların ortalama yaşı ${input.avgAgingDays} gün — tahsilat süreleri uzuyor.`,
        severity:    input.avgAgingDays > 75 ? 'critical' : 'caution',
        actionLabel: 'Risk Analizi',
        actionHref:  '/dashboard/finance?tab=risks',
      })
    }
  }

  // ── RULE 2: Partner loan concentration > 70% from one partner ────────────
  if (input.partnerLoans && input.partnerLoans.length > 0) {
    const totalLoans = input.partnerLoans.reduce((s, p) => s + p.net_loan_try, 0)
    if (totalLoans > 0) {
      for (const partner of input.partnerLoans) {
        const concentration = partner.net_loan_try / totalLoans
        if (concentration > 0.70) {
          obs.push({
            id:          `partner-concentration-${partner.partner_name.replace(/\s+/g, '-').toLowerCase()}`,
            context:     'partners',
            type:        'partner_loan_concentration',
            title:       'Ortak Borç Dengesi Bozuk',
            detail:      `Ortak borç yükü dengesiz: ${partner.partner_name} toplam borcun %${Math.round(concentration * 100)}'ini taşıyor.`,
            severity:    concentration > 0.85 ? 'critical' : 'caution',
            actionLabel: 'Waterfall Simüle Et',
            actionHref:  '/dashboard/partners?tab=waterfall',
          })
        }
      }
    }
  }

  // ── RULE 3: Expense anomaly > 2x trailing average ─────────────────────────
  if (input.expenseAnomalies && input.expenseAnomalies.length > 0) {
    for (const anomaly of input.expenseAnomalies) {
      if (anomaly.trailing_avg > 0) {
        const ratio = anomaly.current_month / anomaly.trailing_avg
        if (ratio > 2) {
          obs.push({
            id:          `expense-anomaly-${anomaly.category}`,
            context:     'expenses',
            type:        'expense_anomaly',
            title:       'Anormal Gider Artışı',
            detail:      `${anomaly.category} kategorisi bu ay ortalamadan ${ratio.toFixed(1)}× daha yüksek — harcama kontrolü önerilir.`,
            severity:    ratio > 3 ? 'critical' : 'caution',
            actionLabel: 'Kategoriye Bak',
            actionHref:  '/dashboard/operations?tab=expenses',
          })
        }
      }
    }
  }

  // ── RULE 4: Cash runway < 60 days ────────────────────────────────────────
  if (input.cashRunwayMonths !== undefined && input.cashRunwayMonths >= 0) {
    const runwayDays = Math.round(input.cashRunwayMonths * 30)
    if (runwayDays < 60) {
      obs.push({
        id:          'cashflow-critical-runway',
        context:     'cashflow',
        type:        'low_cash_runway',
        title:       'Nakit Ömrü Kritik Seviyede',
        detail:      `Tahmini nakit ömrü ${runwayDays} gün — acil nakit akışı planlaması gerekiyor.`,
        severity:    runwayDays < 30 ? 'critical' : 'caution',
        actionLabel: 'Nakit Projeksiyonu',
        actionHref:  '/dashboard/planning?tab=cash-projection',
      })
    }
  }

  // ── RULE 5: DSR > 0.5 ────────────────────────────────────────────────────
  if (input.dsr !== undefined && input.dsr > 0.5) {
    obs.push({
      id:          'cashflow-high-dsr',
      context:     'cashflow',
      type:        'high_debt_service_ratio',
      title:       'Borç Servisi Yüksek',
      detail:      `Borç servisi gelirin %${Math.round(input.dsr * 100)}'ini aşıyor — simülasyon önerilir.`,
      severity:    input.dsr > 0.75 ? 'critical' : 'caution',
      actionLabel: 'Waterfall Simüle Et',
      actionHref:  '/dashboard/partners?tab=waterfall',
    })
  }

  // ── RULE 6: Period not closed > 10 days after period end ─────────────────
  if (
    input.daysSincePeriodEnd !== undefined &&
    input.daysSincePeriodEnd > 10 &&
    input.periodEndDate
  ) {
    obs.push({
      id:          `period-close-overdue-${input.periodEndDate}`,
      context:     'period-close',
      type:        'period_close_delayed',
      title:       'Dönem Kapanmadı',
      detail:      `${input.periodEndDate} dönemi kapanmadan ${input.daysSincePeriodEnd} gün geçti — bilanço donmuş durumda.`,
      severity:    input.daysSincePeriodEnd > 30 ? 'critical' : 'caution',
      actionLabel: 'CFO Kontrol Paneli',
      actionHref:  '/dashboard/finance?tab=cfo',
    })
  }

  return obs
}
