# Flowra — ERP & Satış Yönetim Sistemi

## Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Ortam değişkenlerini ayarla

```bash
cp .env.example .env.local
```

`.env.local` dosyasını düzenle:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Veritabanını kur

> ⚠️ **Tek adım. Tek dosya. Başka bir şey yok.**

Supabase Dashboard → SQL Editor → yeni sorgu → dosyayı yapıştır → Çalıştır:

```
supabase/flowra_install.sql        ← KANONİK KURUCU (§1–§10)
```

**Bu dosya her şeyi içerir:** tablolar, indeksler, fonksiyonlar, tetikleyiciler, RLS politikaları, izinler, görevler (tasks), storage bucket.

```sql
-- Sonunda PostgREST schema önbelleğini yenile (flowra_install.sql'de zaten var)
notify pgrst, 'reload schema';
```

> ✅ Boş bir veritabanına güvenle çalışır  
> ✅ Kısmen kurulmuş bir veritabanında tekrar çalıştırılabilir (idempotent)  
> ✅ Migration adımı gerektirmez  
> ✅ Tasks tablosunu içerir (§10)  
> ❌ `schema.sql` diye bir dosya yoktur — kullanma  
> ❌ `supabase/migrations/` diye bir dizin yoktur — kullanma  
> ❌ `install_supabase.sql` — DEPRECATED, tasks tablosunu içermez  
> ❌ `install.sql` — DEPRECATED, psql-only \ir orchestrator

Storage bucket `flowra_install.sql` içinde otomatik oluşturulur — ayrıca oluşturmaya **gerek yoktur**.

Mevcut (kısmi) kurulum için onarım scriptleri:
```
supabase/repair_production.sql     ← Kısmi kurulumları düzeltir
supabase/verify_production.sql     ← Kurulum durumunu doğrular
```

### 4. (Storage bucket — artık gerekli değil)

`flowra_install.sql` logos bucket'ı otomatik oluşturur.
Eskiden gerekli olan "Supabase Dashboard → Storage → New bucket" adımı kaldırıldı.

### 5. Uygulamayı başlat

```bash
npm run dev
```

---

## Proje Yapısı

```
flowra/
├── app/
│   ├── api/                 — API rotaları (force-dynamic)
│   │   ├── fx/              — Döviz kuru (TCMB + DB cache)
│   │   ├── health/          — Sağlık kontrolü
│   │   ├── seed/            — Demo veri
│   │   ├── export/          — Yedek indirme
│   │   ├── import/          — Yedek yükleme
│   │   └── ...
│   ├── dashboard/           — Ana uygulama sayfaları
│   └── public/proforma/     — Anonim proforma paylaşım sayfası
├── components/
│   ├── layout/              — Header, Sidebar, DashboardActions
│   ├── pdf/                 — PDF motoru (jsPDF, LiberationSans)
│   └── ui/                  — Paylaşılan UI bileşenleri
├── lib/
│   ├── fx.ts                — TCMB döviz pipeline
│   ├── safeQuery.ts         — Güvenli Supabase sarmalayıcı
│   ├── services/            — İş mantığı (proforma, satış, stok)
│   └── ...
├── types/                   — TypeScript tip tanımları
├── public/fonts/            — LiberationSans (yerel, CDN yok)
├── supabase/
│   └── flowra_install.sql   ← TEK VE YETKİLİ VERİTABANI DOSYASI
├── middleware.ts             — Edge-safe auth guard
└── README.md
```

---

## API Endpoints

| Endpoint | Method | Açıklama |
|---|---|---|
| `/api/health` | GET | DB + FX sağlık kontrolü |
| `/api/fx` | GET | Güncel döviz kurları (TCMB → DB cache → fallback) |
| `/api/fx/debug` | GET | FX pipeline tanılama |
| `/api/seed` | POST | Demo veri oluştur (sadece boş hesaplar için) |
| `/api/export` | GET | Tüm kullanıcı verisini JSON olarak indir |
| `/api/import` | POST | JSON yedeğini geri yükle |
| `/api/proformas` | GET/POST | Proforma CRUD |
| `/api/convert` | POST | Proformayı satışa dönüştür |
| `/api/customers` | GET/POST/PATCH/DELETE | Müşteri CRUD |
| `/api/products` | GET/POST/PATCH/DELETE | Ürün CRUD |
| `/api/expenses` | GET/POST/DELETE | Gider CRUD |
| `/api/sales/[id]` | DELETE | Satış sil |

---

## Veritabanı

**Tek kaynak:** `supabase/flowra_install.sql`

| Tablo | Açıklama |
|---|---|
| `user_settings` | Firma profili, logo, MERSIS no |
| `customers` | Müşteriler |
| `products` | Ürünler + stok takibi |
| `company_banks` | Banka hesapları |
| `fx_rates` | Döviz kuru önbelleği (global, user_id yok) |
| `interest_rates` | Yıllık faiz oranı geçmişi |
| `proformas` | Proforma faturalar (FX snapshot dahil) |
| `proforma_items` | Proforma kalemleri |
| `sales` | Satışlar |
| `sale_items` | Satış kalemleri |
| `expenses` | Giderler (çoklu döviz, FX snapshot) |
| `stock_movements` | Stok hareket defteri (append-only ledger) |
| `audit_logs` | Mutasyon denetim kaydı |
| `system_logs` | Sistem günlükleri |
| `idempotency_keys` | Çift işlem koruması (24 saat TTL) |
| `jobs` | Arka plan iş kuyruğu |

**RLS:** Tüm kullanıcı tablolarında `auth.uid() = user_id` politikası.  
**FX:** `fx_rates` global tablo — `user_id` yok, açık okuma/yazma.  
**Proforma paylaşımı:** `/public/proforma/[id]` anonim erişime açık (sadece silinmemişler).

---

## Demo Veri / Yedek

Dashboard'dan:

- **🧪 Demo Veri** — Boş hesap için örnek müşteri, ürün, proforma, gider ekler
- **📦 Verileri İndir** — Tüm veriyi JSON olarak indirir
- **📥 Yedek Yükle** — JSON yedeğini geri yükler (mevcut veriyi soft-delete eder)

---

## FX Pipeline

```
1. TCMB today.xml (canlı veri)
   ↓ başarısız → (hafta sonu / tatil / ağ hatası)
2. Son 7 takvim günü TCMB arşivi
   ↓ başarısız →
3. Veritabanı önbelleğindeki en güncel kur
   ↓ başarısız →
4. Sabit fallback — dashboard "veri yok" uyarısı gösterir
```

---

## Kâr Hesaplama

```
Nominal Kâr = TRY Ciro − Toplam Maliyet (COGS)
Reel Kâr    = Nominal Kâr − (Maliyet × Yıllık Faiz % × Gün / 365)
Net Kâr     = Reel Kâr − Toplam Giderler
```

Kur ve faiz oranı satış/proforma oluşturma anında kaydedilir (immutable snapshot).

---

## PDF

- **Font:** LiberationSans (Apache-2 lisansı, yerel — CDN bağımlılığı yok)  
- **Türkçe:** Tüm Türkçe karakterler tam desteklenir  
- **Logo:** Otomatik ölçekleme (maks 44×18 mm), en-boy oranı korunur  
- **Güvenlik:** Maliyet, kâr ve dahili notlar PDF'e hiçbir zaman yansımaz  
- **Hata toleransı:** Logo yüklenemese bile PDF oluşturulur  
