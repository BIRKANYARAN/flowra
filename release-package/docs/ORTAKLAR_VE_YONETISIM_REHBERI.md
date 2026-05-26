# Ortaklar ve Yönetişim Rehberi

**Ortak Finansmanı, Sermaye Yönetimi ve Kurumsal Yönetişim Başvuru Kılavuzu**

Bu rehber, Flowra'nın ortak finansmanı modülünü (PCLE) ve yönetişim sistemini açıklar. Şirket ortakları, mali müşavirler ve yönetim kurulu üyeleri için hazırlanmıştır. Türk Ticaret Kanunu ve Gelir Vergisi Kanunu hükümleri, her ilgili başlıkta açıklanmaktadır.

---

## İçindekiler

1. [PCLE Modülüne Giriş](#1-pcle-modülüne-giriş)
2. [Tab 1 — Pozisyon Özeti](#2-tab-1--pozisyon-özeti)
3. [Tab 2 — Olay Defteri](#3-tab-2--olay-defteri)
4. [Tab 3 — Kredi Dilimleri (Trancheler)](#4-tab-3--kredi-dilimleri-trancheler)
5. [Tab 4 — Geri Ödeme Şelalesi](#5-tab-4--geri-ödeme-şelalesi)
6. [Tab 5 — Kâr Dağıtımı](#6-tab-5--kâr-dağıtımı)
7. [Tab 6 — Risk Haritası](#7-tab-6--risk-haritası)
8. [Yönetişim Sistemi](#8-yönetişim-sistemi)
9. [Mutabakat Süreci](#9-mutabakat-süreci)
10. [İş Akışları ve Onay Süreçleri](#10-i̇ş-akışları-ve-onay-süreçleri)
11. [Denetim İzi ve Hash Zinciri](#11-denetim-i̇zi-ve-hash-zinciri)
12. [Türk Mevzuatı Özeti](#12-türk-mevzuatı-özeti)

---

## 1. PCLE Modülüne Giriş

### 1.1 PCLE Nedir?

PCLE (Partner Capital & Liability Engine — Ortak Sermaye ve Yükümlülük Motoru), Flowra'nın ortaklar arasındaki finansal ilişkileri yöneten modülüdür.

Birden fazla ortağın bulunduğu şirketlerde şu sorular sıklıkla karmaşıklaşır:

- Hangi ortağın şirkete ne kadar borç verdiği
- Borç/öz kaynak dengesizliği olup olmadığı
- Kâr dağıtıldığında kimin ne kadar alacağı
- Geri ödeme yapılırken hangi sıranın uygulanacağı
- Huzur hakkı veya temettü ödemesinin yasal sınırları

PCLE bu soruların tamamına Türk mevzuatıyla uyumlu, hesaplanmış ve denetlenebilir yanıtlar üretir.

### 1.2 Modüle Erişim

Sol menüde **Ortaklar** bağlantısına tıklayın veya tarayıcıda `/dashboard/partners` adresine gidin. Sayfa altı sekmeden oluşur:

```
Pozisyon  |  Defter  |  Trancheler  |  Geri Ödeme  |  Kâr Dağıtımı  |  Risk
```

### 1.3 Ortak Ekleme

İlk kez kurulum yapıyorsanız önce ortakları tanımlamanız gerekir:

1. **Admin > Şirket Ayarları > Ortaklar** menüsüne gidin.
2. **"Ortak Ekle"** butonuna tıklayın.
3. Ortak adını ve **hisse oranını** (%) girin. Tüm ortakların hisse oranı toplamı tam olarak %100 olmalıdır.
4. Kaydedin.

Hisse oranı, kâr dağıtımı, geri ödeme şelalesi ve risk hesaplamalarında temel referans olarak kullanılır.

---

## 2. Tab 1 — Pozisyon Özeti

### 2.1 Ne Gösterir?

Pozisyon sekmesi, her ortağın anlık finansal durumunu tek ekranda özetler. Şu bilgileri içerir:

| Sütun | Açıklama |
|-------|----------|
| **Ortak Adı** | Sistemde kayıtlı ortak adı |
| **Hisse Oranı** | Toplam öz kaynaktaki yüzdesi |
| **Ödenen Sermaye** | O ortağın fiilen ödediği sermaye tutarı |
| **Taahhüt Edilen Sermaye** | Sermaye artırımında taahhüt edilen ama henüz ödenmemiş tutar |
| **Toplam Kredi Bakiyesi** | Aktif dilimlerinin kalan anapara toplamı |
| **Tahakkuk Eden Faiz** | Bugüne kadar tahakkuk etmiş ödenmemiş faiz |
| **Temettü Alacağı** | Beyan edilmiş ama henüz ödenmemiş temettü |
| **Net Pozisyon** | Ödenen sermaye + kredi bakiyesi; şirketin o ortağa olan toplam yükümlülüğü |

### 2.2 Renk Kodlaması

- **Yeşil satır:** Ortak normal pozisyonda; borç/öz kaynak dengesi kabul edilebilir sınırlar içinde.
- **Sarı satır:** Dikkat gerektiren durum; kredi orantısız büyüyor veya taahhüt edilmiş sermaye hâlâ ödenmemiş.
- **Kırmızı satır:** Kritik; VUK/KVK 13 riski (faizsiz kredi), TTK 588 ihlali riski, veya ödenmemiş sermaye kapanış dönemine girmiş.

### 2.3 Taahhüt Edilen Sermaye Neden Önemlidir?

TTK 344 uyarınca anonim şirketlerde tescil tarihinden itibaren 24 ay içinde sermayenin tamamı ödenmek zorundadır. Ödenmemiş sermaye için TTK 588'de faiz hükmü yer almaktadır. Flowra bu durumu takip ederek risk uyarısı üretir.

---

## 3. Tab 2 — Olay Defteri

### 3.1 Değiştirilemez Kayıt Prensibi

Olay Defteri, PCLE modülünde gerçekleşen tüm finansal olayların kronolojik kayıt defteridir. Bu defterdeki kayıtlar hiçbir zaman silinemez veya değiştirilemez. Hatalı bir kayıt yalnızca ters kayıtla (reversal) düzeltilebilir.

### 3.2 Olay Tipleri

| Olay Tipi | Açıklama |
|-----------|----------|
| `CAPITAL_CONTRIBUTION` | Ortak sermaye ödedi |
| `CAPITAL_COMMITMENT` | Ortak sermaye taahhüt etti (henüz ödemedi) |
| `LOAN_TRANCHE_CREATED` | Yeni kredi dilimi oluşturuldu |
| `LOAN_REPAYMENT` | Anapara geri ödemesi |
| `INTEREST_ACCRUAL` | Dönem faiz tahakkuku (otomatik) |
| `INTEREST_PAYMENT` | Faiz ödemesi |
| `DIVIDEND_DECLARED` | Kâr dağıtımı beyan edildi |
| `DIVIDEND_PAID` | Temeltü ödendi |
| `ATTENDANCE_FEE` | Huzur hakkı ödendi (TTK 394) |
| `REVERSAL` | Önceki bir olayın iptali |

### 3.3 Olayı Okuma

Her olay satırında şu bilgiler görünür:

- **Tarih:** Olayın gerçekleştiği tarih
- **Ortak:** İlgili ortak
- **Tip:** Olay kategorisi
- **Tutar:** Pozitif (şirkete giriş) veya negatif (şirketten çıkış)
- **Bakiye Etkisi:** Bu olayın net pozisyon bakiyesine etkisi
- **Referans:** İlgili iş akışı veya kullanıcı onayı
- **Fiş No:** İlgili muhasebe fişi numarası (örn. JE-2026-00147)

---

## 4. Tab 3 — Kredi Dilimleri (Trancheler)

### 4.1 Neden Dilim Sistemi?

Bir ortak şirkete farklı tarihlerde, farklı koşullarda birden fazla kredi verebilir. Her kredi dilimi bağımsız olarak takip edilir; böylece farklı faiz oranları, vade tarihleri ve geri ödeme planları net şekilde izlenebilir.

### 4.2 Yeni Dilim Ekleme

1. **Ortaklar > Trancheler** sekmesine gidin.
2. **"Yeni Dilim"** butonuna tıklayın.
3. Şu bilgileri doldurun:

| Alan | Açıklama |
|------|----------|
| Ortak | Hangi ortak krediyi veriyor |
| Anapara | Verilen kredi tutarı (TRY) |
| Faiz Oranı (%) | Yıllık faiz oranı; VUK/KVK 13 gereği piyasa oranı kullanılmalı |
| Vade Başlangıcı | Kredinin verildiği tarih |
| Vade Tarihi | Geri ödenmesi gereken son tarih |
| Vade Sınıfı | Kısa vadeli (≤12 ay → hesap 321) veya uzun vadeli (>12 ay → hesap 421) |
| Açıklama | Kredinin amacı, notlar |

4. Kaydedin. Sistem otomatik olarak:
   - `partner_loan_tranches` tablosuna kayıt ekler
   - Muhasebe fişi oluşturur: DR 102 Bankalar | CR 321/421 Ortaklara Borçlar
   - LOAN_TRANCHE_CREATED olayını Deftere ekler
   - İlk gece cron'da faiz tahakkuku başlar

### 4.3 Dilim Detay Görünümü

Her dilim satırına tıklayarak detay paneli açılır. Şunlar görülür:

- Açılış anaparası ve kalan bakiye
- Toplam tahakkuk eden faiz (bugüne kadar)
- Bugüne kadar yapılan geri ödemeler
- Tahmini tam geri ödeme tarihi (güncel ödeme temposuna göre)
- Vade aşımı varsa kırmızı uyarı ve gecikme gün sayısı

### 4.4 Faiz Tahakkuku Mekanizması

Her gece çalışan cron görevi, aktif tüm dilimler için günlük faiz hesaplar:

```
Günlük Faiz = Kalan Anapara × (Yıllık Oran / 365)
Dönem Faizi = Günlük Faiz × Dönemdeki Gün Sayısı

Muhasebe kaydı:
DR 780 Finansman Giderleri     = Dönem faiz tutarı
  CR 321/421 Ortaklara Borçlar   = Dönem faiz tutarı
```

Bu kayıt, gider olarak gelir tablosunu etkiler; dolayısıyla dönem net kârını düşürür.

### 4.5 VUK/KVK 13 Uyarısı — Transfer Fiyatlandırması

Ortak, şirkete faizsiz veya piyasa altı faizle kredi verirse Kurumlar Vergisi Kanunu'nun 13. maddesi devreye girebilir. Vergi dairesi, emsal faiz oranı üzerinden faiz hesaplayarak şirkete örtülü kazanç dağıtımı yapmış gibi işlem yapabilir.

Flowra, faiz oranı %0 girilen veya Türkiye Merkez Bankası referans oranının %50'sinin altında kalan dilimler için otomatik uyarı üretir.

---

## 5. Tab 4 — Geri Ödeme Şelalesi

### 5.1 Şelale Nedir?

Birden fazla ortak kredi vermişse ve şirketin geri ödeme kapasitesi sınırlıysa, ödemelerin adil sırayla yapılması gerekir. Geri Ödeme Şelalesi, bu sırayı Türk hukukuyla uyumlu biçimde otomatik hesaplar.

### 5.2 İki Fazlı Şelale

**Faz 1 — Normalleştirme Fazı**

Her ortağın "adil kredi oranı", toplam kredi içindeki payının kendi hisse oranıyla orantılı olması gerektiği varsayımına dayanır.

Örnek:
```
Ortak A: %60 hisse → toplam kredi 1.000.000 TRY ise → adil pay: 600.000 TRY
Ortak B: %40 hisse → adil pay: 400.000 TRY

Gerçek durum:
Ortak A: 900.000 TRY kredi vermiş → 300.000 TRY fazla
Ortak B: 100.000 TRY kredi vermiş → 300.000 TRY eksik

Normalleştirme fazında A'ya önce 300.000 TRY ödenir.
```

Bu mekanizmanın amacı: Fazla kredi veren ortağın küçük ortağı geri ödeme sürecinde dezavantajlı konuma düşürmesini önlemek.

**Faz 2 — Orantılı (Pro-Rata) Faz**

Normalleştirme tamamlandıktan sonra kalan geri ödemeler ortakların hisse oranına göre eş zamanlı yapılır. Artık hiçbir ortak diğerine göre tercihli konumda değildir.

### 5.3 Şelale Simülasyonu

Geri Ödeme sekmesinde üst kısımda bir simülatör bulunur:

1. **"Geri Ödeme Tutarı"** alanına ödenmek istenen tutarı girin.
2. **"Hesapla"** butonuna tıklayın.
3. Sistem şu bilgileri gösterir:
   - Normalleştirme fazında hangi ortağa ne kadar gidecek
   - Orantılı fazda her ortağa ne kadar gidecek
   - İşlem sonrasında her ortağın kalan bakiyesi

Bu simülasyon, gerçek ödeme yapılmadan önce ortaklar arasında karar almak için kullanılabilir.

### 5.4 Geri Ödeme Kaydı

1. Simülasyonu onayladıktan sonra **"Geri Ödemeyi Kaydet"** butonuna tıklayın.
2. Ödeme tarihini ve banka hesabını seçin.
3. Onay işlemi başlar (iş akışı gerekiyorsa: bkz. Bölüm 10).
4. Onay tamamlandığında sistem:
   - Her dilimden ilgili tutarı düşer
   - LOAN_REPAYMENT olayını Deftere ekler
   - Muhasebe fişini oluşturur: DR 321/421 | CR 102
   - Vade sınıfı kontrolü yapar (uzun vadeli dilim 12 aya yaklaştıysa 421'den 321'e aktarım önerir)

---

## 6. Tab 5 — Kâr Dağıtımı

### 6.1 Dağıtılabilir Kâr Hesabı

Türk hukukunda tüm dönem kârı temettü olarak dağıtılamaz. Dağıtılabilir kâr, dört güvenlik katmanı uygulandıktan sonra kalan tutardır:

```
Dönem Net Kârı (590 hesabı)
  - TTK 519 Yasal Yedek (%5; sermayenin %20 sınırına kadar)
  - Vergi Öncesi Karşılıklar (varsa; kurumlar vergisi dahil)
  - Geçmiş Yıl Zararı Mahsubu (varsa)
  - Yönetim Kurulu Kararıyla Tutulan Yedek (isteğe bağlı)
  ═══════════════════════════════════════════════════════
  = Dağıtılabilir Kâr

Brüt Temettü = Dağıtılabilir Kâr × Dağıtım Oranı (%)
Net Temettü  = Brüt Temettü × 0,90  (GVK 94 stopajı %10 düşüldükten sonra)
```

### 6.2 Kâr Dağıtımı Başlatma

1. **Ortaklar > Kâr Dağıtımı** sekmesine gidin.
2. Dağıtılacak dönemi seçin.
3. Sistem dağıtılabilir kârı otomatik hesaplar ve gösterir.
4. "Dağıtım Oranı" alanına toplam kârın yüzde kaçının dağıtılacağını girin (%0 ile %100 arası).
5. Ortak başına brüt ve net tutarlar hesaplanır.
6. **"Dağıtım Beyan Et"** butonuna tıklayın.
7. İş akışı başlar; CFO/Admin onayı gerekir.

### 6.3 TTK 519 — Yasal Yedek Akçe

Her dönemde net kârın **%5'i** yasal yedek olarak ayrılır. Bu ayrım zorunludur ve ortakların kararıyla kaldırılamaz.

Yasal yedeklerin toplamı, ödenmiş sermayenin **%20'sine** ulaştığında zorunluluk sona erer. Bu sınır aşılmışsa sistem yasal yedek kesintisini otomatik olarak hesaba katmaz.

Yasal yedekler şu amaçlar dışında kullanılamaz:
- Şirket zararlarının karşılanması
- Sermayeye eklenmesi (bedelsiz hisse çıkarımı)

### 6.4 TTK 509 — Kârsız Dönemde Temettü Yasağı

Şirket net kâr elde etmeden dönem temettüsü dağıtamaz. Geçmiş yıl birikmiş kârlarından dağıtım yapılabilir; ancak bu durumda da yasal yedek minimumu korunmalıdır.

Flowra, beyan edilen temettü tutarı dağıtılabilir kârı aşacaksa işlemi engeller ve red gerekçesini ekranda açıklar.

### 6.5 GVK 94 — Temettü Stopajı

Dağıtılan temettü üzerinden **%10** stopaj vergisi kesilir. Stopajı şirket keser, vergi dairesine yatırır. Ortağın eline geçen net tutar:

```
Brüt Temettü: 100.000 TRY
  Stopaj (%10): -10.000 TRY
Net Temettü:   90.000 TRY
```

Muhasebe kayıtları sistem tarafından otomatik üretilir:
```
Beyan aşaması:
DR 590 Dönem Net Kârı       100.000
  CR 335 Ortaklara Temettü Borcu    90.000
  CR 360 Ödenecek Stopaj Vergisi    10.000

Ödeme aşaması:
DR 335 Ortaklara Temettü Borcu   90.000
  CR 102 Bankalar                        90.000

DR 360 Ödenecek Stopaj Vergisi   10.000
  CR 102 Bankalar                        10.000
```

### 6.6 TTK 394 — Huzur Hakkı

Yönetim kurulu üyesi olan ortaklara, ortaklık sıfatından bağımsız olarak, yönetim kurulu kararıyla belirlenmiş huzur hakkı ödenebilir. Huzur hakkı bir gider kalemidir; dönem kârından önce düşülür.

**Önemli ayrım:** Huzur hakkı temettü değildir. Vergilendirilmesi farklıdır; ücret geliri olarak SGK'ya bildirilmelidir.

Flowra'da huzur hakkı:
1. Operasyon > Giderler > Kategori: Maaş ve Personel (hesap 771) olarak girilir.
2. Dönem kapanış kontrol listesinde Madde 7 bu kaydın yapılıp yapılmadığını denetler.

---

## 7. Tab 6 — Risk Haritası

### 7.1 Altı Boyutlu Risk Skoru

Risk Haritası, şirketin finansal sağlığını altı boyutta değerlendirir ve her boyuta 0-100 arası puan verir. Genel risk skoru bu altı puanın ağırlıklı ortalamasıdır.

| Risk Boyutu | Ağırlık | Ne Ölçer? |
|-------------|---------|-----------|
| **Nakit Akışı Riski** | %25 | Mevcut nakit ile aylık yükümlülükler oranı; kaç ay hayatta kalınabilir |
| **Borç Yük Skoru** | %20 | Toplam ortak kredisi / Öz kaynak oranı; aşırı borçlanma tespiti |
| **Sermaye Açığı** | %20 | Taahhüt edilmiş ama ödenmemiş sermaye oranı |
| **Alacak Riski** | %15 | Vadesi 30 günü geçmiş alacakların toplam alacaklara oranı |
| **Konsantrasyon Riski** | %10 | En büyük 3 müşterinin toplam gelirdeki payı; müşteri bağımlılığı |
| **Faiz Maruziyeti** | %10 | Değişken faizli kredi bakiyesinin toplam borç içindeki payı |

### 7.2 Harf Notu

| Toplam Puan | Harf Notu | Yorum |
|-------------|-----------|-------|
| 85-100 | **A** | Mükemmel finansal sağlık |
| 70-84 | **B** | İyi; küçük dikkat alanları mevcut |
| 55-69 | **C** | Orta; birden fazla risk faktörü gözlemleniyor |
| 40-54 | **D** | Zayıf; ciddi müdahale gerekebilir |
| 25-39 | **E** | Kötü; acil finansal eylem planı hazırlanmalı |
| 0-24 | **F** | Kritik; finansal kriz riski yüksek |

### 7.3 Risk Haritasını Okuma

Her boyutun kartında şunlar görünür:

- **Güncel puan** ve trend oku (geçen aya göre yükselen / düşen)
- **Puan hesaplamasında kullanılan değerler** (örn. "30+ gün vadesi geçmiş: 85.000 TRY / Toplam alacak: 420.000 TRY = %20,2")
- **Önerilen eylem** (örn. "Vadesi geçen 3 müşterinizle acil tahsilat görüşmesi yapın")

### 7.4 Risk Uyarı Tetikleyicileri

Risk skoru belirli eşikleri geçtiğinde CEO komuta merkezinde uyarı kartı belirir. Uyarı kuralları Admin > Sistem Ayarları > Uyarı Eşikleri menüsünden özelleştirilebilir.

---

## 8. Yönetişim Sistemi

### 8.1 Yönetişim Nedir?

Kurumsal yönetişim, bir şirketin kararlarının şeffaf, belgelenmiş ve denetlenebilir bir süreçte alınmasını sağlar. Flowra'nın yönetişim modülü şu temel ihtiyaçlara yanıt verir:

- Önemli finansal kararların yetkili kişiler tarafından onaylanması
- Onay geçmişinin değiştirilemez biçimde kaydedilmesi
- Düzenli mutabakat döngüsünün tamamlanması
- Denetçilere sunulabilecek izlenebilir denetim zinciri

### 8.2 Yönetişim Snapshot'ları

Her ayın 1'inde otomatik olarak çalışan cron görevi, aylık yönetişim snapshot'ı oluşturur. Bu snapshot:

- Tüm ortakların pozisyon özeti
- Risk haritası skorları
- Bilanço özeti
- Açık iş akışları
- Onaylanan ve reddedilen işlemlerin özeti

Snapshot'lar `governance_snapshots` tablosunda saklanır ve değiştirilemez. Admin > Yönetişim > Geçmiş menüsünden görüntülenebilir.

---

## 9. Mutabakat Süreci

### 9.1 Mutabakat Neden Gereklidir?

Mutabakat, şirket yöneticileri ve ortakların belirli aralıklarla finansal durumu resmi olarak doğrulaması ve imzalamasıdır. İmzalı mutabakat:

- Ortaklar arasındaki bilgi asimetrisini giderir
- Dönemsel finansal verilerin değiştirilemez kaydını oluşturur
- Dış denetim ve vergi incelemelerinde delil niteliği taşır
- TTK 514 uyarınca yönetim kurulunun finansal kontrol görevini yerine getirdiğini belgeler

### 9.2 Üç Mutabakat Türü

**Bilanço Mutabakatı:** Belirli bir tarihteki aktif-pasif dengesinin doğrulanması.

**Hazine Mutabakatı:** Banka bakiyelerinin gerçek ekstrelerle karşılaştırılması; kasa sayımı.

**Kâr Mutabakatı:** Dönem sonunda gelir tablosunun ve dağıtılabilir kâr hesabının tüm ortaklar tarafından onaylanması.

### 9.3 Mutabakat Oluşturma Adımları

1. `/dashboard/admin` adresine gidin, Mutabakat sekmesini açın.
2. **"Yeni Mutabakat"** butonuna tıklayın.
3. Mutabakat türünü (bilanço / hazine / kâr) ve dönemi seçin.
4. Bir başlık girin (örn. "Mayıs 2026 Aylık Kâr Mutabakatı").
5. **"Oluştur"** butonuna tıklayın.
6. Sistem 19 bölümlük mutabakat raporunu otomatik olarak doldurur.
7. Her bölümü gözden geçirin; anlaşmazlık varsa "Not Ekle" ile açıklama yazın.
8. **"İmzala"** butonuna tıklayarak onaylayın.
9. İkinci imza gerekiyorsa sistem ilgili kişiye e-posta gönderir.

### 9.4 19 Bölümlük Mutabakat Raporu

1. Banka bakiyesi
2. Müşteri alacakları (yaşlandırma tablosuyla birlikte)
3. Tedarikçi borçları
4. Stok değeri (FIFO yöntemiyle)
5. İndirilecek KDV (191 hesabı)
6. Hesaplanan KDV (391 hesabı)
7. Net KDV pozisyonu ve beyan durumu
8. Ortak kısa vadeli borçlar (321 hesabı)
9. Ortak uzun vadeli borçlar (421 hesabı)
10. Personele borçlar (335 hesabı)
11. Vergi borçları (360 hesabı)
12. Öz kaynak özeti (500, 542, 570, 590 hesapları)
13. Dönem net kârı
14. Gelir tablosu özeti
15. Bilanço özeti ve denge kontrolü
16. Nakit akışı özeti
17. Faaliyet giderleri kategori detayı
18. Yasal yedek hesaplaması (TTK 519 uyumluluğu)
19. Dağıtılabilir kâr ve azami temettü hesaplaması

### 9.5 İmzalama ve Arşiv

İmzalı mutabakat değiştirilemez hale gelir. "Kapalı" statüsündeki mutabakatlar:

- PDF olarak indirilebilir (tarih damgası ve imzalayan adları içerir)
- `/dashboard/admin > Mutabakat > Arşiv` menüsünden görüntülenebilir
- Dış denetçiye sistem erişimi verilmeden paylaşılabilir

---

## 10. İş Akışları ve Onay Süreçleri

### 10.1 İş Akışı Nedir?

İş akışı (workflow), belirli bir eşiği aşan veya özel yetki gerektiren işlemlerin yetkili kişi(ler) tarafından onaylanmasını zorunlu kılan yapıdır.

### 10.2 Mevcut İş Akışı Türleri

| Tür | Tetikleyici | Varsayılan Eşik | Onaylayan |
|-----|-------------|-----------------|-----------|
| **Masraf Onayı** | 50.000 TRY üstü gider girişi | 50.000 TRY | Admin veya Manager rolü |
| **Dönem Kapanışı** | Dönem kapatma talebi | Her zaman | CFO veya Admin rolü |
| **Ortak İşlemi** | Kredi dilimi, geri ödeme, temettü | Her zaman | Admin rolü |
| **Kullanıcı Davet** | Yeni kullanıcı ekleme | Her zaman | Admin rolü |
| **Uyarı Eşik Değişikliği** | Uyarı parametresi güncelleme | Her zaman | Admin rolü |

### 10.3 Onay Süreci

1. İşlemi başlatan kullanıcı "Onayla için Gönder" butonuna tıklar.
2. Sistem `workflow_instances` tablosunda yeni kayıt oluşturur.
3. Onaylama yetkisine sahip kullanıcıya e-posta bildirimi gönderilir.
4. Onaylayan kullanıcı `/dashboard/admin > İş Akışları > Bekleyen Onaylar` ekranına gider.
5. İşlemin detayını inceler, notlar ekler.
6. **"Onayla"** veya **"Reddet"** butonuna tıklar.
7. İşlem ya gerçekleştirilir ya da iptal edilir; başlatan kullanıcıya bildirim gönderilir.

### 10.4 48 Saat Zaman Aşımı

Onay bekleyen iş akışları 48 saatin sonunda otomatik olarak `expired` (süresi doldu) statüsüne geçer. Bu durumda:

- İşlem gerçekleştirilmez
- İlgili kullanıcılara bildirim gönderilir
- Log'a zaman aşımı kaydı düşülür
- Kullanıcı gerekirse işlemi yeniden başlatabilir

Zaman aşımı süresi Admin > Sistem Ayarları menüsünden değiştirilebilir (minimum 24 saat, maksimum 168 saat).

---

## 11. Denetim İzi ve Hash Zinciri

### 11.1 Her Olayın İzi

PCLE modülündeki tüm olaylar (kredi girişi, geri ödeme, kâr dağıtımı, imzalama) `audit_logs` tablosuna yazılır. Bu kayıtlar:

- Kim tarafından yapıldı (user_id)
- Ne zaman yapıldı (milisaniye hassasiyetinde timestamp)
- Ne yapıldı (action: create / approve / reject / sign)
- Hangi varlık etkilendi (entity_type, entity_id)
- İşlem öncesi ve sonrası değerler (payload JSON)

### 11.2 SHA-256 Hash Zinciri

Her audit kaydı, önceki kaydın SHA-256 özetini içerir. Bu yapı, geriye dönük müdahaleyi matematiksel olarak tespit edilebilir kılar:

```
Kayıt #1:  prev_hash = NULL
           content_hash = SHA256("LOAN_TRANCHE_CREATED + 500000 + 2026-01-15 + ...")

Kayıt #2:  prev_hash = content_hash_1
           content_hash = SHA256("INTEREST_ACCRUAL + 1250 + 2026-01-31 + ...")

Kayıt #3:  prev_hash = content_hash_2
           content_hash = SHA256("LOAN_REPAYMENT + 100000 + 2026-02-15 + ...")
```

Kayıt #2'nin içeriği değiştirilirse `content_hash_2` değişir. Kayıt #3'ün `prev_hash` alanı artık uyuşmaz. Sistem bu uyumsuzluğu tespit ederek uyarı üretir.

### 11.3 Hash Zinciri Doğrulama

Admin rolündeki kullanıcılar zincir doğrulamasını şu API çağrısıyla başlatabilir:

```
GET /api/admin/audit-chain-verify?from=2026-01-01&to=2026-05-31
```

Başarılı yanıt:
```json
{
  "valid": true,
  "checked": 1247,
  "broken_at": null,
  "timestamp": "2026-05-26T10:30:00Z"
}
```

Kurcalama tespit edilirse:
```json
{
  "valid": false,
  "checked": 1247,
  "broken_at": {
    "record_id": "uuid-...",
    "sequence": 847,
    "detected_at": "2026-05-26T10:30:00Z"
  }
}
```

---

## 12. Türk Mevzuatı Özeti

### TTK 394 — Huzur Hakkı

Yönetim kurulu üyelerinin huzur hakkı, genel kurul veya yönetim kurulu kararıyla belirlenmelidir. Kararı olmadan ödeme yapılamaz. SGK'ya ücret olarak bildirilmesi zorunludur.

**Flowra uyumu:** Dönem kapanış kontrol listesi Madde 7, bu kaydın yapılıp yapılmadığını denetler.

---

### TTK 509 — Kâr Olmadan Temettü Yasağı

Şirket net kâr elde etmeksizin cari dönem temettüsü beyan edemez. Geçmiş yıl birikimli kârdan dağıtım yapılabilir; ancak bu durumda yedek akçe minimumlarının korunması şarttır.

**Flowra uyumu:** Kâr dağıtımı beyanından önce sistem dağıtılabilir kârı hesaplar; beyan tutarı dağıtılabilir kârı aşıyorsa işlem engellenir ve red gerekçesi gösterilir.

---

### TTK 519 — Yasal Yedek Akçe

Her hesap döneminde net kârın %5'i birinci tertip yasal yedek olarak ayrılır. Bu zorunluluk, birikmiş yasal yedeklerin ödenmiş sermayenin %20'sine ulaşmasına kadar devam eder.

**Flowra uyumu:** Dönem kapanışında sistem yasal yedek kesintisini otomatik hesaplar ve fişe yazar. %20 sınırı aşıldığında bu kesinti hesaplanmaz.

---

### TTK 588 — Ödenmemiş Sermaye Faizi

Taahhüt edilmiş sermaye belirlenen sürede ödenmezse, ödenmemiş kısım için yasal faiz işlemeye başlayabilir.

**Flowra uyumu:** Pozisyon sekmesinde ödenmemiş sermaye olan ortakların satırı sarı veya kırmızıyla işaretlenir; Uyarı Motoru CAPITAL_UNPAID kuralını tetikler.

---

### GVK 94 — Temettü Stopajı

Dağıtılan temettü üzerinden %10 gelir vergisi stopajı kesilmesi zorunludur. Stopaj, vergi dairesine müteakip ayın 26'sına kadar beyan ve ödeme yapılmalıdır.

**Flowra uyumu:** Temettü beyanında sistem brüt/net ayrımını otomatik hesaplar ve 360 Ödenecek Vergi hesabına stopaj tahakkuk fişi yazar.

---

### VUK/KVK 13 — Transfer Fiyatlandırması (Faizsiz Kredi Riski)

Ortak şirkete faizsiz veya piyasa altında faizli kredi verirse, kurumlar vergisi açısından örtülü kazanç dağıtımı sayılabilir. Vergi dairesi emsal faizi hesaplayarak matrah farkı oluşturabilir.

**Flowra uyumu:** Faiz oranı %0 veya TCMB referans oranının yarısının altında girilen dilimlerde sistem VUK/KVK 13 uyarısı gösterir. Bu uyarı, riskin kabul edildiğine dair onay alındıktan sonra dilim kaydedilir.

---

*Bu rehber Flowra v1.0 için hazırlanmıştır. Belirtilen mevzuat maddeleri Türk Ticaret Kanunu (6102 sayılı TTK), Gelir Vergisi Kanunu (193 sayılı GVK) ve Vergi Usul Kanunu'na (213 sayılı VUK) dayanmaktadır. Yasal değişiklikler için mali müşavirinizle görüşünüz.*
