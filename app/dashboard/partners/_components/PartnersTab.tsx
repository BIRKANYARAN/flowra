'use client'

import Link from 'next/link'
import { NarrativeFooter } from '@/components/ds'
import {
  PartnerRow, EqResult, TxRow,
  pct, fmt, TX_TYPE_LABELS,
} from '@/app/dashboard/partners/_components/types'
import { ShareBar, Skeleton } from '@/app/dashboard/partners/_components/ui'

export interface PartnersTabProps {
  loading: boolean
  fetchError: string | null
  partners: PartnerRow[]
  equalization: EqResult
  availCash: number
  totalPartnerBalance: number
  totalDistributed: number
  hasPartners: boolean
  editId: string | null
  editForm: { name: string; shareRatioPct: string }
  editSaving: boolean
  editErr: string | null
  expandedTxId: string | null
  loadingTxId: string | null
  partnerTxs: Record<string, TxRow[]>
  onOpenEdit: (p: PartnerRow) => void
  onCancelEdit: () => void
  onSaveEdit: (partnerId: string) => void
  onDeletePartner: (partnerId: string, name: string) => void
  onToggleTxHistory: (partnerId: string) => void
  onEditFormChange: (form: { name: string; shareRatioPct: string }) => void
}

export function PartnersTab({
  loading,
  fetchError,
  partners,
  equalization,
  totalPartnerBalance,
  totalDistributed,
  hasPartners,
  editId,
  editForm,
  editSaving,
  editErr,
  expandedTxId,
  loadingTxId,
  partnerTxs,
  onOpenEdit,
  onCancelEdit,
  onSaveEdit,
  onDeletePartner,
  onToggleTxHistory,
  onEditFormChange,
}: PartnersTabProps) {
  return (
    <>
      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <Skeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Toplam Bakiye',    value: fmt(totalPartnerBalance),              color: 'text-brand-light' },
            { label: 'Toplam Dağıtılan', value: fmt(totalDistributed),                 color: 'text-pos-text' },
            { label: 'Eşitleme Gereken', value: fmt(equalization.total_equalization),  color: equalization.total_equalization > 0 ? 'text-warn-text' : 'text-[#94a3b8]' },
          ].map(c => (
            <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className={`text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5 ${c.color}`}>{c.label}</div>
              <div className="text-xl font-black tabular-nums text-[#0f172a] leading-none">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="flex flex-col gap-2"><Skeleton h="h-20" /><Skeleton h="h-20" /></div>}

      {!loading && !hasPartners && !fetchError && (
        <div className="bg-white border border-[#e2e8f0] rounded px-6 py-12 text-center">
          <div className="text-xs text-[#94a3b8]">Henüz ortak eklenmemiş.</div>
        </div>
      )}

      {!loading && hasPartners && (
        <>
          {equalization.baseline_per_unit > 0 && (
            <div className="flex items-start gap-3 bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text">
              <span className="text-base flex-shrink-0 mt-0.5">ℹ</span>
              <div>
                <span className="font-bold">Eşitleme nedir? </span>
                Ortaklar şirkete farklı tutarlarda sermaye koymuş olabilir. Eşitleme, en yüksek birim katkıyı baz alarak diğer ortakların bu seviyeye çıkması için öncelikli dağıtım almasını sağlar.
                {equalization.total_equalization > 0
                  ? <span className="ml-1 font-semibold">{fmt(equalization.total_equalization)} eşitleme yapılana kadar dağıtım orantısız gerçekleşir.</span>
                  : <span className="ml-1 text-pos-text font-semibold">Tüm ortaklar eşit seviyede — normal dağıtıma geçildi.</span>
                }
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {partners.map(p => {
              const b        = p.balance
              const contributed = b?.total_contributed_try ?? 0
              const eqEntry  = equalization.entries.find(e => e.partner_id === p.id)
              const eqTarget = equalization.baseline_per_unit * p.share_ratio
              const eqNeeded = equalization.baseline_per_unit > 0 && eqEntry
                ? Math.max(0, eqTarget - contributed)
                : 0
              const isUnderFunded = eqNeeded > 0.01
              const withdrawable  = eqEntry?.total_payout ?? 0
              const isEditing     = editId === p.id

              return (
                <div key={p.id} className={`bg-white border rounded px-4 py-3 group ${isUnderFunded ? 'border-warn-light' : 'border-[#e2e8f0]'}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-[#0f172a] text-xs">{p.name}</span>
                        {!p.is_active && <span className="text-[10px] bg-[#f1f5f9] text-[#94a3b8] px-1.5 py-0.5 rounded font-semibold">Pasif</span>}
                        {isUnderFunded && <span className="text-[10px] bg-warn-light text-warn-text px-1.5 py-0.5 rounded font-bold">⚠ Eşitleme gerekli</span>}
                        {withdrawable > 0.01 && !isUnderFunded && (
                          <span className="text-[10px] bg-pos-light text-pos-text px-1.5 py-0.5 rounded font-bold">
                            ✓ {fmt(withdrawable)} çekilebilir
                          </span>
                        )}
                      </div>
                      <ShareBar ratio={p.share_ratio} />
                    </div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-right shrink-0">
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Bakiye</div>
                        <div className={`text-xs font-black tabular-nums ${(b?.partner_balance_try ?? 0) > 0 ? 'text-brand' : 'text-[#94a3b8]'}`}>
                          {fmt(b?.partner_balance_try ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dağıtılan</div>
                        <div className="text-xs font-black tabular-nums text-[#334155]">{fmt(b?.total_distributed_try ?? 0)}</div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Sermaye</div>
                        <div className="text-xs font-black tabular-nums text-[#0f172a]">{fmt(contributed)}</div>
                      </div>
                    </div>
                  </div>

                  {isUnderFunded && equalization.baseline_per_unit > 0 && (
                    <div className="mt-3 pt-3 border-t border-warn-light">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-warn-text font-semibold">Eşitleme açığı: {fmt(eqNeeded)}</span>
                        <span className="text-[#94a3b8]">Hedef: {fmt(eqTarget)}</span>
                      </div>
                      <div className="mt-1.5 bg-warn-light rounded-full h-1.5">
                        <div
                          className="bg-warn h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, eqTarget > 0 ? (contributed / eqTarget) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="mt-3 pt-3 border-t border-[#e2e8f0] space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-1">İsim</label>
                          <input
                            className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                            value={editForm.name}
                            onChange={e => onEditFormChange({ ...editForm, name: e.target.value })}
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-1">Pay Oranı (%)</label>
                          <input
                            type="number" min="0.01" max="100" step="0.01"
                            className="w-full border border-[#e2e8f0] rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                            value={editForm.shareRatioPct}
                            onChange={e => onEditFormChange({ ...editForm, shareRatioPct: e.target.value })}
                          />
                        </div>
                      </div>
                      {editErr && <p className="text-xs text-neg">{editErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSaveEdit(p.id)} disabled={editSaving}
                          className="text-xs font-bold px-3 py-1.5 rounded bg-brand-light text-white hover:bg-brand disabled:opacity-50 transition-colors"
                        >
                          {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button onClick={onCancelEdit} className="text-xs font-semibold px-3 py-1.5 rounded border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] transition-colors">
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-[#f1f5f9] flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onOpenEdit(p)} className="text-xs text-[#94a3b8] hover:text-brand-light px-2 py-1 rounded hover:bg-brand-subtle transition-colors">Düzenle</button>
                      <button onClick={() => onToggleTxHistory(p.id)} className="text-xs text-[#94a3b8] hover:text-brand-light px-2 py-1 rounded hover:bg-brand-subtle transition-colors">
                        {expandedTxId === p.id ? 'Geçmişi Gizle ↑' : 'Geçmiş ↓'}
                      </button>
                      <button onClick={() => onDeletePartner(p.id, p.name)} className="text-xs text-[#94a3b8] hover:text-neg px-2 py-1 rounded hover:bg-neg-light transition-colors">Sil</button>
                    </div>
                  )}

                  {expandedTxId === p.id && (
                    <div className="mt-3 pt-3 border-t border-[#e2e8f0]">
                      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">İşlem Geçmişi</div>
                      {loadingTxId === p.id ? (
                        <div className="py-3 text-xs text-[#94a3b8]">Yükleniyor...</div>
                      ) : !partnerTxs[p.id] || partnerTxs[p.id].length === 0 ? (
                        <div className="py-3 text-xs text-[#94a3b8]">Kayıtlı işlem yok.</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {partnerTxs[p.id].map(tx => (
                            <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-[#f1f5f9] last:border-0">
                              <div className="min-w-0">
                                <span className="font-semibold text-[#334155]">{TX_TYPE_LABELS[tx.tx_type] ?? tx.tx_type}</span>
                                {tx.notes && <span className="text-[#94a3b8] ml-1.5">· {tx.notes}</span>}
                                <div className="text-[#94a3b8]">{tx.tx_date?.slice(0, 10)}</div>
                              </div>
                              <span className={`shrink-0 font-black tabular-nums ml-4 ${['loan_out','salary','board_fee','dividend'].includes(tx.tx_type) ? 'text-neg' : 'text-pos-text'}`}>
                                {fmt(tx.amount_try)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {equalization.total_equalization > 0 && (
            <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-warn-text mb-2">Eşitleme Özeti</div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div><span className="text-[#64748b]">Toplam eşitleme gereken: </span><span className="font-bold text-warn-text">{fmt(equalization.total_equalization)}</span></div>
                <div><span className="text-[#64748b]">Baz (birim başına): </span><span className="font-bold text-[#334155]">{fmt(equalization.baseline_per_unit)}</span></div>
              </div>
              <p className="text-xs text-warn-text mt-2 leading-relaxed">
                En yüksek sermaye katkısı birim başına {fmt(equalization.baseline_per_unit)}.
                Altında kalan ortaklar bu tutara ulaşana kadar öncelikli dağıtım alır.
              </p>
            </div>
          )}
        </>
      )}

      {/* Cross-navigation */}
      <NarrativeFooter
        className="pt-2"
        narrative="Ortak durumu sermaye, borç ve dağıtım sekmeleriyle birlikte izleyin."
        links={[
          { label: 'Borç Dilimleri', href: '/dashboard/partners?tab=tranches' },
          { label: 'Kâr Dağıtımı',  href: '/dashboard/partners?tab=distribution' },
          { label: 'Risk Skoru',     href: '/dashboard/partners?tab=risk' },
        ]}
      />
    </>
  )
}
