# Flowra Kullanıcı Kılavuzu

Flowra; satış, gider, stok, cari ve finansal raporlamayı tek panelde toplayan bir
KOBİ ERP/muhasebe uygulamasıdır. Tüm veriler şirketinize özeldir (RLS ile izole).

## Giriş ve gezinme
- Sol menü (Sidebar) ana bölümlere, üstteki sekme çubuğu o bölümün alt sayfalarına
  götürür. Aktif sayfa kalın/çizgili gösterilir ve ekran okuyucuya `aria-current`
  ile bildirilir; klavye ile `Tab` tuşunda odak halkası görünür.
- Mobilde alt navigasyon çubuğu (MobileBottomNav) kullanılır.

## Ana bölümler
- **Satışlar / Proformalar:** Proforma oluşturun, onaylanınca **Satışa Dönüştür**
  butonuyla stok düşümü + GL kaydı tek atomik işlemde yapılır.
- **Giderler:** Gider girin; kategori "indirilebilir/indirilemez" (KKEG) ayrımını
  belirler — bu ayrım kurumlar vergisi matrahını etkiler.
- **Stoklar:** FIFO maliyetli stok; hareket bazlı stok sorgusu (anlık/geçmiş/değer).
- **Cariler/Müşteriler & Tahsilat:** Alacak yaşlandırma, tahsilat takibi.
- **Ortaklar (Partners):** Sermaye hesabı, ortak kredileri (borç dilimleri),
  huzur hakkı, kâr dağıtımı/temettü (TTK 509/519 uyumlu).
- **Planlama:** Bütçe, senaryo karşılaştırma, nakit projeksiyon, başabaş.
- **Finans/CFO/Raporlar:** P&L, Bilanço, Nakit Akışı, Mizan, CFO paneli, vergi.
- **Yönetişim (Governance):** Kararlar, iş akışları, denetim hazırlığı, sertifikalı
  dışa aktarma.

## Sık işlemler
- **Proformayı satışa çevirme:** Proforma → Satışa Dönüştür → idempotency anahtarı
  otomatik; yalnızca kendi şirketinizin proforması dönüştürülebilir.
- **Temettü beyanı:** Ortaklar → Kâr Dağıtımı. Net kâr yoksa veya beyan net geliri
  aşıyorsa ya da yasal yedek (TTK 519) ayrılmadıysa sistem işlemi **engeller** ve
  gerekçeyi gösterir.
- **Belge yükleme:** Logo/belge yüklerken yalnızca güvenli görsel türleri kabul
  edilir; betik içeren SVG güvenlik nedeniyle reddedilir.

## İpuçları
- Tutarlar TL bazında saklanır; döviz girişleri kayıt anındaki kurla TL'ye çevrilir.
- "Sertifikalı dışa aktarma" SHA-256 parmak izi taşır (içerik bütünlüğü kontrolü).
