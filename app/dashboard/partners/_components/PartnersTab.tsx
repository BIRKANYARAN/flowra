'use client'

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
            { label: 'Toplam Bakiye',    value: fmt(totalPartnerBalance),              color: 'text-primary-600' },
            { label: 'Toplam Dağıtılan', value: fmt(totalDistributed),                 color: 'text-emerald-600' },
            { label: 'Eşitleme Gereken', value: fmt(equalization.total_equalization),  color: equalization.total_equalization > 0 ? 'text-amber-600' : 'text-gray-400' },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.color}`}>{c.label}</div>
              <div className="text-2xl font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="flex flex-col gap-2"><Skeleton h="h-20" /><Skeleton h="h-20" /></div>}

      {!loading && !hasPartners && !fetchError && (
        <div className="bg-white border border-gray-100 rounded-xl px-6 py-12 text-center">
          <div className="text-3xl mb-3">🤝</div>
          <div className="text-sm font-semibold text-gray-500">Henüz ortak eklenmemiş</div>
        </div>
      )}

      {!loading && hasPartners && (
        <>
          {equalization.baseline_per_unit > 0 && (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
              <span className="text-base flex-shrink-0 mt-0.5">ℹ</span>
              <div>
                <span className="font-bold">Eşitleme nedir? </span>
                Ortaklar şirkete farklı tutarlarda sermaye koymuş olabilir. Eşitleme, en yüksek birim katkıyı baz alarak diğer ortakların bu seviyeye çıkması için öncelikli dağıtım almasını sağlar.
                {equalization.total_equalization > 0
                  ? <span className="ml-1 font-semibold">{fmt(equalization.total_equalization)} eşitleme yapılana kadar dağıtım orantısız gerçekleşir.</span>
                  : <span className="ml-1 text-emerald-600 font-semibold">Tüm ortaklar eşit seviyede — normal dağıtıma geçildi.</span>
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
                <div key={p.id} className={`bg-white border rounded-xl px-5 py-4 group ${isUnderFunded ? 'border-amber-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{p.name}</span>
                        {!p.is_active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-lg font-semibold">Pasif</span>}
                        {isUnderFunded && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">⚠ Eşitleme gerekli</span>}
                        {withdrawable > 0.01 && !isUnderFunded && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                            ✓ {fmt(withdrawable)} çekilebilir
                          </span>
                        )}
                      </div>
                      <ShareBar ratio={p.share_ratio} />
                    </div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-right shrink-0">
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Bakiye</div>
                        <div className={`text-sm font-black tabular-nums ${(b?.partner_balance_try ?? 0) > 0 ? 'text-primary-700' : 'text-gray-400'}`}>
                          {fmt(b?.partner_balance_try ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Dağıtılan</div>
                        <div className="text-sm font-black tabular-nums text-gray-700">{fmt(b?.total_distributed_try ?? 0)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Sermaye</div>
                        <div className="text-sm font-black tabular-nums text-gray-900">{fmt(contributed)}</div>
                      </div>
                    </div>
                  </div>

                  {isUnderFunded && equalization.baseline_per_unit > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-700 font-semibold">Eşitleme açığı: {fmt(eqNeeded)}</span>
                        <span className="text-gray-400">Hedef: {fmt(eqTarget)}</span>
                      </div>
                      <div className="mt-1.5 bg-amber-50 rounded-full h-1.5">
                        <div
                          className="bg-amber-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, eqTarget > 0 ? (contributed / eqTarget) * 100 : 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">İsim</label>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                            value={editForm.name}
                            onChange={e => onEditFormChange({ ...editForm, name: e.target.value })}
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Pay Oranı (%)</label>
                          <input
                            type="number" min="0.01" max="100" step="0.01"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                            value={editForm.shareRatioPct}
                            onChange={e => onEditFormChange({ ...editForm, shareRatioPct: e.target.value })}
                          />
                        </div>
                      </div>
                      {editErr && <p className="text-xs text-red-600">{editErr}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSaveEdit(p.id)} disabled={editSaving}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                          {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button onClick={onCancelEdit} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-gray-50 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onOpenEdit(p)} className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">Düzenle</button>
                      <button onClick={() => onToggleTxHistory(p.id)} className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">
                        {expandedTxId === p.id ? 'Geçmişi Gizle ↑' : 'Geçmiş ↓'}
                      </button>
                      <button onClick={() => onDeletePartner(p.id, p.name)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Sil</button>
                    </div>
                  )}

                  {expandedTxId === p.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">İşlem Geçmişi</div>
                      {loadingTxId === p.id ? (
                        <div className="py-3 text-xs text-gray-400">Yükleniyor...</div>
                      ) : !partnerTxs[p.id] || partnerTxs[p.id].length === 0 ? (
                        <div className="py-3 text-xs text-gray-400">Kayıtlı işlem yok.</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {partnerTxs[p.id].map(tx => (
                            <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                              <div className="min-w-0">
                                <span className="font-semibold text-gray-700">{TX_TYPE_LABELS[tx.tx_type] ?? tx.tx_type}</span>
                                {tx.notes && <span className="text-gray-400 ml-1.5">· {tx.notes}</span>}
                                <div className="text-gray-400">{tx.tx_date?.slice(0, 10)}</div>
                              </div>
                              <span className={`shrink-0 font-black tabular-nums ml-4 ${['loan_out','salary','board_fee','dividend'].includes(tx.tx_type) ? 'text-red-600' : 'text-emerald-700'}`}>
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
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Eşitleme Özeti</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Toplam eşitleme gereken: </span><span className="font-bold text-amber-700">{fmt(equalization.total_equalization)}</span></div>
                <div><span className="text-gray-500">Baz (birim başına): </span><span className="font-bold text-gray-700">{fmt(equalization.baseline_per_unit)}</span></div>
              </div>
              <p className="text-xs text-amber-600 mt-2 leading-relaxed">
                En yüksek sermaye katkısı birim başına {fmt(equalization.baseline_per_unit)}.
                Altında kalan ortaklar bu tutara ulaşana kadar öncelikli dağıtım alır.
              </p>
            </div>
          )}
        </>
      )}
    </>
  )
}
