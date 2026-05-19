# Flowra — Supabase Temiz Kurulum Rehberi

## ⚠️ RİSK UYARISI — OKUMADAN GEÇMEYİN

```
FLOWRA_FULL_INSTALL.sql bir CLEAN INSTALL dosyasıdır.
Mevcut bir veritabanında çalıştırırsanız:
  ✅ Var olan tablolar korunur (IF NOT EXISTS)
  ✅ Var olan veriler korunur (hiç TRUNCATE, DROP TABLE yok)
  ✅ Var olan RLS politikaları DROP POLICY IF EXISTS ile güncellenir
  ⚠️ payment_status TEXT → ENUM dönüşümü yapar (mevcut geçersiz değerler 'pending'e çekilir)
```

**Gerçek sıfırlama (veri silme) istiyorsanız aşağıdaki "Manuel Sıfırlama" bölümünü okuyun.**

---

## 1. Temiz Veritabanına Kurulum (Önerilen)

### Gereksinimler
- Yeni Supabase projesi (sıfır tablo)
- SQL Editor erişimi

### Adımlar

```
1. Supabase Dashboard → SQL Editor → New Query
2. supabase/FLOWRA_FULL_INSTALL.sql dosyasının tamamını yapıştır
3. "Run" butonuna bas
4. Tamamlandığında schema_verify.sql'i çalıştır
5. Tüm satırlar ✅ gösteriyorsa kurulum tamam
```

### Doğrulama

```sql
-- Ayrı bir SQL Editor query olarak çalıştır:
\i supabase/schema_verify.sql
-- veya schema_verify.sql içeriğini yapıştır
```

Beklenen sonuç: 40 tablo (36 + workflow_instances, workflow_instance_items, governance_reports, governance_signoffs), 15 fonksiyon, 5 trigger, 3 view — tümü ✅

---

## 2. Dosya Haritası — Hangi SQL Ne İşe Yarar?

| Dosya | Açıklama | Ne zaman kullanılır |
|-------|----------|---------------------|
| `FLOWRA_FULL_INSTALL.sql` | **Temiz kurulum** — faz 1-9 + workflow + governance birleştirilmiş | Boş Supabase projesi |
| `flowra_FULL_MIGRATION.sql` | **Toplu migration** — faz 1-9 + workflow + governance (M+N sections) | Mevcut üretim veritabanı |
| `phase9_workflow_governance_patch.sql` | **Bağımsız patch** — yalnızca workflow + governance tabloları | MIGRATION çalıştırıldıysa ancak patch uygulanmadıysa |
| `flowra_install.sql` | Temel şema (orijinal, 619 satır) | Yalnızca baz tablo kurulumu |
| `repair_production.sql` | Sütun eklemeleri, RPC yamalar, RLS düzeltmeleri | Prodüksiyon acil tamir |
| `supabase/archive/flowra_phase*.sql` | Artımlı faz dosyaları — arşivlendi | Referans / tarih amaçlı |

**Önemli:** `supabase/archive/` altındaki phase dosyaları artık standalone değil —
`FLOWRA_FULL_INSTALL.sql` ve `flowra_FULL_MIGRATION.sql` içeriklerini kendi bünyesinde barındırıyor.

---

## 3. Mevcut Veritabanını Güncelleme (Production Repair)

Mevcut Supabase projesini güncellemek için:

```
1. flowra_FULL_MIGRATION.sql → çalıştır (faz 1-9 + workflow + governance hepsini kapsar, idempotent)
2. schema_verify.sql → doğrula
```

Eğer daha önce MIGRATION çalıştırdıysanız ama workflow/governance tabloları eksikse:

```
phase9_workflow_governance_patch.sql → çalıştır (idempotent standalone patch)
```

Ya da faz faz ilerlemek istiyorsanız (arşivden):

```
1. repair_production.sql → çalıştır (base schema patches)
2. archive/flowra_phase1_accounting.sql → çalıştır
3. archive/flowra_phase2_pcle.sql → çalıştır
4. archive/flowra_phase3_accounting.sql → çalıştır
5. archive/flowra_phase7_hardening.sql → çalıştır
6. archive/flowra_phase9_workflow.sql → çalıştır
7. archive/flowra_phase14_orders.sql → çalıştır
8. schema_verify.sql → doğrula
```

Her dosya bağımsız olarak idempotent'tir (defalarca çalıştırılabilir).

---

## 4. Manuel Sıfırlama (Veri Silme — Tehlikeli)

> ⛔ Bu işlem geri alınamaz. Tüm şirket verilerini siler.
> Sadece test/staging ortamında yapın.

### Adım 1 — Auth kullanıcılarını sil

```
Supabase Dashboard → Authentication → Users → Tüm kullanıcıları seç → Delete
```

Auth kullanıcıları silinmeden `company_members` ve `user_settings` cascade ile temizlenemez.

### Adım 2 — Şema sıfırlama SQL

```sql
-- ⛔ BUNU SADECE TEST ORTAMINDA ÇALIŞTIRIN
-- Her şeyi siler — sonra FLOWRA_FULL_INSTALL.sql ile yeniden kurun

drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres;
```

### Adım 3 — Yeniden kurulum

```sql
-- Yukarıdaki sıfırlamadan sonra:
-- FLOWRA_FULL_INSTALL.sql tamamını çalıştır
```

---

## 5. Environment Variables (Vercel)

Kurulumdan sonra Vercel'de şu env var'ların set olduğunu kontrol edin:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`supabase/.env.local.example` varsa oradan kopyalanabilir.

---

## 6. İlk Kullanıcı Kurulumu

Kurulumdan sonra ilk kayıt olan kullanıcı otomatik olarak:
1. Yeni bir şirket alır (`bootstrap_user_company` RPC)
2. `admin` rolüyle `company_members`'a eklenir
3. `user_settings`'e kaydedilir

Ek kullanıcılar: Settings → Team → Invite ile eklenebilir.

---

## 7. Smoke Test Kontrol Listesi

Kurulum sonrası şu URL'leri sırayla test edin:

| # | URL | Beklenen |
|---|-----|---------|
| 1 | `/` | Login sayfası yönlendirmesi |
| 2 | `/dashboard` | CEO Cockpit yükleniyor |
| 3 | `/dashboard/finance?tab=overview` | Finance hub, 9 tab görünüyor |
| 4 | `/dashboard/finance?tab=cfo` | CFO cockpit içeriği |
| 5 | `/dashboard/finance?tab=balance` | Balance sheet tablosu |
| 6 | `/dashboard/finance?tab=cashflow` | Cashflow grafiği |
| 7 | `/dashboard/commercial?tab=pipeline` | Pipeline boş liste |
| 8 | `/dashboard/commercial?tab=proformas` | Proforma listesi |
| 9 | `/dashboard/commercial?tab=customers` | Müşteri listesi |
| 10 | `/dashboard/operations?tab=expenses` | Gider listesi |
| 11 | `/dashboard/operations?tab=catalog` | Ürün kataloğu |
| 12 | `/dashboard/operations?tab=stock` | Stok paneli |
| 13 | `/dashboard/operations?tab=orders` | Satın alma emirleri listesi |
| 14 | `/dashboard/planning?tab=unit-profit` | Simülasyon UI |
| 15 | `/dashboard/planning?tab=tasks` | Görev listesi |
| 16 | `/dashboard/partners` | Ortak listesi |
| 17 | `/dashboard/settings` | Ayarlar sayfası |
| 18 | `/dashboard/cashflow` | → redirect `/dashboard/finance?tab=cashflow` (301) |
| 19 | `/dashboard/simulation` | → redirect `/dashboard/planning?tab=unit-profit` (301) |
| 20 | `/dashboard/orders` | → redirect `/dashboard/operations?tab=orders` (301) |

---

## 8. Bilinen Sınırlamalar

- `purchases` tablosu mevcut şemada yoksa `trg_guard_period_purchases` trigger'ı sessizce atlanır (exception when undefined_table)
- `audit_log` (eski, no-s) ve `audit_logs` (yeni, with-s) iki ayrı tablo. App kodu `audit_logs` kullanıyor.
- `gl_mode = 'shadow'` default'tur — journal entry yazılmaz. FAZ 2'de `parallel` moduna geçilecek.
- Vercel MCP erişimi olmadığı için deploy URL'i `vercel.com/dashboard` üzerinden kontrol edin.
