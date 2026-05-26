# Flowra v1.0.0 — Sürüm Notları

**Yayın Tarihi:** Mayıs 2026  
**Sürüm Tipi:** Genel Erişilebilirlik (GA) — İlk Kurumsal Sürüm  
**Commit:** `4f24d49`

---

## Genel Bakış

Flowra v1.0.0, Türk KOBİ'leri için tasarlanmış kurumsal sınıf bir Finansal İşletim Sistemi'dir. Bu sürüm, şirketlerin günlük finansal operasyonlarını, muhasebe doğruluğunu, ortak sermaye yönetimini ve stratejik karar desteğini tek bir entegre platformda yönetmelerini sağlar.

---

## Yeni Özellikler

### Muhasebe Altyapısı
- **Çift Taraflı Kayıt Sistemi** — Her işlem için otomatik yevmiye kaydı (DR = CR garantisi)
- **Büyük Defter (General Ledger)** — TMUS/MSUGT uyumlu hesap planı (25 hesap, 100–780)
- **Mizan (Trial Balance)** — Anlık denge kontrolü, dönem kapanışı guard'ı
- **GL Paralel Mod** — shadow → parallel → gl_primary geçiş yolu
- **Yevmiye Fiş Numaralandırma** — JE-YYYY-NNNNN otomatik format

### PCLE Ortak Sermaye & Borç Motoru
- **6 Sekmeli Ortak Merkezi** — Pozisyon, Defter, Trancheler, Geri Ödeme, Dağıtım, Risk
- **İki Fazlı Normalleştirilmiş Waterfall** — Hakkaniyet esaslı geri ödeme
- **Türkiye Uyum Kontrolleri** — TTK 394/509/519/588, GVK 94, VUK/KVK 13
- **6 Boyutlu Risk Haritası** — A-F harf notu, per-partner risk skoru

### CEO Komuta Merkezi
- **Durum Motoru (Situation Engine)** — 5 boyutlu ağırlıklı skor (0–100)
- **Uyarı Motoru (Alert Engine)** — 13 konfigüre edilebilir kural, kritiklik sıralı
- **12 Aylık Tahmin** — 3 senaryo (baz/iyimser +%15/kötümser -%20)
- **Karar Uyarıları** — Anında aksiyon linkleri

### CFO Merkezi
- **Dönem Kapanış İş Akışı** — 8-madde kontrol listesi (5 zorunlu guard)
- **Yevmiye Defteri** — Tüm kayıtlar, kaynak takibi, immutable
- **Denetim Izi** — SHA-256 hash zinciri, tamper-evident
- **Muhasebe Doğruluk Kontrolleri** — Anlık 6-kontrol doğrulama

### Raporlama
- **Branded PDF Raporlama** — Gelir Tablosu, Bilanço, Nakit Akış, Yönetici Özeti
- **CFO Paketi** — Tüm raporlar tek PDF'te
- **KDV Özeti** — Beyanname hazırlık raporu
- **Kurumlar Vergisi Tahmini** — YTD matrah hesabı

### Operasyonlar
- **OPS Komuta Merkezi** — Günlük satış, overdue tahsilat, kritik stok, açık iş akışları
- **Proforma Yaşam Döngüsü** — Taslak → Gönderildi → Onaylandı → Satışa Dönüştürüldü
- **FIFO Stok Yönetimi** — Lot bazlı, maliyet immutable
- **Satın Alma Siparişleri** — Sipariş → Alındı → Finalize

### Yönetişim
- **Çoklu Şirket** — Cookie-based switcher, tam izolasyon
- **İş Akışı Onayı** — Masraf eşiği (varsayılan ₺50.000), 48 saat zaman aşımı
- **Mutabakat Motoru** — Bilanço, hazine, kâr mutabakatı, imzalama
- **Yönetişim Snapshot** — Aylık otomatik tablo

### AI & İstatistik
- **İstatistiksel Anomali Tespiti** — Gelir/gider anomalisi, kopya gider detector
- **AI Durum Özeti** — Anthropic Claude API (opsiyonel), kural-bazlı fallback
- **Insights Dashboard** — 3 sekme: gelir anomalisi, gider analizi, kopya detector

---

## Teknik Belgeler

- 1.575 otomatik test (55 test dosyası, Vitest)
- 0 TypeScript hatası
- 54 Next.js route (statik + dinamik)
- 38+ Supabase tablosu
- 17 Supabase RPC
- 4 Vercel Cron görevi

---

## Bilinen Sınırlamalar

| Konu | Durum | Etki |
|------|-------|------|
| GL Primary geçişi | Manuel onay gerektirir | Yok (parallel mod çalışıyor) |
| Negatif envanter göstergesi | Kozmetik, COGS/stok lot dengesizliği | Çok düşük |
| Holding katmanı (çoklu şirket konsolidasyonu) | v2.0'da planlanıyor | Yok |
| E-posta bildirimleri | Resend API key gerektirir | Yok (özellik opsiyonel) |
| AI özetler | Anthropic API key gerektirir | Yok (kural-bazlı fallback aktif) |

---

## Güvenlik

- Row Level Security (RLS) tüm tablolarda
- Her API route: auth + role guard
- Kilitli dönemler: middleware tüm yazma işlemlerini engeller
- SHA-256 tamper-evident denetim hash zinciri
- Hassas keys (SERVICE_ROLE_KEY) asla client bundle'a girmez

---

## Yükseltme Notları

Mevcut kurulumdan yükseltme için `FLOWRA_PRODUCTION_UPGRADE.sql` kullanın.  
Bu script idempotent olup güvenle tekrar çalıştırılabilir.

---

## Sonraki Sürüm (v2.0 Planı)

- GL Primary mod tam otomasyonu
- Unified Partner Loan Account (tranches + schedules konsolidasyonu)
- Holding katmanı (çoklu şirket konsolidasyonu)
- E-posta bildirim şablonları
- Mobil PWA push bildirimleri
- API erişimi (external integrations)

---

*Flowra v1.0.0 — Mayıs 2026*
