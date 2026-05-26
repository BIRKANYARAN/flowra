# Flowra v1.0 — Kurumsal Sürüm Paketi

**Sürüm:** 1.0.0  
**Tarih:** Mayıs 2026  
**Platform:** Next.js 14 + Supabase + Vercel  

---

## Bu Pakete Genel Bakış

Bu paket Flowra v1.0 kurumsal sürümünün eksiksiz teslimat paketidir.  
Kurulum, yapılandırma, kullanım ve yönetim için gereken tüm belgeler burada bulunmaktadır.

---

## Paket İçeriği

### 📁 `/sql` — Veritabanı Paketleri

| Dosya | Açıklama |
|-------|----------|
| `FLOWRA_PRODUCTION_INSTALL.sql` | **Yeni kurulum için.** Tüm tabloları, fonksiyonları, tetikleyicileri, politikaları oluşturur (2.859 satır, idempotent) |
| `FLOWRA_PRODUCTION_UPGRADE.sql` | **Mevcut kurulum güncellemesi için.** Güvenli ve idempotent. Tüm 6 göç script'ini kapsar (4.144 satır) |

### 📁 `/pdfs` — Müşteriye Hazır PDF Belgeler

#### Türkçe Belgeler
| Dosya | İçerik |
|-------|--------|
| `KURULUM_KILAVUZU.pdf` | Adım adım kurulum kılavuzu |
| `GUNCELLEME_KILAVUZU.pdf` | Güncelleme ve GL mod yükseltme rehberi |
| `SORUN_GIDERME_KILAVUZU.pdf` | 6 kategoride sorun giderme |
| `CANLIYA_ALMA_KILAVUZU.pdf` | Üretim ortamına geçiş kontrol listesi |
| `SURUM_NOTLARI.pdf` | v1.0 sürüm notları ve değişiklik günlüğü |
| `SISTEM_MIMARISI.pdf` | Teknik mimari belgesi |
| `SISTEM_YONETICI_KILAVUZU.pdf` | Sistem yöneticisi el kitabı |
| `KULLANICI_KILAVUZU.pdf` | Son kullanıcı kılavuzu (tüm modüller) |
| `CFO_MUHASEBE_EL_KITABI.pdf` | CFO ve muhasebeci el kitabı |
| `ORTAKLAR_VE_YONETISIM_REHBERI.pdf` | Ortak finansmanı ve yönetişim rehberi |

#### İngilizce Teknik Belgeler
| Dosya | İçerik |
|-------|--------|
| `README.pdf` | Bu dökümanın PDF versiyonu |
| `MASTER_INSTALL.md` / `.pdf` | Fresh installation guide (8 steps) |
| `MASTER_UPGRADE.md` / `.pdf` | Upgrade guide with GL mode migration |
| `PRODUCTION_DEPLOYMENT.pdf` | Vercel deployment guide |
| `TROUBLESHOOTING.pdf` | Troubleshooting guide (6 categories) |
| `ADMIN_GUIDE.pdf` | Administrator manual |
| `USER_GUIDE.pdf` | End-user guide |
| `CFO_HANDBOOK.pdf` | CFO & accounting handbook |
| `RELEASE_CERTIFICATION.pdf` | Release certification report |

### 📄 Kök Seviye Belgeler

| Dosya | Açıklama |
|-------|----------|
| `.env.example` | Tüm 14 ortam değişkeni belgelenmiş ([GEREKLİ]/[opsiyonel]) |
| `RELEASE_NOTES.md` | Sürüm notları özeti |

---

## Hızlı Başlangıç

### Yeni Kurulum (3 adım)

1. Supabase'de yeni proje oluşturun
2. `sql/FLOWRA_PRODUCTION_INSTALL.sql` dosyasını SQL Editor'da çalıştırın
3. Vercel'e deploy edin (`.env.example` dosyasındaki değişkenleri yapılandırın)

Ayrıntılı talimatlar için: `pdfs/KURULUM_KILAVUZU.pdf`

### Mevcut Kurulum Güncellemesi

1. `sql/FLOWRA_PRODUCTION_UPGRADE.sql` dosyasını SQL Editor'da çalıştırın
2. Vercel'de yeniden deploy edin

Ayrıntılı talimatlar için: `pdfs/GUNCELLEME_KILAVUZU.pdf`

---

## Sistem Gereksinimleri

| Bileşen | Gereksinim |
|---------|-----------|
| Node.js | 24.x (LTS) |
| Next.js | 14.x |
| Supabase | Postgres 15+ |
| Deployment | Vercel (önerilen) veya Node.js 24 sunucu |

---

## Temel Özellikler v1.0

- ✅ **Çift Taraflı Muhasebe** — Tam GL, yevmiye kaydı, mizan
- ✅ **PCLE Ortak Motoru** — 6 sekme, iki fazlı waterfall, TTK/GVK uyumu
- ✅ **CEO Komuta Merkezi** — Durum motoru, uyarı motoru, 12 aylık tahmin
- ✅ **CFO Merkezi** — Dönem kapanışı, yevmiye defteri, denetim izi
- ✅ **İş Akışı Motoru** — Masraf onayı, dönem kapanışı kontrol listesi
- ✅ **Branded PDF Raporlama** — Gelir tablosu, bilanço, nakit akış, CFO paketi
- ✅ **GL Paralel Doğrulama** — shadow → parallel → gl_primary
- ✅ **Çoklu Şirket** — Cookie-based company switcher
- ✅ **SHA-256 Denetim Hash Zinciri** — Tamper-evident audit trail
- ✅ **1.575 Otomatik Test** — Vitest, sıfır veritabanı bağımlılığı
- ✅ **Türkiye Uyumu** — TTK 394/509/519/588, GVK 94, KDV, KV

---

## Destek

**E-posta:** support@flowra.app  
**Acil (üretim):** Konu satırına `[ACİL]` yazın

---

*Flowra v1.0.0 Kurumsal Teslimat Paketi — Mayıs 2026*  
*© 2026 Flowra. Tüm hakları saklıdır.*
