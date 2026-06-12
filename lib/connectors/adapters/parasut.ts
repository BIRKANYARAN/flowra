// ── lib/connectors/adapters/parasut.ts ───────────────────────────────────────
//
// LIVE Paraşüt v4 adapter — OAuth2 + paginated JSON:API reads, mapped via the
// pure parasut-map functions. NO secrets in the repo: all credentials come from
// env (or an explicit config). With no credentials it behaves like the skeleton
// (NotConfiguredError), so importing/constructing it is always safe.
//
// Env (server-side only): PARASUT_COMPANY_ID, PARASUT_CLIENT_ID,
// PARASUT_CLIENT_SECRET, plus EITHER PARASUT_USERNAME + PARASUT_PASSWORD (primary,
// password grant) OR PARASUT_REFRESH_TOKEN (and optional PARASUT_ACCESS_TOKEN).
// client_id/client_secret are issued by destek@parasut.com — there is no self-serve
// API screen. company_id is the number in https://uygulama.parasut.com/{id}/.
//
// ⚠️ Untested against a live account — field names follow the Paraşüt v4 docs;
// verify with a real company + a granted token before production sync.

import type { AccountingConnector, SyncWindow, Page } from '../accounting-connector'
import type { ExternalInvoice, ExternalExpense, ExternalParty, ExternalCollection } from '../types'
import { NotConfiguredError } from '../types'
import { buildIncludedMap, mapInvoice, mapExpense, mapContact, type JsonApiResource } from './parasut-map'

const API_BASE   = 'https://api.parasut.com/v4'
const TOKEN_URL  = 'https://api.parasut.com/oauth/token'

export interface ParasutConfig {
  companyId:     string
  clientId:      string
  clientSecret:  string
  /** Primary path: Paraşüt account email + password (OAuth password grant). */
  username?:     string
  password?:     string
  /** Renewal / alternative path. */
  refreshToken?: string
  accessToken?:  string
}

function configFromEnv(): ParasutConfig | null {
  const companyId    = process.env.PARASUT_COMPANY_ID
  const clientId     = process.env.PARASUT_CLIENT_ID
  const clientSecret = process.env.PARASUT_CLIENT_SECRET
  if (!companyId || !clientId || !clientSecret) return null
  return {
    companyId, clientId, clientSecret,
    username:     process.env.PARASUT_USERNAME,
    password:     process.env.PARASUT_PASSWORD,
    refreshToken: process.env.PARASUT_REFRESH_TOKEN,
    accessToken:  process.env.PARASUT_ACCESS_TOKEN,
  }
}

interface JsonApiList { data?: JsonApiResource[]; included?: JsonApiResource[]; meta?: { current_page?: number; total_pages?: number } }

export class ParasutConnector implements AccountingConnector {
  readonly provider = 'parasut' as const
  private readonly cfg: ParasutConfig | null
  private token: string | null

  constructor(config?: ParasutConfig) {
    this.cfg = config ?? configFromEnv()
    this.token = this.cfg?.accessToken ?? null
  }

  private require(): ParasutConfig {
    if (!this.cfg) throw new NotConfiguredError('parasut', 'PARASUT_* env değişkenleri ayarlı değil')
    return this.cfg
  }

  // ── OAuth: obtain an access token ──────────────────────────────────────────
  // Primary: password grant (account email + password). Alt: refresh_token grant.
  private async accessToken(): Promise<string> {
    if (this.token) return this.token
    const cfg = this.require()
    let body: URLSearchParams
    if (cfg.refreshToken) {
      body = new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: cfg.refreshToken,
        client_id: cfg.clientId, client_secret: cfg.clientSecret,
      })
    } else if (cfg.username && cfg.password) {
      body = new URLSearchParams({
        grant_type: 'password', username: cfg.username, password: cfg.password,
        client_id: cfg.clientId, client_secret: cfg.clientSecret,
      })
    } else {
      throw new NotConfiguredError('parasut', 'kullanıcı adı/şifre ya da refresh token gerekli')
    }
    const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!res.ok) throw new Error(`Paraşüt OAuth başarısız (${res.status})`)
    const json = await res.json() as { access_token?: string }
    if (!json.access_token) throw new Error('Paraşüt access_token alınamadı')
    this.token = json.access_token
    return this.token
  }

  // ── Generic paginated JSON:API GET ─────────────────────────────────────────
  private async getPage(path: string, window?: SyncWindow, include = 'contact'): Promise<JsonApiList> {
    const cfg = this.require()
    const token = await this.accessToken()
    const url = new URL(`${API_BASE}/${cfg.companyId}/${path}`)
    if (include) url.searchParams.set('include', include)
    url.searchParams.set('page[size]', String(window?.limit ?? 25))
    url.searchParams.set('page[number]', window?.cursor ?? '1')
    if (window?.since) url.searchParams.set('filter[issue_date]', `${window.since.slice(0, 10)}..`)
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Paraşüt ${path} okunamadı (${res.status})`)
    return res.json() as Promise<JsonApiList>
  }

  private nextCursor(meta: JsonApiList['meta']): string | null {
    const cur = meta?.current_page ?? 1
    const tot = meta?.total_pages ?? 1
    return cur < tot ? String(cur + 1) : null
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try { await this.accessToken(); return { ok: true } }
    catch (e) { return { ok: false, detail: e instanceof Error ? e.message : 'bağlantı yok' } }
  }

  async listInvoices(window?: SyncWindow): Promise<Page<ExternalInvoice>> {
    const r = await this.getPage('sales_invoices', window)
    const inc = buildIncludedMap(r.included)
    return { items: (r.data ?? []).map(d => mapInvoice(d, inc, 'outbound')), nextCursor: this.nextCursor(r.meta) }
  }

  async listExpenses(window?: SyncWindow): Promise<Page<ExternalExpense>> {
    const r = await this.getPage('purchase_invoices', window)
    const inc = buildIncludedMap(r.included)
    return { items: (r.data ?? []).map(d => mapExpense(d, inc)), nextCursor: this.nextCursor(r.meta) }
  }

  async listCustomers(window?: SyncWindow): Promise<Page<ExternalParty>> {
    return this.listContacts('customer', window)
  }
  async listSuppliers(window?: SyncWindow): Promise<Page<ExternalParty>> {
    return this.listContacts('supplier', window)
  }
  private async listContacts(accountType: 'customer' | 'supplier', window?: SyncWindow): Promise<Page<ExternalParty>> {
    const cfg = this.require()
    const token = await this.accessToken()
    const url = new URL(`${API_BASE}/${cfg.companyId}/contacts`)
    url.searchParams.set('filter[account_type]', accountType)
    url.searchParams.set('page[size]', String(window?.limit ?? 25))
    url.searchParams.set('page[number]', window?.cursor ?? '1')
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Paraşüt contacts okunamadı (${res.status})`)
    const r = await res.json() as JsonApiList
    return { items: (r.data ?? []).map(mapContact), nextCursor: this.nextCursor(r.meta) }
  }

  async listCollections(window?: SyncWindow): Promise<Page<ExternalCollection>> {
    const r = await this.getPage('transactions', window, '')
    const items: ExternalCollection[] = (r.data ?? [])
      .filter(d => Number((d.attributes?.amount as number) ?? 0) > 0)   // inflows only
      .map(d => {
        const a = d.attributes ?? {}
        return {
          external_id: d.id,
          invoice_external_id: null,
          party_name: typeof a.description === 'string' ? a.description : null,
          date: typeof a.date === 'string' ? a.date.slice(0, 10) : '',
          currency: typeof a.currency === 'string' ? a.currency : 'TRY',
          amount: Math.abs(Number(a.amount ?? 0)),
          method: null,
          updated_at: typeof a.updated_at === 'string' ? a.updated_at : null,
        }
      })
    return { items, nextCursor: this.nextCursor(r.meta) }
  }
}
