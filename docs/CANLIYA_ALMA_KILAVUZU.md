# Flowra — Canlıya Alma Kılavuzu

**Sürüm:** 1.0  
**Son Güncelleme:** Mayıs 2026  
**Hedef Kitle:** Proje yöneticileri, IT sorumluları ve üst yönetim

---

## İçindekiler

1. [Canlıya Alma Nedir?](#1-canlıya-alma-nedir)
2. [Canlıya Alma Öncesi Kontrol Listesi](#2-canlıya-alma-öncesi-kontrol-listesi)
3. [Supabase Prodüksiyon Ayarları](#3-supabase-prodüksiyon-ayarları)
4. [Vercel Prodüksiyon Ayarları](#4-vercel-prodüksiyon-ayarları)
5. [Güvenlik Kontrolü](#5-güvenlik-kontrolü)
6. [İlk Şirket Kurulumu](#6-i̇lk-şirket-kurulumu)
7. [Veri Migration (Mevcut Sistemden Geçiş)](#7-veri-migration-mevcut-sistemden-geçiş)
8. [GL Mod Aktivasyonu](#8-gl-mod-aktivasyonu)
9. [Canlıya Alma Sonrası İzleme — İlk 48 Saat](#9-canlıya-alma-sonrası-i̇zleme--i̇lk-48-saat)
10. [Destek ve Eskalasyon](#10-destek-ve-eskalasyon)

---

## 1. Canlıya Alma Nedir?

Canlıya alma (go-live), Flowra'nın test veya geliştirme ortamından gerçek işletme verilerinin işlendiği prodüksiyon ortamına geçişidir. Bu aşamadan sonra sistem aktif kullanıma girer ve finansal veriler Flowra üzerinde yönetilmeye başlanır.

**Canlıya alma bir kez yapılır ve geri alınması ciddi prosedürler gerektirir.** Bu nedenle bu kılavuzdaki her adımı dikkatle uygulayın ve kontrol listesindeki her maddeyi eksiksiz tamamlayın.

---

## 2. Canlıya Alma Öncesi Kontrol Listesi

Aşağıdaki maddeler canlıya almaya hazır olunduğunu onaylar. Her maddeyi tamamladığınızda yanındaki kutuyu işaretleyin. **Tüm maddeler tamamlanmadan canlıya alma yapılmamalıdır.**

### Teknik Hazırlık

- [ ] `FLOWRA_PRODUCTION_INSTALL.sql` Supabase'de başarıyla çalıştırıldı
- [ ] Tüm zorunlu ortam değişkenleri Vercel'de tanımlandı
- [ ] Vercel'de prodüksiyon deploy başarıyla tamamlandı
- [ ] Uygulama URL'si tarayıcıda açılıyor ve giriş sayfası görünüyor
- [ ] `/api/health` endpoint'i `{"status":"ok"}` döndürüyor
- [ ] `ENABLE_SEED` ve `ENABLE_RESET` değişkenleri prodüksiyon ortamında **tanımlı değil**
- [ ] Tüm 4 cron job Vercel panosunda görünüyor ve aktif

### Supabase Güvenlik

- [ ] Row Level Security (RLS) tüm tablolarda aktif
- [ ] `service_role` anahtarı sadece Vercel ortam değişkeninde; başka hiçbir yerde paylaşılmadı
- [ ] Supabase Auth → Email Auth etkin
- [ ] Supabase Auth → Site URL doğru prodüksiyon URL'sini gösteriyor
- [ ] Supabase Auth → Redirect URLs listesinde prodüksiyon domaini mevcut

### Güvenlik

- [ ] `CRON_SECRET` en az 32 karakter ve karmaşık bir değer içeriyor
- [ ] Admin kullanıcısının şifresi güçlü (en az 12 karakter, büyük/küçük harf, rakam, özel karakter)
- [ ] Prodüksiyon veritabanına yetkisiz erişim yolları kapatıldı
- [ ] Vercel proje ayarları incelendi; sadece yetkili ekip üyeleri proje üyesi

### Veri Hazırlığı

- [ ] Şirket bilgileri hazırlandı (unvan, adres, vergi no)
- [ ] İlk admin kullanıcısı oluşturuldu ve test edildi
- [ ] Varsa aktarılacak mevcut veriler hazırlandı ve doğrulandı
- [ ] Ortak listesi ve sermaye dağılımı kararlaştırıldı
- [ ] Hesap dönemi başlangıç tarihi belirlendi

### İşletme Hazırlığı

- [ ] Kullanıcı eğitimi tamamlandı veya planlandı
- [ ] Kullanıcı hesapları oluşturuldu ve roller atandı
- [ ] Destek iletişim bilgileri kullanıcılara iletildi
- [ ] Canlıya alma tarihi ve saati tüm paydaşlarla paylaşıldı
- [ ] Geri alma planı hazırlandı ve belgelendi
- [ ] Bakım penceresi açıklandı

---

## 3. Supabase Prodüksiyon Ayarları

### 3.1 Row Level Security (RLS) Doğrulama

RLS, her kullanıcının yalnızca kendi şirketinin verilerine erişebilmesini sağlayan kritik güvenlik mekanizmasıdır.

1. Supabase panosunda **Database → Tables** sayfasını açın.
2. Her ana tablo için (companies, journal_entries, partners, invoices vb.) tablonun yanındaki kilit simgesinin aktif (kapalı) olduğunu doğrulayın.
3. Herhangi bir tabloda RLS aktif değilse ilgili tabloya tıklayın ve **"Enable RLS"** düğmesine basın.

> **Önemli:** `FLOWRA_PRODUCTION_INSTALL.sql` dosyası RLS politikalarını otomatik olarak kurar. Eğer kurulum düzgün yapıldıysa bu adım yalnızca doğrulama amaçlıdır.

### 3.2 Auth Ayarları

1. Supabase **Authentication → Settings** sayfasını açın.
2. Şu ayarları doğrulayın:

   | Ayar | Doğru Değer |
   |---|---|
   | **Site URL** | `https://sizin-domain.vercel.app` (ya da özel domain) |
   | **Redirect URLs** | Aynı URL eklenmiş olmalı |
   | **Email Auth** | Etkin |
   | **Email confirmations** | Etkin (önerilen) |
   | **Secure email change** | Etkin (önerilen) |

3. **"Save"** düğmesine tıklayın.

### 3.3 E-posta Şablonları

Kullanıcılara gönderilecek kimlik doğrulama e-postalarının şirket adınızı içermesini istiyorsanız:

1. Supabase **Authentication → Email Templates** sayfasını açın.
2. **"Confirm signup"** şablonunu düzenleyin.
3. Şablon içeriğinde şirket adını ve Flowra logosunu ekleyin.
4. **"Save"** düğmesine tıklayın.

### 3.4 Prodüksiyon Planı

Aktif kullanım başlamadan önce Supabase planınızın beklenen yük için yeterli olduğunu kontrol edin:

- **Free Plan:** 500 MB depolama, 2 GB bant genişliği/ay — küçük ekipler için başlangıç
- **Pro Plan:** 8 GB depolama, 250 GB bant genişliği/ay — prodüksiyon için önerilen
- **Team Plan:** Gelişmiş destek ve SLA — kurumsal kullanım için

---

## 4. Vercel Prodüksiyon Ayarları

### 4.1 Özel Domain Bağlama

Prodüksiyonda `vercel.app` uzantısı yerine kendi domain adınızı kullanmanız önerilir:

1. Vercel **Project Settings → Domains** sayfasına gidin.
2. **"Add Domain"** düğmesine tıklayın.
3. Domain adınızı girin (ör: `flowra.sirketiniz.com`).
4. Vercel size iki seçenek sunar:
   - **CNAME kaydı:** Subdomain kullanıyorsanız (ör: `flowra.sirketiniz.com`)
   - **A kaydı:** Kök domain kullanıyorsanız (ör: `sirketiniz.com`)
5. Vercel'in gösterdiği DNS kayıtlarını domain sağlayıcınızın DNS paneline ekleyin.
6. DNS yayılması tamamlanınca Vercel domain durumu "Valid Configuration" olarak değişir.
7. SSL sertifikası otomatik olarak oluşturulur.

Domain aktif olduktan sonra:
- `NEXT_PUBLIC_APP_URL` değerini yeni domain ile güncelleyin
- `NEXT_PUBLIC_SITE_URL` değerini yeni domain ile güncelleyin
- Supabase Auth → Site URL değerini yeni domain ile güncelleyin
- Yeni deploy başlatın

### 4.2 Ortam Değişkenleri Son Kontrol

Vercel **Project Settings → Environment Variables** sayfasında şunları doğrulayın:
- Tüm 6 zorunlu değişkenin tanımlı olduğu
- `ENABLE_SEED` ve `ENABLE_RESET` değişkenlerinin **olmadığı**
- Değerlerde baştaki/sondaki boşluk olmadığı

### 4.3 Cron Jobs Aktif Kontrolü

Aşağıdaki dört cron job'ın Vercel **Project Settings → Cron Jobs** sayfasında listelendiğini doğrulayın:

| Endpoint | Zamanlama | Açıklama |
|---|---|---|
| `/api/cron/overdue-update` | `30 0 * * *` | Her gece 00:30 — vadesi geçmiş borç/alacak güncelleme |
| `/api/cron/interest-accrual` | `0 1 * * *` | Her gece 01:00 — faiz tahakkuku hesaplama |
| `/api/cron/workflow-expire` | `0 2 * * *` | Her gece 02:00 — süresi geçen iş akışlarını kapatma |
| `/api/cron/governance-snapshot` | `0 3 1 * *` | Her ayın 1'i saat 03:00 — yönetişim anlık görüntüsü |

Cron jobs listede görünmüyorsa `vercel.json` dosyasındaki cron tanımlarını kontrol edin ve yeni deploy başlatın.

---

## 5. Güvenlik Kontrolü

### 5.1 SERVICE_ROLE_KEY Gizliliği

Bu, Flowra'nın en kritik güvenlik kuralıdır:

- `SUPABASE_SERVICE_ROLE_KEY` değerini **asla** kaynak koda yazmayın
- Bu değeri e-posta, Slack veya WhatsApp üzerinden **asla** paylaşmayın
- Değeri GitHub, GitLab veya benzeri platforma **asla** yüklemeyin
- Yalnızca Vercel ortam değişkenleri üzerinde tanımlı olmalıdır

Eğer bu anahtar herhangi bir kanalda sızdıysa:
1. Supabase **Settings → API → service_role** anahtarını hemen yenileyin
2. Yeni anahtarı Vercel'de güncelleyin
3. Yeni deploy başlatın

### 5.2 CRON_SECRET Güvenliği

- En az 32 karakter uzunluğunda
- Büyük harf, küçük harf, rakam ve özel karakter içermeli
- Yalnızca Vercel ortam değişkenlerinde tanımlı olmalı

### 5.3 ENABLE_SEED ve ENABLE_RESET

Bu iki değişken prodüksiyon ortamına **kesinlikle** eklenmemelidir:

- `ENABLE_SEED=true` → Veritabanına demo/test verisi yükler
- `ENABLE_RESET=true` → Tüm veritabanını sıfırlar

Prodüksiyon ortam değişkenleri listesini son kez kontrol edin ve bu iki değişkenin olmadığını teyit edin.

### 5.4 Admin Şifre Politikası

İlk admin kullanıcısı için:
- Minimum 12 karakter
- En az 1 büyük harf
- En az 1 küçük harf
- En az 1 rakam
- En az 1 özel karakter (!@#$%^&* vb.)
- Başka hiçbir hesapta kullanılmayan benzersiz bir şifre

---

## 6. İlk Şirket Kurulumu

### 6.1 Şirket Sihirbazı

Flowra'ya ilk girişte şirket kurulum sihirbazı otomatik olarak açılır:

1. **Şirket Bilgileri:**
   - Resmi ticaret unvanı
   - Vergi kimlik numarası
   - Adres bilgileri
   - İletişim bilgileri

2. **Muhasebe Dönemi:**
   - Hesap dönemi başlangıç tarihi (ör: 01.01.2026)
   - Para birimi (Türk Lirası varsayılan)

3. **Admin Kullanıcısı:**
   - İlk admin kullanıcısı sihirbazda onaylanır

### 6.2 Ortak Girişleri

Şirket ortaklarını PCLE modülüne eklemek için:

1. Sol menüden **PCLE → Ortak Yönetimi** sayfasına gidin.
2. Her ortak için **"Yeni Ortak Ekle"** düğmesine tıklayın.
3. Doldurun:
   - Ad Soyad veya Kurum Adı
   - TC Kimlik No veya Vergi Kimlik No
   - Sermaye miktarı ve oran (%)
   - Rol (Aktif Ortak, Yatırımcı vb.)
4. Toplam sermaye payı %100'e ulaşmalıdır.

### 6.3 Kullanıcı Davetleri

Diğer kullanıcıları sisteme davet etmek için:

1. **Ayarlar → Kullanıcı Yönetimi** sayfasına gidin.
2. **"Kullanıcı Davet Et"** düğmesine tıklayın.
3. E-posta adresi ve rol seçin:
   - **Admin:** Tüm modüllere tam erişim
   - **Manager:** Raporlama ve onay işlemleri
   - **Member:** Veri girişi ve görüntüleme
4. Davet e-postası otomatik gönderilir (RESEND_API_KEY tanımlıysa).

---

## 7. Veri Migration (Mevcut Sistemden Geçiş)

Mevcut bir muhasebe veya ERP sisteminden Flowra'ya geçiyorsanız bu bölümü izleyin.

### 7.1 Migration Kapsamı Belirleme

Aktarılacak veri türlerini belirleyin:
- [ ] Müşteri ve tedarikçi listeleri
- [ ] Açık faturalar (vadesi gelmemiş alacak/borçlar)
- [ ] Banka hesap bakiyeleri
- [ ] Stok kayıtları
- [ ] Ortak hesap bakiyeleri
- [ ] Geçmiş dönem yevmiye kayıtları

### 7.2 Başlangıç Bakiyeleri Girişi (Önerilen Yöntem)

En basit migration yöntemi:
1. Eski sistemden belirli bir tarihteki bilanço ve mizan çıktısını alın.
2. Bu tarihi Flowra'da "Migration Tarihi" olarak belirleyin.
3. Her hesap için Flowra'ya açılış bakiyesi girişi yapın.
4. Migration tarihinden itibaren tüm işlemleri Flowra'ya girin.

### 7.3 Veri Kalite Kontrolü

Migration sonrasında:
1. Flowra mizanında toplam borç = toplam alacak kontrolü
2. Nakit hesap bakiyelerinin banka ekstresine göre mutabakatı
3. Ortak hesap bakiyelerinin eski sistemle karşılaştırması

---

## 8. GL Mod Aktivasyonu

### 8.1 Shadow Mod (Varsayılan)

Canlıya alma sırasında GL modu shadow konumundadır. Bu modda:
- GL hesaplamalar arka planda sessizce çalışır
- Kullanıcı arayüzünde GL verileri gösterilmez
- Sistem normal muhasebe işlemlerini yürütür

İlk canlıya almada shadow modda kalmak uygundur. En az 30 gün veri biriktirdikten sonra paralel moda geçişi değerlendirin.

### 8.2 Ne Zaman Paralel Moda Geçilir?

Aşağıdaki koşullar sağlandığında paralel moda geçebilirsiniz:
- Canlıya almadan en az 30 gün geçti
- En az 1 tam muhasebe dönemi kaydı mevcut
- CFO veya mali müşavir GL aktivasyonunu onayladı

### 8.3 Shadow → Parallel Geçişi

1. CFO Merkezi → GL Ayarları → **"Paralel Mod Etkinleştir"**
2. Onay kutusunu işaretleyin ve admin şifrenizi girin
3. Backfill işleminin tamamlanmasını bekleyin
4. Mizan mutabakat raporunu düzenli olarak izleyin

Detaylı prosedür için [Güncelleme Kılavuzu](GUNCELLEME_KILAVUZU.md) GL Mod Yükseltme bölümüne başvurun.

---

## 9. Canlıya Alma Sonrası İzleme — İlk 48 Saat

İlk 48 saat, olası sorunların en hızlı tespit edildiği kritik dönemdir. Aşağıdaki izleme programını uygulayın.

### İlk 4 Saat

- [ ] Tüm yönetici kullanıcıların sisteme başarıyla giriş yaptığı doğrulandı
- [ ] İlk test işlemi (örn. kasa giriş kaydı) başarıyla oluşturuldu
- [ ] Fatura oluşturma ve PDF dışa aktarma test edildi
- [ ] Dashboard rakamlarının beklenenle örtüştüğü doğrulandı

### İlk 24 Saat

- [ ] Cron job'ların ilk çalışma logları incelendi (gece 00:30 - 03:00 arası)
- [ ] Herhangi bir 500 hatası için Vercel Function Logs kontrol edildi
- [ ] Supabase **Monitoring → Logs** bölümünde anormallik aranmadı
- [ ] Tüm kullanıcı rollerinin doğru çalıştığı doğrulandı

### İlk 48 Saat

- [ ] Mizan dengesi (borç = alacak) doğrulandı
- [ ] E-posta bildirimleri çalışıyor (RESEND aktifse)
- [ ] Yönetici özet raporu alındı ve incelendi
- [ ] Performans gözlemi tamamlandı (sayfa yükleme süreleri kabul edilebilir)
- [ ] Kullanıcılardan ilk geri bildirimler toplandı

### 48 Saat Sonrası Rutin İzleme

Haftalık olarak:
- Supabase depolama kullanımı
- Vercel fonksiyon başarı oranları
- Mizan dengesi
- Açık iş akışları ve onay bekleyen işlemler

---

## 10. Destek ve Eskalasyon

### Öncelik Seviyeleri

| Seviye | Tanım | Örnek |
|---|---|---|
| **Kritik (P1)** | Sistem tamamen erişilemez veya veri kaybı riski | Tüm kullanıcılar giriş yapamıyor, veritabanı hatası |
| **Yüksek (P2)** | Ana işlevler çalışmıyor ancak sistem ayakta | Fatura oluşturuluyor ama PDF alınamıyor |
| **Orta (P3)** | İkincil özellik sorunu | E-posta bildirimleri gelmiyor |
| **Düşük (P4)** | Kozmetik sorun veya öneri | Arayüz metni yanlış |

### Eskalasyon Adımları

1. **İlk kontrol:** Bu kılavuzun ilgili sorun giderme bölümünü inceleyin.
2. **İkinci kontrol:** Vercel Function Logs ve Supabase Monitoring sayfalarını inceleyin.
3. **Destek talebi:** Sorunu belgeleyip (ekran görüntüsü, hata mesajı, adımlar) destek ekibine iletin.
4. **Kritik durum:** P1 sorunda sistem yöneticisi ve destek ekibi eş zamanlı devreye alınmalıdır.

### Hızlı Bağlantılar

| Platform | Panel | Amaç |
|---|---|---|
| Supabase | https://supabase.com/dashboard | Veritabanı, Auth, Logs |
| Vercel | https://vercel.com/dashboard | Deploy, Cron, Function Logs |
| Resend | https://resend.com/dashboard | E-posta durumu, loglar |

---

*Bu kılavuz Flowra v1.0 canlıya alma sürecini kapsamaktadır. Sonraki büyük sürümler için güncellenmiş kılavuz ayrıca yayımlanacaktır.*
