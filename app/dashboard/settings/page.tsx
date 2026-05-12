// ── /dashboard/settings — Ayarlar (server component) ─────────────────────────
//
// FAZ 19: Converted from 'use client' to server component.
//
// Prefetches:
//   • user_settings — company info + logo_url
//   • company_banks — bank account list
//   • policy_rates  — interest rate history (TRY, last 6)
//
// Client island:
//   SettingsClient — all CRUD forms (logo upload, company info, banks, interest rate, demo)
//
// Self-HTTP eliminated; loading spinner on mount eliminated.

export const dynamic = 'force-dynamic'

import { redirect }         from 'next/navigation'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import type { CompanyBank, UserSettings } from '@/types'
import SettingsClient, { type IntRateRow } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch { redirect('/auth') }

  // ── Parallel fetch ─────────────────────────────────────────────────────────
  const [settingsRes, banksRes, ratesRes] = await Promise.all([
    supabase
      .from('user_settings')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('company_banks')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('is_default', { ascending: false }),
    supabase
      .from('policy_rates')
      .select('rate_date, annual_rate, source')
      .eq('currency', 'TRY')
      .order('rate_date', { ascending: false })
      .limit(6),
  ])

  const initialSettings   = (settingsRes.data ?? null) as UserSettings | null
  const initialBanks      = (banksRes.data   ?? [])   as CompanyBank[]
  const initialIntHistory = (ratesRes.data   ?? [])   as IntRateRow[]

  return (
    <SettingsClient
      initialSettings={initialSettings}
      initialBanks={initialBanks}
      initialIntHistory={initialIntHistory}
    />
  )
}
