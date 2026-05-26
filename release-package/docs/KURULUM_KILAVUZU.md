# Flowra — Kurulum Kılavuzu

**Sürüm:** 1.0  
**Son Güncelleme:** Mayıs 2026  
**Hedef Kitle:** Sistem yöneticileri, IT ekipleri ve teknik olmayan kurulum sorumluları

---

## İçindekiler

1. [Kurulum Öncesi Gereksinimler](#1-kurulum-öncesi-gereksinimler)
2. [Adım 1 — Supabase Projesi Oluşturma](#adım-1--supabase-projesi-oluşturma)
3. [Adım 2 — Veritabanı Şemasını Kurma (SQL)](#adım-2--veritabanı-şemasını-kurma-sql)
4. [Adım 3 — GitHub Reposunu Hazırlama](#adım-3--github-reposunu-hazırlama)
5. [Adım 4 — Vercel Hesabı ve Proje Bağlantısı](#adım-4--vercel-hesabı-ve-proje-bağlantısı)
6. [Adım 5 — Ortam Değişkenlerini Tanımlama](#adım-5--ortam-değişkenlerini-tanımlama)
7. [Adım 6 — İlk Admin Kullanıcısını Oluşturma](#adım-6--i̇lk-admin-kullanıcısını-oluşturma)
8. [Adım 7 — Prodüksiyon Deploy](#adım-7--prodüksiyon-deploy)
9. [Adım 8 — Kurulum Doğrulama](#adım-8--kurulum-doğrulama)
10. [Ortam Değişkenleri Referans Tablosu](#ortam-değişkenleri-referans-tablosu)
11. [Sık Sorulan Sorular](#sık-sorulan-sorular)

---

## 1. Kurulum Öncesi Gereksinimler

Flowra'yı başarıyla kurabilmek için aşağıdaki hesaplara ve araçlara sahip olmanız gerekmektedir. Kuruluma başlamadan önce bu listeyi eksiksiz tamamlayın.

### Zorunlu Hesaplar

| Hesap | Açıklama | Bağlantı |
|---|---|---|
| **Supabase** | Veritabanı ve kimlik doğrulama altyapısı | https://supabase.com |
| **Vercel** | Uygulama barındırma ve deploy platformu | https://vercel.com |
| **GitHub** | Kaynak kod deposu (repo erişimi gerekli) | https://github.com |

### Teknik Gereksinimler

- **Node.js 18 veya üstü** — Yerel geliştirme için gereklidir. Üretim ortamı Vercel tarafından otomatik yönetilir.
- **Modern web tarayıcısı** — Google Chrome veya Microsoft Edge (son sürüm) önerilir.
- **Stabil internet bağlantısı** — SQL dosyalarını yüklemek ve deploy süreçleri için geniş bant önerilir.

### Hazırlık Kontrol Listesi

Kuruluma başlamadan önce şunları onaylayın:

- [ ] Supabase hesabı açık ve giriş yapılmış
- [ ] Vercel hesabı açık ve giriş yapılmış
- [ ] GitHub reposuna erişim sağlanmış (ya fork ya da organizasyon üyeliği)
- [ ] `FLOWRA_PRODUCTION_INSTALL.sql` dosyası elinizde mevcut
- [ ] Şirket adı, admin e-posta ve şifre bilgileri kararlaştırılmış
- [ ] Planlı bakım penceresi ayarlanmış (ilk kurulum yaklaşık 45–60 dakika sürer)

---

## Adım 1 — Supabase Projesi Oluşturma

Supabase, Flowra'nın tüm verilerini ve kullanıcı oturumlarını yöneten bulut veritabanı platformudur.

### 1.1 Yeni Proje Oluşturma

1. https://supabase.com adresine gidin ve hesabınıza giriş yapın.
2. Sol üst köşedeki **"New Project"** düğmesine tıklayın.
3. Aşağıdaki bilgileri doldurun:

   - **Name:** `flowra-production` (ya da şirketinize uygun bir ad)
   - **Database Password:** Güçlü ve benzersiz bir şifre belirleyin. Bu şifreyi güvenli bir yerde saklayın — ileride gerekecektir.
   - **Region:** Türkiye'ye en yakın bölgeyi seçin. Şu anda `Central EU (Frankfurt)` en iyi seçenektir.
   - **Pricing Plan:** Başlangıç için **Free** plan kullanılabilir; prodüksiyon için **Pro** plan önerilir.

4. **"Create new project"** düğmesine tıklayın.
5. Proje oluşturma işlemi 1–2 dakika sürebilir. Tamamlandığında proje panosuna yönlendirileceksiniz.

### 1.2 API Anahtarlarını Kaydetme

Proje oluşturulduktan sonra API anahtarlarınızı kaydedin. Bu anahtarlar Vercel'de ortam değişkeni olarak kullanılacaktır.

1. Sol menüden **Settings → API** yolunu izleyin.
2. Şu değerleri not alın:

   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` değişkenine girecek
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` değişkenine girecek
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` değişkenine girecek (Bu anahtarı kimseyle paylaşmayın)

> **Güvenlik Uyarısı:** `service_role` anahtarı tam veritabanı erişimi sağlar. Bu değeri asla kaynak kod içine yazmayın, GitHub'a yüklemeyin ve üçüncü kişilerle paylaşmayın.

---

## Adım 2 — Veritabanı Şemasını Kurma (SQL)

Flowra'nın çalışabilmesi için veritabanında yüzlerce tablo, fonksiyon ve kural tanımlanmalıdır. Bu işlem tek bir SQL dosyası aracılığıyla gerçekleştirilir.

### 2.1 SQL Editörünü Açma

1. Supabase projenizin panosunda sol menüden **SQL Editor** seçeneğine tıklayın.
2. Ekranın üst kısmındaki **"New Query"** düğmesine tıklayın.
3. Boş bir sorgu editörü açılacaktır.

### 2.2 SQL Dosyasını Çalıştırma

1. `FLOWRA_PRODUCTION_INSTALL.sql` dosyasını bir metin editörüyle açın (Not Defteri, VS Code vb.).
2. Dosyanın tüm içeriğini seçin (`Ctrl+A` veya `Cmd+A`) ve kopyalayın (`Ctrl+C` veya `Cmd+C`).
3. Supabase SQL Editor alanına yapıştırın (`Ctrl+V` veya `Cmd+V`).
4. Ekranın sağ alt köşesindeki **"Run"** düğmesine tıklayın (veya `Ctrl+Enter` / `Cmd+Enter` kısayolunu kullanın).

### 2.3 Kurulum Başarısını Doğrulama

SQL çalışmasının ardından terminal çıktısı alanında aşağıdaki mesajı görmelisiniz:

```
Success. No rows returned.
```

Herhangi bir kırmızı hata mesajı görürseniz [Sorun Giderme Kılavuzu'na](SORUN_GIDERME_KILAVUZU.md) başvurun.

> **Not:** SQL dosyası yaklaşık 2.000–5.000 satır içerir. Çalıştırma süresi internet hızına ve Supabase bölgesine göre 10–60 saniye arasında değişebilir. Sayfa yüklenmeye devam ediyorsa sabırla bekleyin — tarayıcı sekmesini kapatmayın.

### 2.4 Tablo Kurulumunu Kontrol Etme

1. Sol menüden **Table Editor** seçeneğine tıklayın.
2. Aşağıdaki tabloların listede göründüğünü doğrulayın:
   - `companies`
   - `users`
   - `company_members`
   - `journal_entries`
   - `partners`
   - `invoices`
   - `accounts`

Bu tablolar görünüyorsa kurulum başarıyla tamamlanmıştır.

---

## Adım 3 — GitHub Reposunu Hazırlama

1. Flowra GitHub reposuna gidin ve kendi organizasyonunuza **fork** edin (ya da organizasyon yöneticinizden erişim talep edin).
2. Reponun `main` dalının güncel olduğundan emin olun.
3. Herhangi bir yerel değişiklik yapmaya gerek yoktur — tüm yapılandırma Vercel üzerinden ortam değişkenleri aracılığıyla gerçekleştirilecektir.

---

## Adım 4 — Vercel Hesabı ve Proje Bağlantısı

### 4.1 Yeni Proje Oluşturma

1. https://vercel.com adresine gidin ve hesabınıza giriş yapın.
2. **"Add New... → Project"** seçeneğine tıklayın.
3. **"Import Git Repository"** bölümünde GitHub entegrasyonunu etkinleştirin.
4. Flowra reposunu listeden bulun ve **"Import"** düğmesine tıklayın.

### 4.2 Temel Yapılandırma

Proje içe aktarma ekranında:

- **Framework Preset:** Next.js (otomatik seçilmiş olmalıdır)
- **Root Directory:** `./` (değiştirmeyin)
- **Build Command:** Boş bırakın (varsayılan kullanılır: `next build`)
- **Output Directory:** Boş bırakın

> **Önemli:** Henüz "Deploy" düğmesine basmayın. Önce ortam değişkenlerini tanımlamanız gerekir.

---

## Adım 5 — Ortam Değişkenlerini Tanımlama

Bu adım kurulumun en kritik aşamasıdır. Yanlış veya eksik ortam değişkenleri uygulamanın çalışmamasına neden olur.

### 5.1 Vercel Ortam Değişkenleri Sayfasına Gitme

1. Vercel proje içe aktarma ekranında **"Environment Variables"** bölümüne inin.
2. Ya da proje oluşturulduktan sonra: **Project Settings → Environment Variables** yolunu izleyin.

### 5.2 Değişkenleri Girme

Her değişken için **"Key"** ve **"Value"** alanlarını doldurun, ardından **"Add"** düğmesine tıklayın.

Aşağıdaki tablodaki tüm `[GEREKLİ]` değişkenleri mutlaka girilmelidir:

| Değişken | Durum | Değer |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | GEREKLİ | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | GEREKLİ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | GEREKLİ | Supabase service_role key |
| `NEXT_PUBLIC_APP_URL` | GEREKLİ | `https://sizin-domain.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | GEREKLİ | `https://sizin-domain.vercel.app` |
| `CRON_SECRET` | GEREKLİ | Rastgele güçlü bir şifre (min. 32 karakter) |
| `RESEND_API_KEY` | opsiyonel | E-posta bildirimleri için Resend API anahtarı |
| `RESEND_FROM_EMAIL` | opsiyonel | Gönderici e-posta adresi (ör: `noreply@sirket.com`) |
| `ADMIN_DIGEST_EMAIL` | opsiyonel | Günlük özet e-postalarının gideceği adres |
| `ANTHROPIC_API_KEY` | opsiyonel | AI destekli özetler için Anthropic API anahtarı |
| `LOG_LEVEL` | opsiyonel | `info` veya `debug` (varsayılan: `info`) |
| `ENABLE_SEED` | sadece geliştirme | Üretimde KULLANMAYIN |
| `ENABLE_RESET` | sadece geliştirme | Üretimde KULLANMAYIN |

> **Kritik Uyarı:** `ENABLE_SEED` ve `ENABLE_RESET` değişkenlerini prodüksiyon ortamına **asla** eklemeyin. Bu değişkenler veritabanını sıfırlama ve test verisi yükleme işlevleri içerir; yanlışlıkla etkinleştirilmesi veri kaybına yol açar.

### 5.3 CRON_SECRET Oluşturma

`CRON_SECRET` değişkeni için rastgele ve güçlü bir değer oluşturun. Aşağıdaki yöntemlerden birini kullanabilirsiniz:

- **Online araç:** https://generate-secret.vercel.app/32 adresini ziyaret edin
- **Terminal (Mac/Linux):** `openssl rand -hex 32`
- **Manuel:** En az 32 karakter, büyük/küçük harf, rakam ve özel karakterler içeren bir dizi

Bu değeri güvenli bir yerde saklayın — Vercel Cron Jobs doğrulaması için gereklidir.

---

## Adım 6 — İlk Admin Kullanıcısını Oluşturma

### 6.1 Supabase Auth Üzerinden Kullanıcı Oluşturma

1. Supabase panosunda sol menüden **Authentication → Users** yolunu izleyin.
2. **"Add user"** düğmesine tıklayın.
3. Admin kullanıcısının e-posta adresini ve şifresini girin.
4. **"Create user"** düğmesine tıklayın.
5. Oluşturulan kullanıcının **User UID** değerini kopyalayın (tablo üzerinde görünür).

### 6.2 Admin Rolü Atama

1. Supabase SQL Editor'ü açın.
2. Aşağıdaki SQL sorgusunu kopyalayıp yapıştırın; `<USER_UID>` yerine yukarıda kopyaladığınız UID'yi yazın:

```sql
-- Admin kullanıcısına şirket üyeliği ve rol atama
-- <USER_UID> değerini gerçek kullanıcı UID'si ile değiştirin
-- <COMPANY_ID> değerini şirket ID'si ile değiştirin (ilk kurulumda 1 olabilir)

UPDATE public.company_members
SET role = 'admin'
WHERE user_id = '<USER_UID>';
```

3. Eğer henüz şirket kaydı oluşturulmadıysa, Flowra'nın ilk açılışında uygulama üzerinden şirket kurulum sihirbazını kullanın.

---

## Adım 7 — Prodüksiyon Deploy

### 7.1 İlk Deploy'u Başlatma

1. Vercel proje sayfasına dönün.
2. Tüm ortam değişkenlerini girdiğinizi doğrulayın.
3. **"Deploy"** düğmesine tıklayın.
4. Deploy süreci 2–5 dakika sürebilir. Vercel build loglarını canlı izleyebilirsiniz.

### 7.2 Deploy Başarısını Kontrol Etme

Deploy tamamlandığında:

1. Vercel size bir URL verecektir (ör: `https://flowra-production.vercel.app`).
2. Bu URL'yi tarayıcınızda açın.
3. Flowra giriş sayfasının yüklendiğini doğrulayın.

Herhangi bir hata sayfası görüyorsanız Vercel **"Deployments → Functions Logs"** bölümünden hata mesajlarını inceleyin.

### 7.3 Özel Domain Bağlama (İsteğe Bağlı)

Kendi domain adınızı kullanmak istiyorsanız:

1. Vercel **Project Settings → Domains** bölümüne gidin.
2. **"Add Domain"** düğmesine tıklayın ve domain adınızı girin.
3. Vercel size DNS kayıt bilgilerini (CNAME veya A kaydı) gösterecektir.
4. Bu kayıtları domain sağlayıcınızın yönetim panelinde DNS ayarlarına ekleyin.
5. DNS yayılması 5 dakika ile 48 saat arasında sürebilir.
6. Domain aktif olduktan sonra `NEXT_PUBLIC_APP_URL` ve `NEXT_PUBLIC_SITE_URL` değişkenlerini yeni domain adresiyle güncelleyin ve yeniden deploy edin.

---

## Adım 8 — Kurulum Doğrulama

Kurulumu tamamladıktan sonra aşağıdaki kontrolleri gerçekleştirin.

### 8.1 Giriş Testi

1. Flowra URL'sini tarayıcınızda açın.
2. Adım 6'da oluşturduğunuz admin kullanıcısının e-posta ve şifresiyle giriş yapın.
3. Dashboard'a yönlendirildiğinizi doğrulayın.

### 8.2 Şirket Kurulum Sihirbazı

İlk girişte Flowra şirket kurulum sihirbazını başlatacaktır:

1. **Şirket Adı:** Resmi şirket unvanını girin.
2. **Ortak Bilgileri:** Varsa ortakların ad, e-posta ve sermaye bilgilerini girin.
3. **Muhasebe Başlangıç Tarihi:** Hesap döneminin başladığı tarihi seçin.
4. **Tamamla** düğmesine tıklayın.

### 8.3 Sağlık Kontrolü

Aşağıdaki sayfaları ziyaret ederek sistemin çalıştığını doğrulayın:

| Test | URL | Beklenen Sonuç |
|---|---|---|
| Ana sayfa yükleme | `/` | Giriş sayfası görünür |
| Dashboard | `/dashboard` | CEO Komuta Merkezi yüklenir |
| Finans modülü | `/dashboard/finance` | Sekme başlıkları görünür |
| API sağlık | `/api/health` | `{"status":"ok"}` döner |

### 8.4 Cron Jobs Doğrulaması

Vercel **Project Settings → Cron Jobs** bölümünü açın. Aşağıdaki zamanlanmış görevlerin listelendiğini doğrulayın:

| Görev | Zamanlama |
|---|---|
| `/api/cron/overdue-update` | `30 0 * * *` |
| `/api/cron/interest-accrual` | `0 1 * * *` |
| `/api/cron/workflow-expire` | `0 2 * * *` |
| `/api/cron/governance-snapshot` | `0 3 1 * *` |

---

## Ortam Değişkenleri Referans Tablosu

Aşağıdaki tablo tüm ortam değişkenlerinin kapsamlı açıklamasını içerir.

| Değişken | Durum | Açıklama |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **[GEREKLİ]** | Supabase projenizin API URL'si. `https://xxxx.supabase.co` formatındadır. Supabase → Settings → API sayfasından alınır. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **[GEREKLİ]** | Supabase public/anonymous anahtarı. Frontend kodunda kullanılır, gizli değildir. |
| `SUPABASE_SERVICE_ROLE_KEY` | **[GEREKLİ]** | Supabase servis rolü anahtarı. Tam veritabanı erişimi sağlar. Kesinlikle gizli tutulmalıdır. |
| `NEXT_PUBLIC_APP_URL` | **[GEREKLİ]** | Uygulamanın tam URL'si (ör: `https://flowra.sirket.com`). Yönlendirmeler için kullanılır. |
| `NEXT_PUBLIC_SITE_URL` | **[GEREKLİ]** | Sitenin tam URL'si. Supabase Auth e-posta şablonlarında kullanılır. |
| `CRON_SECRET` | **[GEREKLİ]** | Zamanlanmış görevlerin güvenlik anahtarı. En az 32 karakter olmalıdır. |
| `RESEND_API_KEY` | [opsiyonel — e-posta özellikleri için] | Resend e-posta servisi API anahtarı. E-posta bildirimleri ve özetler için gereklidir. |
| `RESEND_FROM_EMAIL` | [opsiyonel] | E-posta bildirimlerinin gönderileceği "kimden" adresi. Resend'de doğrulanmış domain kullanılmalıdır. |
| `ADMIN_DIGEST_EMAIL` | [opsiyonel] | Günlük/haftalık yönetici özet e-postalarının iletileceği adres. |
| `ANTHROPIC_API_KEY` | [opsiyonel — AI özetleri için] | Claude AI destekli durum özetleri ve anomali açıklamaları için Anthropic API anahtarı. |
| `LOG_LEVEL` | [opsiyonel] | Sunucu log seviyesi. `info` (varsayılan) veya `debug` değerleri alır. |
| `ENABLE_SEED` | [sadece geliştirme — üretimde kullanmayın] | `true` ayarlandığında test verisi yükler. Üretimde kesinlikle kullanılmamalıdır. |
| `ENABLE_RESET` | [sadece geliştirme — üretimde kullanmayın] | `true` ayarlandığında tüm veritabanını sıfırlar. Üretimde kesinlikle kullanılmamalıdır. |

---

## Sık Sorulan Sorular

**S: Supabase Free plan ile prodüksiyon kullanabilir miyim?**  
C: Küçük ekipler için başlangıçta kullanılabilir; ancak Free plan aylık 500 MB depolama ve 2 GB bant genişliği sınırı içerir. Aktif kullanım için Pro plan önerilir.

**S: SQL dosyasını çalıştırırken hata aldım, ne yapmalıyım?**  
C: [Sorun Giderme Kılavuzu'nda](SORUN_GIDERME_KILAVUZU.md) "Kurulum Sorunları" bölümünü inceleyin. En sık karşılaşılan sorun, SQL dosyasının kısmen kopyalanmasıdır — tüm dosyayı seçtiğinizden emin olun.

**S: Vercel yerine kendi sunucumda barındırabilir miyim?**  
C: Evet. Flowra bir Next.js uygulamasıdır ve `next start` komutuyla herhangi bir Node.js 18+ sunucusunda çalışabilir. Ancak Cron Jobs için ayrı bir zamanlayıcı (cron daemon veya benzeri) kurmanız gerekir.

**S: Birden fazla şirket için ayrı kurulum yapmam gerekiyor mu?**  
C: Hayır. Flowra çoklu şirket mimarisini destekler. Tek bir kurulumda birden fazla şirket yönetilebilir.

**S: Ortam değişkenlerini sonradan değiştirebilir miyim?**  
C: Evet. Vercel **Project Settings → Environment Variables** sayfasından değiştirebilirsiniz. Değişiklikler için yeni bir deploy başlatmanız gerekir.

---

*Bu kılavuz hakkında sorularınız için destek ekibimizle iletişime geçin.*
