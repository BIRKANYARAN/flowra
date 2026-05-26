# Flowra — Güncelleme Kılavuzu

**Sürüm:** 1.0  
**Son Güncelleme:** Mayıs 2026  
**Hedef Kitle:** Sistem yöneticileri ve IT sorumluları

---

## İçindekiler

1. [Güncelleme Öncesi Yapılacaklar](#1-güncelleme-öncesi-yapılacaklar)
2. [Güncelleme Adımları](#2-güncelleme-adımları)
3. [FLOWRA_PRODUCTION_UPGRADE.sql Hakkında](#3-flowra_production_upgradesql-hakkında)
4. [GL Mod Yükseltme Yolu](#4-gl-mod-yükseltme-yolu)
5. [Geri Alma (Rollback) Prosedürü](#5-geri-alma-rollback-prosedürü)
6. [Güncelleme Sonrası Doğrulama](#6-güncelleme-sonrası-doğrulama)
7. [Sık Karşılaşılan Sorunlar](#7-sık-karşılaşılan-sorunlar)

---

## 1. Güncelleme Öncesi Yapılacaklar

Herhangi bir güncelleme işlemine başlamadan önce aşağıdaki adımları eksiksiz tamamlayın. Bu adımları atlamak veri kaybına veya uzun süreli kesintilere yol açabilir.

### 1.1 Veritabanı Yedeği Alma

**Bu adım zorunludur. Yedek almadan güncelleme yapmayın.**

Supabase üzerinden yedek almak için:

1. Supabase panosunda sol menüden **Database → Backups** yolunu izleyin.
2. **"Create a new backup"** düğmesine tıklayın.
3. Yedek tamamlanana kadar bekleyin (genellikle 2–10 dakika sürer).
4. Yedek listesinde yeni yedek görüntülendiğinde işlem tamamdır.

Alternatif olarak, `pg_dump` aracıyla manuel yedek alabilirsiniz:

```bash
pg_dump "postgresql://postgres:[DB_SIFRESI]@db.[PROJE_ID].supabase.co:5432/postgres" \
  --format=custom \
  --file="flowra_backup_$(date +%Y%m%d_%H%M%S).dump"
```

Bağlantı bilgilerini Supabase → Settings → Database → Connection string bölümünden alabilirsiniz.

### 1.2 Mevcut Versiyon Teyidi

Güncelleme öncesinde sistemin mevcut versiyonunu kaydedin. Bu bilgi olası geri alma işlemlerinde gerekli olacaktır.

1. Flowra uygulamasına giriş yapın.
2. Sağ üst köşedeki profil menüsünden **"Hakkında"** seçeneğine tıklayın.
3. Görüntülenen versiyon numarasını not alın.

Alternatif olarak, Vercel panosunda **Deployments** sayfasından son başarılı deploy'un commit hash'ini not alın.

### 1.3 Planlı Bakım Penceresi Oluşturma

Güncelleme işlemi boyunca kullanıcıların sisteme erişemeyebileceğini planlayın.

- **Önerilen süre:** 15–30 dakika (standart güncelleme için)
- **Önerilen zaman:** Mesai saatleri dışı, örneğin hafta içi gece 02:00–04:00 arası
- **Kullanıcı bildirimi:** Güncelleme öncesinde kullanıcılara en az 24 saat önceden bilgilendirme yapın

### 1.4 Güncelleme Öncesi Kontrol Listesi

- [ ] Veritabanı yedeği alındı ve doğrulandı
- [ ] Mevcut versiyon numarası kaydedildi
- [ ] Bakım penceresi planlandı ve duyuruldu
- [ ] `FLOWRA_PRODUCTION_UPGRADE.sql` dosyası indirildi ve doğrulandı
- [ ] Vercel ve Supabase hesaplarına giriş yapıldı
- [ ] GitHub reposunun güncel olduğu teyit edildi

---

## 2. Güncelleme Adımları

Aşağıdaki adımları sırayla uygulayın. Bir adım tamamlanmadan bir sonrakine geçmeyin.

### Adım 1 — FLOWRA_PRODUCTION_UPGRADE.sql'i Çalıştırma

Bu adım veritabanı şemasını günceller: yeni tablolar ekler, mevcut tablolara sütunlar ekler ve gereken fonksiyonları günceller.

1. Supabase panosunda sol menüden **SQL Editor** seçeneğine tıklayın.
2. **"New Query"** düğmesine tıklayın.
3. `FLOWRA_PRODUCTION_UPGRADE.sql` dosyasının tüm içeriğini kopyalayıp yapıştırın.
4. **"Run"** düğmesine tıklayın veya `Ctrl+Enter` / `Cmd+Enter` kısayolunu kullanın.
5. Aşağıdaki çıktıyı görmelisiniz:

```
Success. No rows returned.
```

Herhangi bir hata mesajı görürseniz güncellemeyi durdurun ve bu kılavuzun "Sık Karşılaşılan Sorunlar" bölümüne başvurun.

### Adım 2 — GitHub'dan Güncel Kodu Çekme

Eğer repoyu yerel ortamda yönetiyorsanız:

```bash
git fetch origin
git checkout main
git pull origin main
```

Değişiklik günlüğünü incelemek için:

```bash
git log --oneline -20
```

### Adım 3 — Vercel'de Yeniden Deploy Etme

**Otomatik Deploy (Önerilen):**  
Eğer GitHub entegrasyonu aktifse, `main` dalına yapılan `git push` işlemi otomatik olarak Vercel deploy'unu tetikler. Deploy işleminin tamamlanmasını Vercel panosundan izleyin.

**Manuel Deploy:**
1. Vercel panosunda projenize gidin.
2. **"Deployments"** sekmesine tıklayın.
3. Sağ üst köşedeki **"Redeploy"** düğmesine tıklayın.
4. **"Redeploy"** onay kutusunu işaretleyin ve deploy'u başlatın.

### Adım 4 — Ortam Değişkenlerini Güncelleme (Gerekiyorsa)

Yeni sürüm yeni ortam değişkenleri gerektiriyorsa:

1. Vercel **Project Settings → Environment Variables** sayfasına gidin.
2. Güncelleme notlarında belirtilen yeni değişkenleri ekleyin.
3. Değerleri kaydettikten sonra yeni bir deploy başlatın.

---

## 3. FLOWRA_PRODUCTION_UPGRADE.sql Hakkında

### İdempotent Tasarım

`FLOWRA_PRODUCTION_UPGRADE.sql` dosyası **idempotent** olarak tasarlanmıştır. Bu, aynı dosyanın birden fazla kez çalıştırılmasının herhangi bir soruna yol açmayacağı anlamına gelir.

Teknik açıdan bu şu şekilde sağlanır:
- Tablo oluşturma komutları `CREATE TABLE IF NOT EXISTS` kullanır (tablo zaten varsa atlar)
- Sütun ekleme komutları mevcut sütunları kontrol ederek duplicate ekleme yapmaz
- Fonksiyon güncellemeleri `CREATE OR REPLACE FUNCTION` kullanır

**Bu ne anlama gelir?** Güncelleme sırasında bir sorun yaşarsanız ve SQL dosyasını tekrar çalıştırmanız gerekirse bunu güvenle yapabilirsiniz. Verileriniz zarar görmez, mevcut kayıtlar silinmez.

### Güncelleme Kapsamı

Her güncelleme SQL dosyası yalnızca o sürüme özgü değişiklikleri içerir:
- Yeni tablolar ve sütunlar
- Güncellenen veritabanı fonksiyonları
- Yeni indeksler ve kısıtlamalar
- Gerekli veri dönüşümleri

---

## 4. GL Mod Yükseltme Yolu

Flowra'nın Genel Muhasebe (GL) modülü üç aşamalı bir aktivasyon sürecine sahiptir. Bu süreç, mevcut verilerin doğruluğunu güvence altına alırken sistemi yavaşça devreye sokar.

### GL Mod Aşamaları

```
shadow  →  parallel  →  gl_primary
```

| Mod | Açıklama | Ne Zaman Geçilir |
|---|---|---|
| **shadow** | GL hesaplamalar arka planda çalışır ancak hiçbir şey gösterilmez | İlk kurulumdan itibaren (otomatik) |
| **parallel** | Hem eski hem yeni GL rakamları yan yana görüntülenir; farklar raporlanır | Yeterli veri biriktiğinde ve mutabakat sağlandığında |
| **gl_primary** | GL modülü tek yetkili kaynak olarak kullanılır | Paralel mod en az 30 gün çalıştıktan ve tüm farklar sıfırlandıktan sonra |

### shadow → parallel Geçişi

1. Flowra panosunda **CFO Merkezi → GL Ayarları** bölümüne gidin.
2. **"Paralel Mod Etkinleştir"** seçeneğine tıklayın.
3. Onay iletişim kutusunda geçişi onaylayın.
4. Sistem, mevcut verileri GL formatına dönüştürmek için bir backfill işlemi başlatacaktır.
5. Backfill tamamlanana kadar (büyük veri setleri için birkaç dakika sürebilir) bekleyin.

**Paralel Mod İzleme:**  
Paralel modda CFO Merkezi → Mizan ekranında iki sütun görünür: "Eski Bakiye" ve "GL Bakiyesi". Bu iki sütun arasındaki farkları düzenli olarak izleyin. Farklar sıfır olmadan gl_primary'e geçmeyin.

### parallel → gl_primary Geçişi

Bu geçiş geri alınamaz bir işlemdir ve dikkatli yapılmalıdır.

**Geçiş Koşulları:**
- Paralel mod en az 30 gün aktif çalışmış olmalıdır
- Mizan mutabakatı eksiksiz tamamlanmış olmalıdır
- Tüm dönem kapanışları onaylanmış olmalıdır
- CFO veya üst yönetim onayı alınmış olmalıdır

**Geçiş Adımları:**
1. CFO Merkezi → GL Ayarları → **"GL Primary'e Geç"** düğmesine tıklayın.
2. Sistem son bir mutabakat kontrolü yapacaktır.
3. Kontrol başarılı olursa onay ekranı açılacaktır.
4. Admin şifrenizi girerek geçişi onaylayın.

---

## 5. Geri Alma (Rollback) Prosedürü

Güncelleme sonrasında kritik bir sorun tespit ederseniz aşağıdaki adımları izleyin.

### 5.1 Vercel'de Önceki Sürüme Dönme

1. Vercel panosunda **Deployments** sayfasına gidin.
2. Önceki başarılı deploy'u bulun.
3. Deploy satırının sağındaki **"..."** menüsünü tıklayın.
4. **"Promote to Production"** seçeneğini seçin.
5. Birkaç dakika içinde eski uygulama kodu aktif olacaktır.

### 5.2 Veritabanını Geri Alma

> **Uyarı:** Veritabanı geri alması, geri alma noktasından bu yana girilen tüm yeni verilerin kaybına yol açar. Bu işlemi yalnızca son çare olarak uygulayın.

1. Supabase panosunda **Database → Backups** bölümüne gidin.
2. Güncelleme öncesinde aldığınız yedeği bulun.
3. **"Restore"** düğmesine tıklayın ve işlemi onaylayın.
4. Geri yükleme işlemi 10–30 dakika sürebilir.

### 5.3 Rollback Sonrası Yapılacaklar

- [ ] Uygulamanın önceki sürümde düzgün çalıştığını doğrulayın
- [ ] Kullanıcılara sistemin önceki sürüme döndüğünü bildirin
- [ ] Güncelleme sırasında oluşan hatanın kök nedenini araştırın
- [ ] Destek ekibiyle iletişime geçerek sorunu raporlayın

---

## 6. Güncelleme Sonrası Doğrulama

Güncelleme tamamlandıktan sonra aşağıdaki kontrolleri gerçekleştirin.

### 6.1 Temel İşlevsellik Kontrolü

| Kontrol | Beklenen Sonuç |
|---|---|
| Giriş yapma | Admin kullanıcısıyla başarıyla giriş yapılabilmeli |
| Dashboard yükleme | CEO Komuta Merkezi eksiksiz yüklenmeli |
| Finans modülü | CFO Merkezi ve tüm sekmeler erişilebilir olmalı |
| Yevmiye kaydı | Yeni yevmiye kaydı oluşturulabilmeli |
| PDF raporlama | Gelir tablosu PDF'i oluşturulabilmeli |

### 6.2 Veri Bütünlüğü Kontrolü

1. CFO Merkezi → Mizan sayfasını açın.
2. Aktif Borçlar toplamının Aktif Alacaklar toplamına eşit olduğunu doğrulayın.
3. Son dönemin kapanış bakiyeleri korunmuş olmalıdır.

### 6.3 Cron Jobs Kontrolü

Vercel **Project Settings → Cron Jobs** sayfasında tüm zamanlanmış görevlerin hâlâ listelendiğini ve son çalışma zamanlarının güncel olduğunu doğrulayın.

---

## 7. Sık Karşılaşılan Sorunlar

### Sorun: SQL çalışırken "permission denied" hatası

**Belirti:** SQL Editor'de `ERROR: permission denied for table ...` mesajı.  
**Neden:** SQL dosyası service role izni gerektiren işlemler içeriyor; SQL Editor varsayılan olarak düşük yetkili kullanıcıyla çalışıyor olabilir.  
**Çözüm:** Supabase'de **SQL Editor → Settings** bölümünden "Use service_role key" seçeneğini etkinleştirin, ardından SQL'i tekrar çalıştırın.

### Sorun: Vercel deploy sonrası "500 Internal Server Error"

**Belirti:** Güncelleme sonrasında uygulama 500 hatası veriyor.  
**Neden:** Yeni sürüm, ortam değişkenleri tablosuna eklenmemiş yeni bir değişken bekliyor olabilir.  
**Çözüm:** Vercel **Deployments → Functions Logs** bölümünde hata mesajını inceleyin. Eksik değişkeni tespit edip ekleyin, ardından yeniden deploy edin.

### Sorun: Güncelleme sonrası veri eksik görünüyor

**Belirti:** Bazı kayıtlar veya tutarlar güncelleme öncesinden farklı görünüyor.  
**Neden:** Olası veri göç adımı başarısız olmuş veya görüntüleme mantığı güncellenmiş olabilir.  
**Çözüm:** Hemen rollback işlemi uygulamadan önce Supabase SQL Editor'de doğrudan tabloyu sorgulayarak verinin veritabanında mevcut olup olmadığını kontrol edin.

### Sorun: GL mod backfill tamamlanmıyor

**Belirti:** Paralel moda geçiş sırasında "Backfill devam ediyor..." mesajı uzun süre devam ediyor.  
**Neden:** Büyük veri setlerinde backfill uzun sürebilir.  
**Çözüm:** Vercel **Functions Logs** sayfasını izleyin. Eğer işlem durmuşsa CFO Merkezi → GL Ayarları → **"Backfill'i Yeniden Başlat"** seçeneğini kullanın.

### Sorun: Deploy sonrası cron jobs çalışmıyor

**Belirti:** Vercel cron geçmişinde görevler çalışmıyor veya hata veriyor.  
**Neden:** `CRON_SECRET` değişkeni değişmiş ya da cron endpoint'leri güncellenmiş olabilir.  
**Çözüm:** `CRON_SECRET` değerinin hem Vercel'de hem de uygulamada senkronize olduğunu doğrulayın.

---

*Güncelleme sürecinde sorun yaşarsanız veritabanı yedeğinizin mevcut olduğundan emin olun ve destek ekibimizle iletişime geçin.*
