/**
 * Alert Settings Service — pure helpers for alert threshold configuration.
 *
 * No DB or network calls — pure function helpers only.
 * Used by /api/settings/alerts and the alerts settings page.
 */

export interface AlertThreshold {
  rule_type:       string   // e.g. 'RECEIVABLE_60', 'CASH_RUNWAY_30'
  threshold_value: number
  is_active:       boolean
  label:           string   // Turkish display name
  description:     string
}

export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  {
    rule_type:       'RECEIVABLE_30',
    threshold_value: 30,
    is_active:       true,
    label:           '30 Gün Alacak Uyarısı',
    description:     'Vadesi 30 günü geçen alacaklar için uyarı',
  },
  {
    rule_type:       'RECEIVABLE_60',
    threshold_value: 60,
    is_active:       true,
    label:           '60 Gün Alacak Kritik',
    description:     'Vadesi 60 günü geçen alacaklar için kritik uyarı',
  },
  {
    rule_type:       'CASH_RUNWAY_90',
    threshold_value: 90,
    is_active:       true,
    label:           '90 Gün Nakit Runway',
    description:     'Nakit bitmesine 90 gün kaldığında uyarı',
  },
  {
    rule_type:       'CASH_RUNWAY_30',
    threshold_value: 30,
    is_active:       true,
    label:           '30 Gün Nakit Kritik',
    description:     'Nakit bitmesine 30 gün kaldığında kritik',
  },
  {
    rule_type:       'DSR_HIGH',
    threshold_value: 70,
    is_active:       true,
    label:           'Yüksek Borç Yük Oranı',
    description:     'Borç servis oranı %70 üzerinde',
  },
  {
    rule_type:       'PARTNER_BURDEN',
    threshold_value: 20,
    is_active:       true,
    label:           'Ortak Yük Dengesizliği',
    description:     'Ortak yük skoru %20 üzerinde',
  },
  {
    rule_type:       'PERIOD_LATE',
    threshold_value: 10,
    is_active:       true,
    label:           'Geciken Dönem Kapanışı',
    description:     'Dönem kapanışı 10 gün gecikmiş',
  },
]

/**
 * mergeWithDefaults — for each default threshold, use the stored value if a
 * matching rule_type is found in `stored`, otherwise keep the default.
 */
export function mergeWithDefaults(
  stored: Partial<AlertThreshold>[],
  defaults: AlertThreshold[],
): AlertThreshold[] {
  return defaults.map(def => {
    const match = stored.find(s => s.rule_type === def.rule_type)
    if (!match) return def
    return {
      ...def,
      ...(match.threshold_value !== undefined ? { threshold_value: match.threshold_value } : {}),
      ...(match.is_active       !== undefined ? { is_active:       match.is_active }       : {}),
      ...(match.label           !== undefined ? { label:           match.label }           : {}),
      ...(match.description     !== undefined ? { description:     match.description }     : {}),
    }
  })
}

/**
 * validateThreshold — value must be > 0 AND <= 365.
 */
export function validateThreshold(
  rule_type: string,
  value: number,
): { valid: boolean; error?: string } {
  if (!Number.isFinite(value) || value <= 0) {
    return { valid: false, error: `${rule_type}: eşik değeri 0'dan büyük olmalıdır` }
  }
  if (value > 365) {
    return { valid: false, error: `${rule_type}: eşik değeri 365'ten büyük olamaz` }
  }
  return { valid: true }
}

/**
 * countActiveRules — returns the number of thresholds where is_active === true.
 */
export function countActiveRules(thresholds: AlertThreshold[]): number {
  return thresholds.filter(t => t.is_active).length
}
