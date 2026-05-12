/* global React, Btn, Input, Icon */
const { useState } = React;

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('demo@flowra.app');
  const [password, setPassword] = useState('••••••••');
  const [companyName, setCompanyName] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onLogin({
      name: companyName || 'Mehmet Demir',
      email,
      initials: 'MD',
      role: 'YNT',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 relative overflow-hidden">
      {/* decorative gradient blobs */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-violet-200/40 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-blue-200/40 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative">
        {/* logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 via-violet-500 to-blue-500 flex items-center justify-center shadow-lg mb-3">
            <span className="text-white font-black text-2xl leading-none">F</span>
          </div>
          <span className="font-black text-2xl text-gray-900 tracking-tight">flowra</span>
          <span className="text-xs text-gray-500 mt-1">küçük işletmenin finansal akışı</span>
        </div>

        {/* card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="flex gap-1 mb-6 bg-gray-50 p-1 rounded-xl">
            <button
              onClick={() => setMode('login')}
              className={'flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ' + (mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >Giriş Yap</button>
            <button
              onClick={() => setMode('register')}
              className={'flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ' + (mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >Hesap Oluştur</button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <Input label="Şirket Adı" placeholder="Demir İnşaat A.Ş." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            )}
            <Input label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} prefix={<Icon name="mail" size={14} />} />
            <Input label="Şifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} prefix={<Icon name="lock" size={14} />} />

            {mode === 'login' && (
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-gray-500 cursor-pointer">
                  <input type="checkbox" className="accent-violet-600" defaultChecked /> Beni hatırla
                </label>
                <a href="#" className="text-violet-600 font-semibold hover:text-violet-700">Şifremi unuttum</a>
              </div>
            )}

            <Btn type="submit" variant="primary" size="lg" className="w-full">
              {mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
            </Btn>
          </form>

          <div className="text-center mt-6 text-xs text-gray-400">
            Hesap oluşturarak <a href="#" className="text-violet-600 font-semibold">Kullanım Şartları</a>'nı kabul etmiş olursunuz.
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">© 2026 Flowra · Tüm hakları saklıdır</p>
      </div>
    </div>
  );
}

window.Auth = Auth;
