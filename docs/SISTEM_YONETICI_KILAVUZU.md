# Sistem Yönetici Kılavuzu

**Flowra Platform Yönetimi, Güvenlik Yapılandırması ve Sistem Bakım Başvuru Belgesi**

Bu kılavuz, Flowra'yı kurum içinde yöneten sistem yöneticileri ve BT sorumluları için hazırlanmıştır. Kullanıcı yönetimi, şirket yapılandırması, uyarı sistemleri, iş akışları ve sistem sağlığı izleme konularını kapsar.

---

## İçindekiler

1. [Yönetici Paneline Giriş](#1-yönetici-paneline-giriş)
2. [Kullanıcı Yönetimi](#2-kullanıcı-yönetimi)
3. [Şirket Yönetimi](#3-şirket-yönetimi)
4. [Uyarı Yapılandırması](#4-uyarı-yapılandırması)
5. [İş Akışı Onayları](#5-i̇ş-akışı-onayları)
6. [Cron Görevleri İzleme](#6-cron-görevleri-i̇zleme)
7. [Denetim Günlüğü](#7-denetim-günlüğü)
8. [Veri Güvenliği ve Ortam Değişkenleri](#8-veri-güvenliği-ve-ortam-değişkenleri)
9. [Sistem Sağlığı İzleme](#9-sistem-sağlığı-i̇zleme)
10. [Yedekleme ve Kurtarma](#10-yedekleme-ve-kurtarma)
11. [GL Modu Yönetimi](#11-gl-modu-yönetimi)
12. [Sık Karşılaşılan Sorunlar](#12-sık-karşılaşılan-sorunlar)

---

## 1. Yönetici Paneline Giriş

### 1.1 Erişim

Sol menüde **Yönetim** bağlantısına tıklayın veya `/dashboard/admin` adresine gidin. Bu menü yalnızca **Admin** rolündeki kullanıcılara görünür.

### 1.2 Yönetici Paneli Sekmeleri

| Sekme | İçerik |
|-------|--------|
| **Kullanıcılar** | Kullanıcı listesi, davet, rol yönetimi |
| **Şirket** | Şirket bilgileri, logo, banka hesapları |
| **Sistem** | Uyarı eşikleri, GL modu, cron geçmişi |
| **İş Akışları** | Bekleyen onaylar, onay geçmişi |
| **Mutabakat** | Dönem mutabakatları, imzalama, arşiv |
| **Denetim** | Denetim günlükleri, hash zinciri doğrulama |

---

## 2. Kullanıcı Yönetimi

### 2.1 Mevcut Kullanıcıları Görüntüleme

**Admin > Kullanıcılar** sekmesinde şirketin tüm üyeleri listelenir:

| Sütun | Açıklama |
|-------|----------|
| Ad Soyad | Kullanıcının profil adı |
| E-posta | Giriş e-postası |
| Rol | Admin / Manager / Viewer |
| Durum | Aktif / Davet Bekliyor / Devre Dışı |
| Son Giriş | En son oturum açma tarihi ve saati |
| Eklendi | Kullanıcının sisteme eklendiği tarih |

### 2.2 Yeni Kullanıcı Davet Etme

1. **Admin > Kullanıcılar** sekmesine gidin.
2. **"Kullanıcı Davet Et"** butonuna tıklayın.
3. Kullanıcının **e-posta adresini** girin.
4. **Rolü** seçin (Admin / Manager / Viewer).
5. **"Daveti Gönder"** butonuna tıklayın.

Sistem, kullanıcıya aktivasyon bağlantısı içeren bir e-posta gönderir. Kullanıcı bu bağlantıya tıklayarak şifresini belirler ve sisteme erişim kazanır.

Davet bağlantısı **72 saat** geçerlidir. Süre dolduysa davet listesinden o kullanıcıyı bulup **"Daveti Yenile"** butonunu kullanın.

### 2.3 Roller ve İzinler

Flowra'da üç rol bulunur. Her rol 17 izin alanında farklı yetkilere sahiptir:

| İzin Alanı | Admin | Manager | Viewer |
|------------|-------|---------|--------|
| Satış okuma | Evet | Evet | Evet |
| Satış yazma | Evet | Evet | Hayır |
| Masraf okuma | Evet | Evet | Evet |
| Masraf yazma | Evet | Evet | Hayır |
| Stok okuma | Evet | Evet | Evet |
| Stok yazma | Evet | Evet | Hayır |
| Muhasebe okuma | Evet | Hayır | Hayır |
| Muhasebe yazma | Evet | Hayır | Hayır |
| Ortak modülü okuma | Evet | Hayır | Hayır |
| Ortak modülü yazma | Evet | Hayır | Hayır |
| CFO merkezi | Evet | Hayır | Hayır |
| Raporlar | Evet | Evet | Hayır |
| Admin paneli | Evet | Hayır | Hayır |
| Kullanıcı yönetimi | Evet | Hayır | Hayır |
| İş akışı onaylama | Evet | Evet* | Hayır |
| Dönem kapatma | Evet | Hayır | Hayır |
| Uyarı yapılandırma | Evet | Hayır | Hayır |

*Manager rolü yalnızca masraf onayı iş akışında onaylama yapabilir.

**Rol Açıklamaları:**

- **Admin:** Sisteme tam erişim. Kullanıcı yönetimi, şirket yapılandırması, GL modu değiştirme, dönem kapatma, mutabakat imzalama dahil tüm işlemleri yapabilir.
- **Manager:** Günlük operasyonel işlemler için. Satış, masraf, stok girişi yapabilir. Finansal tablolara ve ortak modülüne erişimi yoktur.
- **Viewer:** Salt okunur erişim. Herhangi bir veri giremez veya değiştiremez. Yöneticilere durum raporu sunmak amacıyla sisteme erişmesi gereken kişiler için uygundur.

### 2.4 Rol Değiştirme

1. Kullanıcılar listesinde ilgili kullanıcıya tıklayın.
2. Detay panelinde **"Rol"** açılır listesini değiştirin.
3. **"Kaydet"** butonuna tıklayın.

Rol değişikliği anında etkili olur; kullanıcı aktif oturumunda bile yeni rolünün yetkilerine geçer.

### 2.5 Kullanıcı Erişimini Kaldırma

1. Kullanıcılar listesinde ilgili kullanıcıya tıklayın.
2. **"Erişimi Kaldır"** butonuna tıklayın.
3. Onay dialogunu onaylayın.

Erişim kaldırıldığında kullanıcının açık oturumları sona erer. Kullanıcının geçmişte yaptığı işlemler silinmez; audit log'da kayıtlı kalır.

### 2.6 Çoklu Şirket Üyeliği

Bir kullanıcı birden fazla şirkete üye olabilir. Her şirketteki rolü bağımsız olarak yönetilir. Kullanıcıyı başka bir şirkete de davet etmek için o şirketin Admin panelinde aynı e-posta adresiyle davet işlemi tekrarlanır.

---

## 3. Şirket Yönetimi

### 3.1 Şirket Bilgilerini Güncelleme

1. **Admin > Şirket** sekmesine gidin.
2. Güncellenmek istenen alanı düzenleyin.
3. **"Kaydet"** butonuna tıklayın.

Düzenlenebilir alanlar:

| Alan | Açıklama |
|------|----------|
| Şirket Adı | Raporlar ve PDF'lerde görünecek ad |
| Vergi Numarası | 10 haneli vergi kimlik numarası |
| Ticaret Sicil No | Resmi sicil numarası |
| Adres | Tam şirket adresi |
| Telefon | Ana iletişim numarası |
| E-posta | Şirket e-posta adresi |
| Web Sitesi | Opsiyonel |
| KDV Mükellefi | Evet / Hayır (KDV hesaplamasını etkiler) |

### 3.2 Logo Yükleme

1. **Admin > Şirket** sekmesinde **Logo** alanını bulun.
2. **"Logo Yükle"** butonuna tıklayın.
3. PNG veya JPEG formatında, en az 400×400 piksel, maksimum 2 MB boyutunda görsel seçin.
4. Kırpma aracıyla kareye getirin.
5. **"Kaydet"** butonuna tıklayın.

Logo, proforma PDF'lerinde, mutabakat raporlarında ve e-posta bildirimlerinin başlığında görünür.

### 3.3 Banka Hesapları Yönetimi

Şirketin banka hesapları, gider ve tahsilat kayıtlarında ödeme yöntemi olarak seçilebilir.

**Hesap Ekleme:**
1. **Admin > Şirket > Banka Hesapları** bölümüne gidin.
2. **"Hesap Ekle"** butonuna tıklayın.
3. Banka adı, IBAN ve hesap açıklamasını girin.
4. **"Kaydet"** butonuna tıklayın.

**Varsayılan Hesap:** Birden fazla hesap varsa sıkça kullanılan hesabı varsayılan olarak işaretleyebilirsiniz; yeni giriş formlarında bu hesap otomatik seçilir.

### 3.4 Çoklu Şirket — Şirket Değiştirme

Birden fazla şirketin yönetiminden sorumluysa ve her ikisine de Admin olarak üyeyseniz, sol menünün üst kısmında **şirket seçici** görünür. Şirket adının yanındaki küçük ok simgesine tıklayarak üyesi olduğunuz şirketler arasında geçiş yapabilirsiniz.

---

## 4. Uyarı Yapılandırması

### 4.1 Uyarı Sistemine Giriş

Uyarı Motoru, şirketin finansal durumunu sürekli izler ve tanımlı eşikler aşıldığında bildirim üretir. Varsayılan uyarı kuralları sistem yüklemesinde otomatik oluşturulur; ancak her eşik şirkete göre özelleştirilebilir.

### 4.2 Uyarı Eşiklerini Yapılandırma

1. **Admin > Sistem > Uyarı Eşikleri** bölümüne gidin.
2. Değiştirmek istediğiniz kuralı bulun.
3. Eşik değerini düzenleyin.
4. **"Kaydet"** butonuna tıklayın.

### 4.3 13 Varsayılan Uyarı Kuralı

| Kural Kodu | Açıklama | Varsayılan Eşik | Özelleştirilebilir mi? |
|------------|----------|-----------------|------------------------|
| `RECEIVABLE_30` | 30 günü geçmiş alacak var | Herhangi bir tutar | Evet (min. tutar) |
| `RECEIVABLE_60` | 60 günü geçmiş alacak var | Herhangi bir tutar | Evet |
| `RECEIVABLE_90` | 90 günü geçmiş alacak var | Herhangi bir tutar | Evet |
| `CASH_RUNWAY_90` | Nakit 90 günden az süre yetecek | 90 gün | Evet (gün sayısı) |
| `CASH_RUNWAY_30` | Nakit 30 günden az süre yetecek | 30 gün | Evet |
| `STOCK_LOW` | Stok kritik seviyenin altına düştü | Ürün bazlı min. stok | Evet |
| `LOAN_OVERDUE` | Vadesi geçmiş ortak kredi dilimi | 1 gün | Hayır |
| `CAPITAL_UNPAID` | Taahhüt edilen sermaye ödenmedi | 30 gün | Evet |
| `VAT_UNBALANCED` | KDV beyan dönemi yaklaşıyor | 5 gün kala | Evet |
| `PERIOD_CLOSE_DUE` | Dönem kapatma hatırlatması | Ay sonundan 3 gün önce | Evet |
| `TRIAL_BALANCE_DRIFT` | Mizan dengesizliği tespit edildi | > 0,01 TRY fark | Hayır |
| `PARTNER_RISK_D` | Ortak risk skoru D veya altına düştü | D notu | Evet |
| `WORKFLOW_EXPIRED` | Onay süresi doldu | 48 saat | Evet |

### 4.4 Uyarıyı Devre Dışı Bırakma

Belirli bir uyarı iş süreçlerinize uymuyorsa kural satırındaki **"Aktif"** geçiş butonunu kapatabilirsiniz. Devre dışı bırakılan kurallar tetiklenmez; ancak sistemden silinmez.

**Not:** `TRIAL_BALANCE_DRIFT` ve `LOAN_OVERDUE` kuralları devre dışı bırakılamaz; bu kurallar muhasebe doğruluğu ve yasal uyum açısından kritiktir.

### 4.5 Bildirim Kanalları

Uyarılar iki kanaldan iletilir:

- **Uygulama içi:** CEO Komuta Merkezi'nde kırmızı veya sarı uyarı kartı olarak görünür.
- **E-posta:** Admin rolündeki kullanıcılara `RESEND_API_KEY` tanımlıysa e-posta gönderilir. Kullanıcılar kişisel bildirim tercihlerini **Profil > Bildirim Ayarları** menüsünden yapılandırabilir.

---

## 5. İş Akışı Onayları

### 5.1 Bekleyen Onayları Görüntüleme

1. **Admin > İş Akışları** sekmesine gidin.
2. **"Bekleyen Onaylar"** listesinde onay bekleyen işlemler görünür.

Her satırda şunlar gösterilir:
- İş akışı türü
- İşlemi başlatan kullanıcı
- Oluşturulma tarihi
- Kalan süre (48 saat zaman aşımına göre)
- Tutar (uygulanıyorsa)

### 5.2 Onay Verme veya Reddetme

1. İlgili iş akışı satırına tıklayın.
2. Detay paneli açılır; işlemin tüm bilgileri görünür.
3. Gerekirse **"Not Ekle"** alanına yorum yazın.
4. **"Onayla"** veya **"Reddet"** butonuna tıklayın.

Onaylanan iş akışları anında işleme alınır. Reddedilen iş akışları işlemi başlatan kullanıcıya bildirimle birlikte geri döner.

### 5.3 Masraf Onayı Eşiğini Değiştirme

Varsayılan masraf onay eşiği **50.000 TRY**'dir. Bu eşiğin üzerindeki tüm masraf girişleri onay iş akışı başlatır.

Eşiği değiştirmek için:
1. **Admin > Sistem > İş Akışı Ayarları** bölümüne gidin.
2. **"Masraf Onay Eşiği"** alanını güncelleyin.
3. **"Kaydet"** butonuna tıklayın.

**Dikkat:** Eşiği çok düşük ayarlamak, her küçük masraf için onay süreci başlatır; bu iş verimliliğini olumsuz etkiler. Çok yüksek ayarlamak ise finansal kontrol açığına yol açabilir. 50.000 TRY ile 250.000 TRY arası önerilir.

### 5.4 Onay Geçmişi

**Admin > İş Akışları > Tamamlananlar** sekmesinde tarih filtresine göre tüm geçmiş iş akışları görüntülenebilir. Her kayıtta onaylayan / reddeden kullanıcı, eylem tarihi ve notlar yer alır.

---

## 6. Cron Görevleri İzleme

### 6.1 Dört Otomatik Görev

Flowra'nın dört arka plan görevi Vercel Cron altyapısında çalışır. Her görev `CRON_SECRET` header'ı ile korunur.

| Görev | Zamanlama | Endpoint |
|-------|-----------|---------|
| Vadesi Geçen Güncelleme | Her gece 02:00 | `/api/cron/update-overdue` |
| Faiz Tahakkuku | Her gece 03:00 | `/api/cron/accrue-interest` |
| İş Akışı Süresi Dolma | Her gece 04:00 | `/api/cron/expire-workflows` |
| Yönetişim Snapshot | Her ayın 1'i 05:00 | `/api/cron/governance-snapshot` |

### 6.2 Görev Geçmişini İzleme

1. **Admin > Sistem > Cron Görevleri** bölümüne gidin.
2. Her görevin satırında şunlar görünür:
   - Son çalışma tarihi ve saati
   - Çalışma süresi (ms)
   - Sonuç: Başarı / Hata
   - İşlenen kayıt sayısı

### 6.3 Manuel Tetikleme

Bir görevin beklemeden çalıştırılması gerekiyorsa (örneğin faiz tahakkuku atlandıysa):

1. İlgili görevin satırında **"Manuel Çalıştır"** butonuna tıklayın.
2. Onay dialogunu onaylayın.
3. Görev başlar; ekran birkaç saniye sonra sonucu gösterir.

**Dikkat:** Faiz tahakkuku görevi aynı dönem için iki kez çalışırsa mükerrer faiz tahakkuku oluşabilir. Manuel tetiklemeden önce son çalışma zamanını kontrol edin.

### 6.4 Görev Hatası Durumunda

Görev hata ile sonuçlanmışsa satırdaki **"Hata Detayı"** bağlantısına tıklayarak hata mesajını görüntüleyin. Sık karşılaşılan hatalar:

| Hata | Olası Neden | Çözüm |
|------|------------|-------|
| `DATABASE_CONNECTION_TIMEOUT` | Supabase geçici kesinti | 10-15 dakika sonra tekrar deneyin |
| `PERIOD_LOCKED` | Kilitli dönem için faiz yazılmaya çalışıldı | Dönem kilidini kontrol edin |
| `CRON_SECRET_INVALID` | `CRON_SECRET` ortam değişkeni değişmiş | Vercel ortam değişkenlerini güncelleyin |

---

## 7. Denetim Günlüğü

### 7.1 Denetim Günlüğüne Erişim

1. **Admin > Denetim** sekmesine gidin.
2. Varsayılan görünüm: Son 7 günün tüm olayları, en yeniden eskiye.

### 7.2 Filtreleme

Üst çubukta şu filtreler mevcuttur:

| Filtre | Açıklama |
|--------|----------|
| Tarih Aralığı | Başlangıç ve bitiş tarihi seçin |
| Kullanıcı | Belirli bir kullanıcının aksiyonlarını filtreleyin |
| Aksiyon | create / update / delete / approve / reject / close / sign |
| Varlık Tipi | sale / expense / journal_entry / period / partner_loan vb. |

### 7.3 Log Kaydı Detayı

Her satıra tıklayarak detay paneli açılır. Panelde şunlar görünür:

- Kullanıcı adı ve e-postası
- Tam tarih ve saat (saniye hassasiyetinde)
- Aksiyon tipi
- Etkilenen varlık (ID ve tip)
- **Payload:** İşlem öncesi (before) ve sonrası (after) değerler JSON formatında
- SHA-256 içerik hash'i
- Önceki kayıt hash'i (zincir bağlantısı)

### 7.4 Hash Zinciri Doğrulama

Denetim zincirinin bütünlüğünü doğrulamak için:

1. **Admin > Denetim** sekmesinde **"Zinciri Doğrula"** butonuna tıklayın.
2. Tarih aralığı seçin.
3. **"Doğrula"** butonuna tıklayın.

Doğrulama tamamlandığında:
- **Yeşil:** "X kayıt kontrol edildi, zincir bütün" mesajı görünür.
- **Kırmızı:** "Zincir kırılması tespit edildi" ve ilgili kayıt ID'si gösterilir.

### 7.5 Dışa Aktarma

**PDF İndir:** Filtreye uyan tüm kayıtları kronolojik PDF olarak indirir. PDF başlığında şirket adı, tarih aralığı ve oluşturma zamanı yer alır.

**CSV İndir:** Ham veri; Excel veya muhasebe programınıza aktarmak için uygundur. Tüm alanlar virgülle ayrılmış formattadır.

Her dışa aktarma işlemi kendisi de audit log'a kaydedilir (kim, ne zaman indirdi).

---

## 8. Veri Güvenliği ve Ortam Değişkenleri

### 8.1 Kritik Ortam Değişkenleri

Aşağıdaki ortam değişkenleri yanlış yapılandırıldığında ciddi güvenlik riskleri oluşur:

| Değişken | Risk Düzeyi | Kural |
|----------|-------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Kritik | Yalnızca sunucu tarafında kullanılır. İstemci koduna, tarayıcıya veya log'a asla yazılmamalı. Bu anahtarı bilen herkes RLS'yi atlayabilir. |
| `CRON_SECRET` | Yüksek | Cron endpoint'lerini dışarıdan çağrıya karşı korur. 6 ayda bir rotasyona alınmalı. |
| `ENABLE_SEED` | Kritik | Üretim ortamında `false` veya tanımsız bırakılmalı. `true` ise `/api/seed` endpoint'i demo veri ekler. |
| `ENABLE_RESET` | Kritik | Üretim ortamında `false` veya tanımsız bırakılmalı. `true` ise `/api/reset` endpoint'i tüm şirket verilerini siler. |
| `ANTHROPIC_API_KEY` | Orta | Yoksa AI özet özelliği sessizce devre dışı kalır. Gereksizse tanımlamayın. |
| `RESEND_API_KEY` | Düşük | Yoksa e-posta bildirimleri sessizce devre dışı kalır. |

### 8.2 Ortam Değişkenlerini Vercel Üzerinde Yönetme

1. Vercel Dashboard > Projeniz > Settings > Environment Variables adresine gidin.
2. Her değişkeni `Production`, `Preview` ve `Development` ortamları için ayrı ayrı tanımlayabilirsiniz.
3. Değer değiştirildikten sonra yeni deployment tetiklenmelidir; değişiklikler canlı uygulamaya hemen yansımaz.

### 8.3 Row Level Security (RLS)

RLS politikaları PostgreSQL veritabanı motorunda tanımlıdır ve otomatik çalışır. Manuel müdahale gerektirmez. Ancak şu durumlarda DBA yardımı gerekebilir:

- Yeni bir özel tablo eklendiyse ve RLS politikası yoksa: `SUPABASE_SERVICE_ROLE_KEY` kullanarak Supabase Studio üzerinden politika eklenmeli.
- Mevcut politikada değişiklik gerekiyorsa: Supabase Dashboard > Table Editor > Policies menüsünden yapılır.

Üretim RLS politikaları değiştirilmeden önce staging ortamında test edilmeli ve değişiklik denetim kaydı tutulmalıdır.

### 8.4 Güvenlik Kontrol Listesi

Her üç ayda bir şu kontrolleri yapmanız önerilir:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` hiçbir log veya Git commit'inde görünüyor mu?
- [ ] `CRON_SECRET` rotasyona alındı mı?
- [ ] `ENABLE_SEED` ve `ENABLE_RESET` üretimde `false` mı?
- [ ] Eski çalışanların erişimi kaldırıldı mı?
- [ ] Son 90 günlük audit log hash zinciri doğrulandı mı?
- [ ] Supabase Dashboard'da anomal sorgu sayısı var mı?

---

## 9. Sistem Sağlığı İzleme

### 9.1 Health Endpoint

```
GET /api/health
```

Bu endpoint herhangi bir tarayıcı veya izleme aracı üzerinden çağrılabilir. Döndürdüğü bilgiler:

```json
{
  "status": "healthy",
  "timestamp": "2026-05-26T10:30:00Z",
  "checks": {
    "database": {
      "status": "ok",
      "latency_ms": 12
    },
    "gl_mode": {
      "status": "gl_primary"
    },
    "open_period": {
      "status": "ok",
      "period": "2026-05"
    },
    "trial_balance": {
      "status": "balanced",
      "delta": 0.00
    },
    "pending_workflows": {
      "count": 2
    }
  }
}
```

Bir izleme servisi kullanıyorsanız (UptimeRobot, Datadog vb.) bu endpoint'i 5 dakikada bir çağıracak şekilde yapılandırın; `status` alanı `healthy` değilse alarm tetikleyin.

### 9.2 GL Sağlık Kontrolü

```
GET /api/admin/gl-readiness
```

Bu endpoint şunları döndürür:
- GL modu (`shadow` / `parallel` / `gl_primary`)
- Muhasebe fişi kapsam yüzdesi (tüm satışlar ve masrafların fişe bağlı olma oranı)
- Eksik fiş listesi (varsa)
- Mizan denge durumu

### 9.3 Supabase Dashboard İzleme

Supabase Dashboard > Projeniz > Reports menüsünden şu metrikleri izleyebilirsiniz:

| Metrik | Neden Önemli |
|--------|-------------|
| Aktif bağlantı sayısı | Maksimum bağlantı sınırını aşmamak için |
| Ortalama sorgu süresi | Yavaş sorgu tespit ve optimizasyonu |
| Veritabanı disk kullanımı | Depolama planlaması |
| RLS policy hit rate | Güvenlik politikalarının çalıştığından emin olmak |
| Auth başarı / başarısız oranı | Kaba kuvvet saldırısı tespiti |

### 9.4 Vercel Function Logs

Vercel Dashboard > Projeniz > Logs menüsünden API route çalışma kayıtları görüntülenebilir. Hatalı API çağrıları bu ekranda kırmızıyla işaretlenir. Filtre olarak route path veya HTTP durum kodu kullanılabilir (örn. `status:500` filtresiyle sunucu hatalarına bakılabilir).

---

## 10. Yedekleme ve Kurtarma

### 10.1 Supabase Otomatik Yedekleme

Supabase, veritabanının otomatik yedeğini tutar:

| Plan | Yedek Sıklığı | Saklama Süresi | Geri Yükleme Yöntemi |
|------|---------------|----------------|----------------------|
| Free | Günlük | 1 gün | Manuel dosya indir |
| Pro | Sürekli (PITR) | 7 gün | Herhangi bir saniyeye geri dön |
| Team | Sürekli (PITR) | 14 gün | Herhangi bir saniyeye geri dön |

### 10.2 Manuel Yedek Alma

1. Supabase Dashboard > Projeniz > Settings > Backups adresine gidin.
2. **"Create a new backup"** butonuna tıklayın.
3. Yedek oluşturulduğunda indirme bağlantısı görünür.

### 10.3 SQL Dump (CLI)

Komut satırı aracılığıyla tam SQL dump alınabilir:

```bash
pg_dump \
  -h <SUPABASE_HOST> \
  -p 5432 \
  -U postgres \
  -d postgres \
  --no-owner \
  --no-acl \
  -f backup_$(date +%Y-%m-%d).sql
```

Bağlantı bilgileri Supabase Dashboard > Settings > Database menüsünde bulunur.

### 10.4 Veri Kurtarma (PITR)

Pro veya Team planında belirli bir tarihe ve saate geri dönmek için:

1. Supabase Dashboard > Projeniz > Settings > Backups adresine gidin.
2. **"Point in Time Recovery"** butonuna tıklayın.
3. Geri dönülmek istenen tarih ve saati seçin.
4. Onaylayın.

Bu işlem tüm veritabanını seçilen noktaya geri döndürür. Geri yüklemeden önce mevcut veritabanının yedeği alınır.

---

## 11. GL Modu Yönetimi

### 11.1 Mevcut GL Modunu Görüntüleme

**Admin > Sistem > GL Modu** bölümünde şirketin mevcut GL modu görünür.

### 11.2 Mod Geçiş Kuralları

GL modu değişikliği tek yönlüdür: `shadow` → `parallel` → `gl_primary`. Geri dönüş yapılamaz.

| Geçiş | Gereklilik |
|-------|-----------|
| Shadow → Parallel | Tüm tarihsel satış ve masraf verileri sisteme girilmiş olmalı; açılış bakiyesi fişleri yazılmış olmalı |
| Parallel → GL Primary | En az 2 tam dönem parallel modda çalışılmış ve GL-operasyonel sapma < %0,5 olmalı |

### 11.3 Mod Değiştirme

1. **Admin > Sistem > GL Modu** bölümüne gidin.
2. **"Modu Değiştir"** butonuna tıklayın.
3. Geçiş uyarısını okuyun ve onaylayın.
4. Değişiklik anında etkili olur.

Mod değişikliği audit log'a kaydedilir; kim, ne zaman değiştirdi bilgisi tutulur.

---

## 12. Sık Karşılaşılan Sorunlar

### 12.1 Kullanıcı Aktivasyon E-postası Gelmiyor

- `RESEND_API_KEY` ortam değişkeninin tanımlı olduğunu kontrol edin.
- Vercel Functions loglarında `/api/auth/invite` endpoint'inin başarıyla çalıştığını doğrulayın.
- Kullanıcının spam klasörünü kontrol etmesini isteyin.
- Davet süresini (72 saat) kontrol edin; süresi dolmuşsa Admin > Kullanıcılar menüsünden daveti yenileyin.

### 12.2 Cron Görevleri Çalışmıyor

- Vercel Dashboard > Cron Jobs menüsünde görevlerin tanımlı olduğunu kontrol edin.
- `CRON_SECRET` ortam değişkeninin `vercel.json` yapılandırmasındaki değerle eşleştiğinden emin olun.
- Vercel Functions loglarında cron endpoint'lerine yapılan çağrıları kontrol edin.

### 12.3 Mizan Dengesiz Uyarısı

1. **Admin > Denetim** menüsünde son 24 saatteki `journal_entry` oluşturma olaylarını filtreleyin.
2. Tek taraflı (yalnızca DR veya yalnızca CR) kayıt var mı kontrol edin.
3. `/api/admin/gl-readiness` endpoint'ini çağırarak `missing_journals` listesine bakın.
4. Sorun operasyonel kayıt seviyesindeyse o kaydı düzeltin; sistem fark fişini otomatik üretir.

### 12.4 Dönem Kapatılamıyor

- Kontrol listesindeki 8 maddenin tamamının işaretli olduğunu doğrulayın.
- Özellikle Madde 6 (Mizan Dengeli) kontrolünü yapın; mizan dengesiz ise kapatma mümkün değildir.
- Açık (onay bekleyen) iş akışları varsa tamamlanana kadar dönem kapatılamaz.

### 12.5 RLS Hatası (403 Forbidden)

Supabase Studio'da sorgu yaparken RLS hatası alıyorsanız:

- `service_role` yerine `anon` veya `authenticated` anahtar kullanılmış olabilir.
- RLS politikasının `company_id` koşulunu kontrol edin.
- Supabase Dashboard > Authentication > Policies menüsünden tablo politikalarını gözden geçirin.

---

*Bu kılavuz Flowra v1.0 için hazırlanmıştır. Ortam değişkenleri ve güvenlik prosedürleri konusunda ek destek için teknik destek kanalına başvurunuz.*
