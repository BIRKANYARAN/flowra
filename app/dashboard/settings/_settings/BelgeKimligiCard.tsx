// Belge Kimliği (document-identity / branding) card — extracted verbatim from
// settings/page.tsx. Purely presentational: it reads the four branding state
// values + their setters via props and triggers the shared profile save (the
// branding is persisted together with the company profile, so there is no
// independent save here). No hooks/fetch → directly render-testable.
'use client'

import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { IL, LAB, BRAND_PALETTES, DOCUMENT_STYLES } from './constants'

interface Props {
  brandColor:            string
  setBrandColor:         (id: string) => void
  documentStyle:         string
  setDocumentStyle:      (id: string) => void
  defaultPreparerName:   string
  setDefaultPreparerName:  (v: string) => void
  defaultPreparerTitle:  string
  setDefaultPreparerTitle: (v: string) => void
  saving:                boolean
  onSave:                () => void
}

export function BelgeKimligiCard({
  brandColor, setBrandColor, documentStyle, setDocumentStyle,
  defaultPreparerName, setDefaultPreparerName,
  defaultPreparerTitle, setDefaultPreparerTitle, saving, onSave,
}: Props) {
  return (
    <FlowraCard>
      <p className="font-bold text-sm border-b border-[#e2e8f0] pb-2 mb-4">Belge Kimliği</p>
      <p className="text-[10px] text-[#94a3b8] -mt-1 mb-4">
        Oluşturulan PDF&apos;lerin renk paleti, düzen stili ve varsayılan düzenleyici bilgisi
      </p>

      <div className="grid grid-cols-2 gap-6">
        {/* LEFT: Palet + Stil */}
        <div className="space-y-4">

          {/* Renk Paleti */}
          <div>
            <p className={LAB}>Belge Renk Paleti</p>
            <div className="flex gap-2 flex-wrap">
              {BRAND_PALETTES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBrandColor(p.id)}
                  title={p.label}
                  className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-colors select-none ${
                    brandColor === p.id
                      ? 'border-[#334155] bg-[#f8fafc]'
                      : 'border-[#e2e8f0] hover:border-[#cbd5e1] bg-white'
                  }`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: p.swatch }}
                  />
                  <span className={brandColor === p.id ? 'text-[#1e293b] font-semibold' : 'text-[#64748b]'}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Belge Stili */}
          <div>
            <p className={LAB}>Belge Stili</p>
            <div className="grid grid-cols-2 gap-2">
              {DOCUMENT_STYLES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDocumentStyle(s.id)}
                  className={`text-left px-3 py-2.5 rounded border transition-colors select-none ${
                    documentStyle === s.id
                      ? 'border-[#334155] bg-[#f8fafc]'
                      : 'border-[#e2e8f0] hover:border-[#cbd5e1] bg-white'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-0.5 ${documentStyle === s.id ? 'text-[#1e293b]' : 'text-[#334155]'}`}>
                    {s.label}
                  </div>
                  <div className="text-[10px] text-[#94a3b8]">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT: Varsayılan Düzenleyici */}
        <div className="space-y-3">
          <div>
            <p className={LAB}>Varsayılan Düzenleyici</p>
            <p className="text-[10px] text-[#94a3b8] mb-2">
              Proforma oluşturulurken otomatik doldurulur — PDF imza alanında gösterilir
            </p>
            <div className="space-y-2.5">
              <input
                className={IL}
                placeholder="Ahmet Yılmaz"
                maxLength={100}
                value={defaultPreparerName}
                onChange={e => setDefaultPreparerName(e.target.value)}
              />
              <input
                className={IL}
                placeholder="Satış Direktörü"
                maxLength={100}
                value={defaultPreparerTitle}
                onChange={e => setDefaultPreparerTitle(e.target.value)}
              />
            </div>
          </div>

          {/* Preview chip */}
          <div className="mt-2 p-3 rounded border border-[#e2e8f0] bg-[#f8fafc]">
            <p className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
              PDF Önizleme
            </p>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-8 rounded-sm flex-shrink-0"
                style={{ backgroundColor: BRAND_PALETTES.find(p => p.id === brandColor)?.swatch || '#1f2937' }}
              />
              <div>
                <div className="text-xs font-semibold text-[#1e293b]">
                  {DOCUMENT_STYLES.find(s => s.id === documentStyle)?.label || 'Kurumsal'}
                </div>
                <div className="text-[10px] text-[#64748b]">
                  {BRAND_PALETTES.find(p => p.id === brandColor)?.label || 'Antrasit'} palet
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-[#e2e8f0] flex justify-end">
        <FlowraButton
          variant="primary"
          onClick={onSave}
          disabled={saving}
          loading={saving}
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </FlowraButton>
      </div>
    </FlowraCard>
  )
}
