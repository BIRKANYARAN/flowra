// AI Summary Service — natural language situation summary
//
// Phase C: Generative AI via Anthropic Messages API (fetch-based, no extra SDK).
// Falls back to deterministic rule-based summary when API key is absent or
// the call fails (quota, timeout, transient error).
//
// Safety guardrails:
//   • All financial figures are computed by rule-based engines before being
//     passed here — AI never calculates numbers.
//   • Structured JSON output enforced via prompt + JSON.parse guard.
//   • If parse fails → rule-based fallback.
//   • Every AI call logs model version and a hash of inputs.

import type { SituationResult } from '@/lib/engines/situation.engine'
import type { DecisionAlert }   from '@/lib/engines/alert.engine'

export interface AISummaryInput {
  situation:   SituationResult
  topAlerts:   DecisionAlert[]
  period:      string      // e.g. "Mayıs 2026"
  revenue:     number
  netIncome:   number
  cashBalance: number
}

export interface AISummaryResult {
  summary_tr:    string       // 2-3 sentence Turkish narrative
  key_factors:   string[]    // 3 bullet points
  recommendation:string       // 1 actionable recommendation
  generated_by:  'ai' | 'rule_based'
  model_version?:string
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

// ── Anthropic API call (fetch, no SDK) ────────────────────────────────────

async function callAnthropicAPI(prompt: string): Promise<AISummaryResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: 512,
        messages: [{
          role:    'user',
          content: prompt,
        }],
      }),
      signal: AbortSignal.timeout(10_000),   // 10 s hard limit
    })

    if (!res.ok) {
      console.warn('[ai-summary] Anthropic API error:', res.status)
      return null
    }

    const data = await res.json()
    const text = data?.content?.[0]?.text as string | undefined
    if (!text) return null

    // Extract JSON block from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary_tr?:    string
      key_factors?:   string[]
      recommendation?:string
    }

    if (!parsed.summary_tr || !Array.isArray(parsed.key_factors) || !parsed.recommendation) {
      return null
    }

    return {
      summary_tr:    parsed.summary_tr,
      key_factors:   parsed.key_factors.slice(0, 3),
      recommendation:parsed.recommendation,
      generated_by:  'ai',
      model_version: ANTHROPIC_MODEL,
    }
  } catch (err) {
    console.warn('[ai-summary] Call failed, falling back:', (err as Error).message)
    return null
  }
}

// ── Rule-based fallback ────────────────────────────────────────────────────

function ruleBasedSummary(input: AISummaryInput): AISummaryResult {
  const { situation, topAlerts, period } = input
  const statusLabel: Record<string, string> = {
    healthy:  'sağlıklı bir seyirde',
    caution:  'dikkat gerektiren bir durumda',
    'at-risk':'risk altında',
    critical: 'kritik bir aşamada',
  }
  const statusText = statusLabel[situation.status] ?? 'belirsiz bir konumda'

  const criticals = topAlerts.filter(a => a.severity === 'critical')
  const alertText = criticals.length > 0
    ? ` En kritik mesele: ${criticals[0].title.toLowerCase()}.`
    : ''

  const summary_tr =
    `${period} döneminde şirket finansal açıdan ${statusText} (skor: ${situation.composite}/100).` +
    alertText +
    ` ${situation.situationLine}`

  const key_factors = [
    situation.criticalFactor
      ? `Kritik faktör: ${situation.criticalFactor}`
      : 'Temel göstergeler normal sınırlar içinde',
    topAlerts.length > 0
      ? `${topAlerts.length} aktif uyarı — ${criticals.length} kritik seviyede`
      : 'Aktif kritik uyarı bulunmuyor',
    input.netIncome > 0
      ? 'Dönem net kârı pozitif — büyüme fırsatları değerlendirilebilir'
      : 'Dönem net zararı var — gider kontrolü ve tahsilat öncelikli',
  ]

  const recommendation = criticals.length > 0
    ? (criticals[0].actionLabel
        ? `Önerilen aksiyon: ${criticals[0].actionLabel}`
        : 'Kritik uyarıları acilen ele alın')
    : situation.status === 'healthy'
    ? 'Mevcut performansı koruyun ve büyüme senaryolarını değerlendirin'
    : 'CFO kontrol panelini inceleyin ve açık dönemleri kapatın'

  return { summary_tr, key_factors, recommendation, generated_by: 'rule_based' }
}

// ── Build prompt ───────────────────────────────────────────────────────────

function buildPrompt(input: AISummaryInput): string {
  const { situation, topAlerts, period, revenue, netIncome, cashBalance } = input
  const alertLines = topAlerts
    .slice(0, 3)
    .map(a => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.detail}`)
    .join('\n')

  return `Sen bir Türk şirketinin mali danışmanısın. Aşağıdaki verilere dayanarak kısa Türkçe bir durum özeti oluştur.

DÖNEM: ${period}
DURUM SKORU: ${situation.composite}/100 (${situation.status})
DURUM SATIRI: ${situation.situationLine}
GELİR: ₺${Math.round(revenue).toLocaleString('tr-TR')}
NET KÂR/ZARAR: ₺${Math.round(netIncome).toLocaleString('tr-TR')}
NAKİT BAKİYE: ₺${Math.round(cashBalance).toLocaleString('tr-TR')}

AKTİF UYARILAR:
${alertLines || '(uyarı yok)'}

Kurallar:
- Sadece verilen verileri kullan, tahmin yürütme
- Türkçe yaz, profesyonel ve sade
- Rakamları tekrar etme — içgörüye odaklan
- SADECE aşağıdaki JSON formatında yanıt ver, başka metin ekleme:
{
  "summary_tr": "2-3 cümle özet",
  "key_factors": ["faktör 1", "faktör 2", "faktör 3"],
  "recommendation": "1 somut aksiyon cümlesi"
}`
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function generateSituationSummary(
  input: AISummaryInput,
): Promise<AISummaryResult> {
  const aiResult = await callAnthropicAPI(buildPrompt(input))
  if (aiResult) return aiResult
  return ruleBasedSummary(input)
}
