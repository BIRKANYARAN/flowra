// GL Araçları + Finansal Raporlar — static navigation card grid. Extracted
// verbatim from CFOTab.tsx. Zero props (hardcoded links).
import Link from 'next/link'

export function GlToolsAndReports() {
  return (
    <>
      {/* GL Tools */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#e8eaef]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">GL Araçları</span>
        </div>
        <div className="grid grid-cols-5">
          {[
            { href: '/dashboard/cfo/trial-balance',        title: 'Mizan',              desc: 'Hesap kodları ve bakiyeler',        tag: 'TB' },
            { href: '/dashboard/cfo/period-close',         title: 'Dönem Kapanışı',     desc: 'Kapat ve kilitle',                  tag: 'PC' },
            { href: '/dashboard/cfo/journal-entries',      title: 'Journal',            desc: 'Çift taraflı muhasebe denetim izi', tag: 'JE' },
            { href: '/dashboard/cfo/reconciliation',       title: 'GL Mutabakat',       desc: 'GL vs operasyonel tablo',           tag: 'RC' },
            { href: '/dashboard/cfo/bank-reconciliation',  title: 'Banka Mutabakat',    desc: 'Banka ekstresi eşleştirme',         tag: 'BK' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[0.65rem] font-black text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 rounded tabular-nums">{item.tag}</span>
                <span className="text-xs font-bold text-[#0f172a]">{item.title}</span>
              </div>
              <div className="text-[0.65rem] text-[#94a3b8]">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Financial Reports */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#e8eaef]">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Finansal Raporlar</span>
        </div>
        <div className="grid grid-cols-4">
          {[
            { href: '/dashboard/reports/income-statement', title: 'Gelir Tablosu',      desc: 'P&L — Brüt kâr, net kâr' },
            { href: '/dashboard/reports/balance-sheet',    title: 'Bilanço',            desc: 'Aktif = Pasif + Özkaynak' },
            { href: '/dashboard/reports/cash-flow',        title: 'Nakit Akışı',        desc: 'Faaliyet / Yatırım / Finansman' },
            { href: '/dashboard/reports/executive-summary',title: 'Yönetici Özeti',     desc: '1 sayfa PDF — CEO için' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="text-xs font-bold text-[#0f172a] mb-0.5">{item.title}</div>
              <div className="text-[0.65rem] text-[#94a3b8]">{item.desc}</div>
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-3 border-t border-[#f1f5f9]">
          {[
            { href: '/dashboard/cfo/tax/kdv',       title: 'KDV Özeti',          desc: 'Hesaplanan − İndirilecek' },
            { href: '/dashboard/cfo/tax/corporate', title: 'Kurumlar Vergisi',   desc: 'Geçici vergi takvimi' },
            { href: '/dashboard/insights',           title: 'AI Analizler',       desc: 'Anomali ve kopya gider tespiti' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              className="px-4 py-3 hover:bg-[#f8fafc] transition-colors">
              <div className="text-xs font-bold text-[#0f172a] mb-0.5">{item.title}</div>
              <div className="text-[0.65rem] text-[#94a3b8]">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
