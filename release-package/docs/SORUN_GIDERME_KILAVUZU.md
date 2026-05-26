# Flowra — Sorun Giderme Kılavuzu

**Sürüm:** 1.0  
**Son Güncelleme:** Mayıs 2026  
**Hedef Kitle:** Sistem yöneticileri ve IT destek ekipleri

---

## İçindekiler

1. [Kurulum Sorunları](#1-kurulum-sorunları)
2. [Giriş ve Yetki Sorunları](#2-giriş-ve-yetki-sorunları)
3. [Finansal Veri Sorunları](#3-finansal-veri-sorunları)
4. [GL Mod Sorunları](#4-gl-mod-sorunları)
5. [E-posta Sorunları](#5-e-posta-sorunları)
6. [Performans Sorunları](#6-performans-sorunları)

---

## Nasıl Kullanılır

Her sorun kaydı üç bölümden oluşur:

- **Belirti:** Kullanıcının ya da yöneticinin gördüğü hata veya anormallik
- **Olası Neden:** Sorunun teknik kökü
- **Çözüm Adımları:** Sorunu gidermek için izlenecek adımlar

---

## 1. Kurulum Sorunları

### 1.1 "relation does not exist" hatası

**Belirti:**  
Uygulama açıldığında veya bir işlem yapılmaya çalışıldığında tarayıcı konsolunda ya da sunucu loglarında şu şekilde bir hata görünür:

```
ERROR: relation "public.journal_entries" does not exist
ERROR: relation "public.companies" does not exist
```

**Olası Neden:**  
`FLOWRA_PRODUCTION_INSTALL.sql` dosyası hiç çalıştırılmamış, kısmen çalıştırılmış veya çalıştırma sırasında hata alınmış ve tablolar oluşturulamamıştır.

**Çözüm Adımları:**
1. Supabase panosunda **Table Editor** sayfasını açın.
2. Tablo listesinin boş olup olmadığını veya eksik tablolar içerip içermediğini kontrol edin. Flowra için `companies`, `journal_entries`, `partners`, `invoices` gibi tablolar görünmelidir.
3. Tablolar eksikse Supabase **SQL Editor → New Query** sayfasını açın.
4. `FLOWRA_PRODUCTION_INSTALL.sql` dosyasının **tamamını** (başından sonuna kadar) kopyalayıp yapıştırın.
5. **"Run"** düğmesine tıklayın ve hata mesajı olmadan tamamlandığını doğrulayın.
6. Kurulum başarılıysa **Table Editor** sayfasını yenileyin ve tabloların göründüğünü doğrulayın.

> **Not:** SQL dosyasını kısmi olarak kopyalamak yaygın bir hatadır. `Ctrl+A` ile tüm içeriği seçtiğinizden emin olun.

---

### 1.2 "Invalid API key" hatası

**Belirti:**  
Kullanıcı giriş sayfasına eriştiğinde veya API çağrısı yapıldığında:

```
AuthApiError: Invalid API key
Error: invalid API key
```

**Olası Neden:**  
Vercel'de tanımlı `NEXT_PUBLIC_SUPABASE_ANON_KEY` veya `SUPABASE_SERVICE_ROLE_KEY` değeri hatalı ya da yanlış kopyalanmıştır.

**Çözüm Adımları:**
1. Supabase panosunda **Settings → API** bölümüne gidin.
2. **"Project API Keys"** altındaki `anon public` ve `service_role` değerlerini kopyalayın.
3. Vercel panosunda **Project Settings → Environment Variables** bölümüne gidin.
4. `NEXT_PUBLIC_SUPABASE_ANON_KEY` ve `SUPABASE_SERVICE_ROLE_KEY` değerlerini Supabase'den kopyaladığınız değerlerle karşılaştırın.
5. Eğer değerler farklıysa güncelleyin.
6. Değişiklikleri kaydettikten sonra **Deployments → Redeploy** yapın.

> **Dikkat:** API anahtarları uzun karakter dizileridir; kopyalama sırasında başına veya sonuna boşluk eklenmiş olabilir. Değeri yapıştırdıktan sonra baştaki ve sondaki boşlukları silin.

---

### 1.3 Vercel deploy hatası — "Build failed"

**Belirti:**  
Vercel panosunda deploy kırmızı renkte "Failed" durumunda görünür. Build loglarında hata mesajları bulunur.

**Olası Neden:**  
Ortam değişkenlerinden biri eksik veya yanlış tanımlanmıştır. Build sırasında zorunlu değişkene erişilememektedir.

**Çözüm Adımları:**
1. Vercel panosunda başarısız deploy'a tıklayın.
2. **"Build Logs"** sekmesini açın.
3. Kırmızı renkli hata mesajlarını bulun. Genellikle şu formatta görünür:
   ```
   Error: Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL
   ```
4. Eksik değişkeni tespit edin.
5. **Project Settings → Environment Variables** bölümüne gidin ve eksik değişkeni ekleyin.
6. Yeni bir deploy başlatın.

---

### 1.4 HTTP 500 Hatası — Sayfa yüklenmiyor

**Belirti:**  
Uygulama URL'si açıldığında tarayıcıda "500 Internal Server Error" ya da "Application Error" sayfası görünür.

**Olası Neden:**  
`SUPABASE_SERVICE_ROLE_KEY` ortam değişkeni tanımlanmamış veya hatalı. Bu anahtar sunucu taraflı işlemler için zorunludur.

**Çözüm Adımları:**
1. Vercel panosunda **Deployments → Functions Logs** bölümünü açın.
2. Son 500 hatasının logunu bulun ve detayını okuyun.
3. Eğer log `supabase service role` ya da `authentication failed` içeriyorsa:
   a. Supabase **Settings → API → service_role** anahtarını kopyalayın.
   b. Vercel **Environment Variables** bölümünde `SUPABASE_SERVICE_ROLE_KEY` değerini güncelleyin.
   c. Yeni deploy başlatın.
4. Hata başka bir modülde gösteriyor ise ilgili diğer ortam değişkenlerini kontrol edin.

---

## 2. Giriş ve Yetki Sorunları

### 2.1 Giriş yapılamıyor

**Belirti:**  
Kullanıcı doğru e-posta ve şifreyi girmesine rağmen giriş yapamıyor. Sayfa yenileniyor ya da "Geçersiz kimlik bilgileri" hatası görünüyor.

**Olası Neden:**  
Supabase Auth yapılandırması eksik; kullanıcı e-posta doğrulaması tamamlanmamış; Supabase Auth'ta kullanıcı kaydı mevcut değil.

**Çözüm Adımları:**
1. Supabase panosunda **Authentication → Users** sayfasını açın.
2. Giriş yapmaya çalışan kullanıcının listede olup olmadığını kontrol edin.
3. Kullanıcı varsa "Confirmed" sütununun yeşil olduğunu doğrulayın. Değilse kullanıcı satırına tıklayıp **"Confirm email"** seçeneğini kullanın.
4. Kullanıcı yoksa **"Add user"** ile yeni kullanıcı oluşturun.
5. Supabase **Authentication → Settings** sayfasında **"Email Auth"** seçeneğinin aktif olduğunu doğrulayın.
6. **"Site URL"** alanının `NEXT_PUBLIC_SITE_URL` değişkeniyle eşleştiğini kontrol edin.

---

### 2.2 "Şirket bulunamadı" hatası

**Belirti:**  
Kullanıcı başarıyla giriş yapıyor ancak dashboard'a yönlendirilmek yerine "Şirket bulunamadı" veya "Herhangi bir şirkete erişiminiz yok" mesajıyla karşılaşıyor.

**Olası Neden:**  
Kullanıcının `company_members` tablosunda kaydı bulunmuyor. Bu, kullanıcı doğrudan Supabase Auth'tan oluşturulduğunda ama Flowra şirket kaydıyla ilişkilendirilmediğinde gerçekleşir.

**Çözüm Adımları:**
1. Supabase SQL Editor'ü açın.
2. Aşağıdaki sorguyu çalıştırarak kullanıcının üyelik kaydını kontrol edin:
   ```sql
   SELECT cm.*, c.name as company_name
   FROM public.company_members cm
   JOIN public.companies c ON cm.company_id = c.id
   WHERE cm.user_id = '[KULLANICI_UID]';
   ```
3. Sorgu sonuç döndürmüyorsa kullanıcıyı şirkete manuel olarak ekleyin:
   ```sql
   INSERT INTO public.company_members (user_id, company_id, role)
   VALUES ('[KULLANICI_UID]', [SIRKET_ID], 'member');
   ```
4. Kullanıcıdan sayfayı yenilemesini veya yeniden giriş yapmasını isteyin.

---

### 2.3 Yetkisiz erişim hatası

**Belirti:**  
Kullanıcı belirli bir sayfaya veya işleve erişmeye çalıştığında "Erişim reddedildi" ya da "Bu işlemi yapma yetkiniz yok" mesajıyla karşılaşıyor.

**Olası Neden:**  
Kullanıcının `company_members` tablosundaki rolü (`member`, `manager`, `admin`) erişilmek istenen modül için yetersiz.

**Çözüm Adımları:**
1. Supabase SQL Editor'de kullanıcının mevcut rolünü kontrol edin:
   ```sql
   SELECT user_id, role FROM public.company_members
   WHERE user_id = '[KULLANICI_UID]'
   AND company_id = [SIRKET_ID];
   ```
2. Rolü gerekirse güncelleyin:
   ```sql
   UPDATE public.company_members
   SET role = 'admin'
   WHERE user_id = '[KULLANICI_UID]'
   AND company_id = [SIRKET_ID];
   ```
3. Geçerli roller: `member`, `manager`, `admin`
4. Kullanıcıdan yeniden giriş yapmasını isteyin.

---

## 3. Finansal Veri Sorunları

### 3.1 Mizan dengesi bozulması

**Belirti:**  
CFO Merkezi → Mizan sayfasında toplam Borç ve Alacak tutarları birbirine eşit değil. Fark sıfır değil.

**Olası Neden:**  
Eksik veya hatalı yevmiye kaydı; direkt SQL ile yapılan veri değişikliği; uygulama hatası.

**Mizan Kontrol Prosedürü:**
1. CFO Merkezi → Mizan sayfasına gidin.
2. Sayfanın altındaki toplamları not alın: Borç Toplamı ve Alacak Toplamı.
3. İki değer birbirinden farklıysa Supabase SQL Editor'de şu sorguyu çalıştırın:
   ```sql
   -- Dengesi bozuk yevmiye kayıtlarını bul
   SELECT je.id, je.description, je.date,
     SUM(CASE WHEN jel.type = 'debit' THEN jel.amount ELSE 0 END) as total_debit,
     SUM(CASE WHEN jel.type = 'credit' THEN jel.amount ELSE 0 END) as total_credit
   FROM public.journal_entries je
   JOIN public.journal_entry_lines jel ON je.id = jel.journal_entry_id
   GROUP BY je.id, je.description, je.date
   HAVING ABS(
     SUM(CASE WHEN jel.type = 'debit' THEN jel.amount ELSE 0 END) -
     SUM(CASE WHEN jel.type = 'credit' THEN jel.amount ELSE 0 END)
   ) > 0.01
   ORDER BY je.date DESC;
   ```
4. Dengesi bozuk kayıtları bulun ve Flowra arayüzü üzerinden düzeltin veya silin.
5. Yeni bir kayıt girerken borç ve alacak toplamlarının eşit olduğundan emin olun.

---

### 3.2 Negatif stok sorunu

**Belirti:**  
Stok raporunda bir ürünün stok miktarı negatif değer gösteriyor.

**Olası Neden:**  
Satış kaydı girilirken stok kontrolü yapılmamış; FIFO (İlk Giren İlk Çıkar) hesaplamasında sıra bozukluğu; geriye dönük tarihli satış kaydı.

**FIFO Düzeltme Adımları:**
1. Hangi ürünün negatif stokta olduğunu tespit edin.
2. İlgili ürünün tüm giriş ve çıkış hareketlerini CFO Merkezi → Stok sayfasından listeleyin.
3. Tarihe göre sıralayın ve hangi işlemin negatife düşürdüğünü belirleyin.
4. Seçenekler:
   - **Düzeltici alım kaydı:** Eksik miktarı geriye dönük alım hareketi ile tamamlayın.
   - **Hatalı çıkış kaydını düzeltme:** Hatalı çıkış kaydını iptal edip doğru miktarla yeniden girin.
5. Stok raporu yenilendiğinde bakiyenin sıfır veya üzeri olduğunu doğrulayın.

---

### 3.3 Yevmiye kaydı eksik

**Belirti:**  
Girilen bir işlem (fatura, ödeme vb.) için beklenen yevmiye kaydı oluşturulmamış. CFO Merkezi → Yevmiye Defteri'nde ilgili kayıt görünmüyor.

**Olası Neden:**  
GL modu shadow konumunda (otomatik kayıt oluşturulmuyor); işlem tamamlanmadan kaydedilmiş; uygulama hatası.

**Çözüm Adımları:**
1. CFO Merkezi → GL Ayarları sayfasını açın.
2. Mevcut GL modunu kontrol edin.
   - Eğer mod **shadow** ise, GL kayıtları henüz aktif değildir. Paralel moda geçiş için [Güncelleme Kılavuzu — GL Mod Yükseltme](GUNCELLEME_KILAVUZU.md#4-gl-mod-yükseltme-yolu) bölümüne başvurun.
   - Eğer mod **parallel** veya **gl_primary** ise bir sonraki adıma geçin.
3. İlgili fatura veya ödeme kaydını açın ve "Yevmiye Kaydı Oluştur" veya "GL'ye Aktar" seçeneğini arayın.
4. Kayıt manuel olarak oluşturulamıyorsa destek ekibiyle iletişime geçin ve işlem ID'sini bildirin.

---

## 4. GL Mod Sorunları

### 4.1 Paralel modda uyarılar görünüyor

**Belirti:**  
CFO Merkezi → Mizan sayfasında "Eski Bakiye" ile "GL Bakiyesi" sütunları arasında farklar var. Uyarı simgeleri görünüyor.

**Olası Neden:**  
Geçmişte girilen bazı işlemler GL formatına henüz dönüştürülmemiş (backfill eksik) veya iki sistem arasında hesaplama farklılığı mevcut.

**Mutabakat Prosedürü:**
1. CFO Merkezi → GL Mutabakatı sayfasını açın.
2. **"Fark Raporu"** bölümünden hangi hesaplarda uyumsuzluk olduğunu inceleyin.
3. Her uyumsuz satır için:
   a. Eski sistemdeki işlem detaylarını inceleyin
   b. GL kaydının doğru hesap kodu ile eşleşip eşleşmediğini kontrol edin
   c. Gerekirse hesap eşleme tablosunu güncelleyin
4. Mutabakat tamamlandıktan sonra fark sütunu sıfırlanmalıdır.

---

### 4.2 GL Primary geçişi başarısız

**Belirti:**  
"GL Primary'e Geç" düğmesine tıklandığında hata mesajı alınıyor veya geçiş tamamlanmıyor.

**Olası Neden:**  
Geçiş koşulları henüz sağlanmamış: mutabakat eksik, açık dönem kapanışları var veya minimum 30 gün paralel mod süresi dolmamış.

**Çözüm Adımları:**
1. Sistem, geçiş engelleyen koşulları ekranda listeler. Bu listeyi dikkatlice okuyun.
2. Her engeli tek tek giderin:
   - **Mutabakat eksik:** 4.1 mutabakat prosedürünü uygulayın
   - **Açık dönem kapanışları:** CFO Merkezi → Dönem Kapanışı sayfasından bekleyen kapanışları tamamlayın
   - **30 gün dolmadı:** Sistemin belirlediği tarihe kadar bekleyin
3. Tüm engeller giderildiğinde geçişi yeniden deneyin.

---

### 4.3 Backfill tamamlanmadı

**Belirti:**  
Paralel moda geçildiğinde "Backfill devam ediyor..." mesajı uzun süre ekranda kalıyor veya backfill durumu ilerlemiyor.

**Olası Neden:**  
Çok büyük veri seti; Vercel serverless fonksiyon zaman aşımı; veritabanı bağlantı sorunu.

**Çözüm Adımları:**
1. Vercel panosunda **Functions Logs** sayfasını açın.
2. `backfill` içeren log girişlerini filtreleyin.
3. Zaman aşımı hatası varsa:
   a. CFO Merkezi → GL Ayarları → **"Backfill'i Yeniden Başlat"** seçeneğini kullanın.
   b. Backfill küçük gruplar halinde (batch) çalışacaktır; her seferinde bir miktar ilerleme kaydedecektir.
4. Hâlâ ilerleme kaydedilmiyorsa Supabase SQL Editor'den şu sorguyu çalıştırın:
   ```sql
   SELECT COUNT(*) FROM public.journal_entries
   WHERE gl_migrated = false OR gl_migrated IS NULL;
   ```
5. Sonuç sıfır değilse destek ekibiyle iletişime geçin ve sonuç sayısını bildirin.

---

## 5. E-posta Sorunları

### 5.1 E-posta gitmiyor

**Belirti:**  
Kullanıcılar e-posta bildirimi almıyor. Şifre sıfırlama e-postaları, onay e-postaları veya özet bildirimleri iletilmiyor.

**Olası Neden:**  
`RESEND_API_KEY` tanımlanmamış veya hatalı; gönderici domain Resend'de doğrulanmamış; Resend hesabı günlük limit aşmış.

**Çözüm Adımları:**
1. Vercel **Environment Variables** bölümünde `RESEND_API_KEY` değerinin tanımlı olduğunu doğrulayın.
2. https://resend.com/dashboard adresinde hesabınıza giriş yapın.
3. **API Keys** bölümünde kullanılan anahtarın aktif olduğunu kontrol edin.
4. **Domains** bölümünde `RESEND_FROM_EMAIL` değerinde kullandığınız domain'in "Verified" durumunda olduğunu doğrulayın. Doğrulanmamış domain'den e-posta gönderilemez.
5. Domain doğrulama için Resend size DNS kayıtları sağlar (TXT ve MX kayıtları). Bu kayıtları domain sağlayıcınızın DNS ayarlarına ekleyin.
6. Domain doğrulandıktan sonra test e-postası gönderin.

---

### 5.2 Cron digest çalışmıyor

**Belirti:**  
`ADMIN_DIGEST_EMAIL` adresine günlük veya haftalık özet e-postaları ulaşmıyor. Vercel Cron Jobs geçmişinde ilgili görev başarısız görünüyor.

**Olası Neden:**  
`CRON_SECRET` değeri eksik veya hatalı; `RESEND_API_KEY` yapılandırılmamış; e-posta gönderim limiti aşılmış.

**Çözüm Adımları:**
1. Vercel **Project Settings → Cron Jobs** sayfasını açın.
2. İlgili cron görevinin son çalışma sonucuna bakın.
3. Eğer "401 Unauthorized" hatası varsa `CRON_SECRET` değeri hatalıdır:
   a. Vercel **Environment Variables** bölümünde `CRON_SECRET` değerini kontrol edin.
   b. Değer doğruysa uygulamanın cron endpoint'inin aynı değeri beklediğini doğrulayın.
4. Eğer "500" hatası varsa `RESEND_API_KEY` veya `ADMIN_DIGEST_EMAIL` eksik olabilir:
   a. Her iki değişkeni de ortam değişkenleri tablosuna ekleyin.
   b. Yeni deploy başlatın.
5. Cron job'ı manuel olarak tetiklemek için Vercel panosundaki **"Trigger"** düğmesini kullanın.

---

## 6. Performans Sorunları

### 6.1 Sayfa yükleme yavaş

**Belirti:**  
Dashboard veya finans sayfaları 5 saniyeden uzun sürede yükleniyor. Kullanıcılar sistemi yavaş buluyor.

**Olası Neden:**  
Supabase projesi coğrafi olarak kullanıcılara uzak bir bölgede; veritabanı sorguları optimize edilmemiş; büyük veri setleri için filtresiz sorgu çalışıyor.

**Çözüm Adımları:**
1. **Supabase Bölgesi Kontrolü:**  
   Supabase **Settings → General** sayfasında projenizin bölgesini görün. Türkiye'deki kullanıcılar için `eu-central-1` (Frankfurt) bölgesi en iyisidir. Farklı bir bölgedeyseniz Supabase projesini migrate etmeyi değerlendirin.

2. **Sorgu Optimizasyonu:**  
   Supabase **Database → Query Performance** sayfasını açın. En yavaş sorguları listeleyin. Sık kullanılan filtre sütunlarında index eksikse aşağıdaki şekilde index ekleyebilirsiniz:
   ```sql
   -- Örnek: journal_entries tablosunda company_id'ye index
   CREATE INDEX IF NOT EXISTS idx_journal_entries_company_id
   ON public.journal_entries(company_id);
   
   -- Örnek: invoices tablosunda date ve company_id'ye bileşik index
   CREATE INDEX IF NOT EXISTS idx_invoices_company_date
   ON public.invoices(company_id, date DESC);
   ```

3. **Tarih Aralığı Filtreleme:**  
   Büyük veri setlerinde raporlama sayfalarında mümkün olan en kısa tarih aralığını seçin. Tüm zaman için açık sorgu çalıştırmak performansı önemli ölçüde etkiler.

---

### 6.2 Zaman aşımı hataları

**Belirti:**  
Büyük raporlar oluşturulurken veya veri dışa aktarılırken "Request timeout" veya "504 Gateway Timeout" hatası alınıyor.

**Olası Neden:**  
Vercel serverless fonksiyonların varsayılan zaman aşımı süresi (10 saniye) büyük veri işlemleri için yetersiz; büyük veri seti tek seferde sorgulanmaya çalışılıyor.

**Çözüm Adımları:**
1. Rapor tarih aralığını daraltın. Örneğin yıllık rapor yerine aylık rapor oluşturun, ardından birleştirin.
2. Eğer PDF raporlama zaman aşımı veriyorsa:
   a. Raporu daha küçük bölümlere ayırın (örn. üç aylık dönemler).
   b. Sabah erken saatlerde (az kullanım zamanında) rapor alın.
3. Supabase **Database → Extensions** bölümünde `pg_stat_statements` uzantısının aktif olduğunu kontrol edin — bu uzantı yavaş sorguların tespitine yardımcı olur.
4. Vercel Pro planında fonksiyon zaman aşımı süresi 60 saniyeye kadar artırılabilir. **Project Settings → Functions** bölümünden zaman aşımını ayarlayın.

---

## Destek Almak

Bu kılavuzda çözüm bulamadığınız bir sorunla karşılaşırsanız aşağıdaki bilgileri hazırlayarak destek ekibimize başvurun:

1. **Sorunun tam tanımı:** Ne yapmaya çalışıyordunuz ve ne oldu?
2. **Hata mesajı:** Varsa ekran görüntüsü veya kopyalanmış hata metni
3. **Flowra sürümü:** Dashboard üst köşesindeki versiyon bilgisi
4. **Supabase proje ID'si:** Settings → General sayfasından
5. **Vercel deployment ID'si:** Başarısız deployin ID'si
6. **Etkilenen kullanıcı sayısı:** Tek kullanıcı mı, tüm kullanıcılar mı?
7. **İlk kez mi, tekrarlayan mı:** Sorun ne zaman başladı?

---

*Bu kılavuz düzenli olarak güncellenmektedir. En güncel versiyon için dokümantasyon deposunu inceleyiniz.*
