// Demo Yönetimi card — extracted verbatim from settings/page.tsx. Presentational:
// reads demo state via props and calls the seed/reset handlers. Disabled (and
// shows a notice) when running against production. No hooks → render-testable.
'use client'

import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { MsgBanner } from './MsgBanner'
import type { Msg } from './constants'

interface Props {
  disabled: boolean
  loading:  false | 'seed' | 'reset'
  msg:      Msg | null
  onSeed:   () => void
  onReset:  () => void
}

export function DemoCard({ disabled, loading, msg, onSeed, onReset }: Props) {
  return (
    <FlowraCard>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-sm">Demo Yönetimi</p>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Örnek veri yükle veya sıfırla — müşteriler, proformalar, banka hesapları
          </p>
        </div>

        {disabled ? (
          <div className="text-xs px-3 py-2 rounded border bg-warn-light border-warn-light text-warn-text">
            Canlı ortamda kapalıdır.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {msg && <MsgBanner msg={msg} />}
            <FlowraButton
              variant="secondary"
              size="sm"
              onClick={onSeed}
              loading={loading === 'seed'}
              disabled={loading !== false}
              className="border-[#e8eaef] text-brand bg-brand-subtle hover:bg-brand-subtle"
            >
              {loading === 'seed' ? 'Yükleniyor...' : 'Demo Veri Yükle'}
            </FlowraButton>

            <FlowraButton
              variant="danger"
              size="sm"
              onClick={onReset}
              loading={loading === 'reset'}
              disabled={loading !== false}
            >
              {loading === 'reset' ? 'Sıfırlanıyor...' : 'Sıfırla'}
            </FlowraButton>
          </div>
        )}
      </div>
    </FlowraCard>
  )
}
