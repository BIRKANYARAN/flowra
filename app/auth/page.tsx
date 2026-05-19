'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/hooks/useSupabase'

type Mode = 'login' | 'register'

const IL  = 'w-full border border-[#e2e8f0] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white'
const LAB = 'block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5'

export default function AuthPage() {
  const supabase = useSupabase()
  const router   = useRouter()

  const [mode,       setMode]       = useState<Mode>('login')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [phone,      setPhone]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')

  async function handle() {
    if (!email.trim() || !password) { setError('E-posta ve şifre zorunludur'); return }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return }
    if (mode === 'register' && !firstName.trim()) { setError('Ad zorunludur'); return }

    setError(''); setSuccess(''); setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setError(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı' : error.message)
        setLoading(false); return
      }
      router.refresh()
      router.push('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name:  lastName.trim(),
            phone:      phone.trim() || null,
          },
        },
      })
      if (error) { setError(error.message); setLoading(false); return }
      setSuccess('Kayıt başarılı! E-postanızı onaylayın.')
      setMode('login')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded border border-[#e2e8f0] shadow-sm p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded bg-primary-600 flex items-center justify-center">
            <span className="text-white font-black text-sm">F</span>
          </div>
          <div>
            <div className="font-black text-[#0f172a]">Flowra</div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">ERP Sistemi</div>
          </div>
        </div>

        <h2 className="text-base font-bold text-[#0f172a] mb-6">
          {mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
        </h2>

        <div className="space-y-4">
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LAB}>Ad *</label>
                <input className={IL} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ali" />
              </div>
              <div>
                <label className={LAB}>Soyad</label>
                <input className={IL} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Yılmaz" />
              </div>
            </div>
          )}

          <div>
            <label className={LAB}>E-posta</label>
            <input type="email" className={IL} value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              placeholder="ornek@firma.com" />
          </div>

          <div>
            <label className={LAB}>Şifre</label>
            <input type="password" className={IL} value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()}
              placeholder="••••••••" />
          </div>

          {mode === 'register' && (
            <div>
              <label className={LAB}>Telefon (opsiyonel)</label>
              <input className={IL} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+90 500 000 00 00" />
            </div>
          )}

          {error   && <div className="text-sm text-neg bg-neg-light border border-neg-light rounded px-3 py-2">{error}</div>}
          {success && <div className="text-sm text-pos-text bg-pos-light border border-pos-light rounded px-3 py-2">{success}</div>}

          <button onClick={handle} disabled={loading}
            className="w-full bg-primary-600 text-white py-2.5 rounded text-sm font-bold hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {loading ? 'Lütfen bekleyin...' : mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>

          <p className="text-center text-sm text-gray-500">
            {mode === 'login' ? 'Hesabın yok mu?' : 'Zaten hesabın var mı?'}{' '}
            <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}
              className="text-primary-600 font-semibold hover:underline">
              {mode === 'login' ? 'Kayıt Ol' : 'Giriş Yap'}
            </button>
          </p>
        </div>
      </div>
    </main>
  )
}
