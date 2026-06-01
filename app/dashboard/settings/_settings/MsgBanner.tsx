// Shared inline status banner — extracted verbatim from settings/page.tsx.
import type { Msg } from './constants'

export function MsgBanner({ msg }: { msg: Msg }) {
  const styles = {
    success: 'bg-pos-light border-pos-light text-pos-text',
    error:   'bg-neg-light border-neg-light text-neg-text',
    info:    'bg-warn-light border-warn-light text-warn-text',
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ' }
  return (
    <div className={`text-sm px-3 py-2.5 rounded border flex items-center gap-2 ${styles[msg.kind]}`}>
      <span>{icons[msg.kind]}</span>
      {msg.text}
    </div>
  )
}
