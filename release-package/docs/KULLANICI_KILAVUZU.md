# Flowra Kullanıcı Kılavuzu

**Türk KOBİ'leri için Finansal İşletim Sistemi**

Bu kılavuz, Flowra'yı günlük olarak kullanan satış ekipleri, operasyon yöneticileri ve işletme sahipleri için hazırlanmıştır. Teknik muhasebe bilgisi gerekmez; tüm kavramlar iş günlüğü diliyle açıklanmıştır.

---

## İçindekiler

1. [Başlarken](#1-başlarken)
2. [Dashboard — CEO Kokpit](#2-dashboard--ceo-kokpit)
3. [Ticari Hub](#3-ticari-hub)
4. [Operasyon Hub](#4-operasyon-hub)
5. [Finans Hub](#5-finans-hub)
6. [Ortaklar Hub](#6-ortaklar-hub)
7. [Planlama Hub](#7-planlama-hub)
8. [Raporlar](#8-raporlar)
9. [Ayarlar](#9-ayarlar)
10. [Sık Kullanılan İş Akışları — Adım Adım](#10-sık-kullanılan-i̇ş-akışları--adım-adım)

---

## 1. Başlarken

### 1.1 Sisteme Giriş

Flowra'ya tarayıcınızdan erişirsiniz; kurulum gerekmez. Giriş ekranında e-posta adresinizi ve şifrenizi girin. İlk girişte sistem sizi varsayılan şirketinizin Dashboard'una yönlendirir.

**Şifremi unuttum:** Giriş ekranındaki "Şifremi Unuttum" bağlantısına tıklayın. E-postanıza sıfırlama linki gelir; link 1 saat geçerlidir.

**İki faktörlü doğrulama (2FA):** Şirket yöneticiniz 2FA'yı zorunlu kılmış olabilir. Bu durumda giriş yaptıktan sonra telefonunuza veya kimlik doğrulayıcı uygulamanıza gelen kodu girmeniz istenir.

### 1.2 Dashboard Genel Bakış

Giriş yaptıktan sonra gördüğünüz ilk ekran CEO Kokpit'idir (`/dashboard`). Bu ekran şirketinizin anlık finansal sağlık resmini sunar:

- **Üst çubuk (Situation Line):** Şirketinizin genel sağlık puanı ve kısa durum cümlesi
- **Karar Uyarıları (Decision Alerts):** Acil eylem gerektiren konular
- **KPI Kartları:** Ciro, net kâr, nakit vadesi, tahsilat süresi
- **Tahmin Grafiği:** Önümüzdeki 3 aya ait baz/iyimser/kötümser projeksiyon
- **Sol kenar çubuğu:** Tüm modüllere erişim

### 1.3 Şirket Değiştirme

Birden fazla şirkete yetkiniz varsa sol üst köşedeki şirket adına tıklayarak açılır menüden farklı bir şirkete geçebilirsiniz. Her şirketin verileri tamamen birbirinden ayrıdır; bir şirketin verisi diğerinde görünmez.

Hangi şirkette olduğunuzu her zaman sol üst köşedeki şirket adı etiketinden ve tarayıcı sekmesi başlığından anlayabilirsiniz.

### 1.4 Rol ve Yetkiler

Flowra'da her kullanıcı bir role atanır. Rolünüz, gördüğünüz menüleri ve yapabileceklerinizi belirler:

| Rol | Erişim |
|-----|--------|
| **Sahip / CEO** | Tüm modüller, tüm ayarlar |
| **CFO / Muhasebeci** | Finans Hub, CFO Merkezi, Raporlar, Dönem Kapatma |
| **Satış Yöneticisi** | Ticari Hub (proformalar, satışlar, müşteriler) |
| **Operasyon** | Operasyon Hub (giderler, katalog, stok) |
| **Sadece görüntüleme** | Dashboard ve raporları okur, değişiklik yapamaz |

Hangi role sahip olduğunuzu görmek için sağ üst köşedeki profil simgesine tıklayın ve "Hesabım" seçeneğini seçin.

---

## 2. Dashboard — CEO Kokpit

### 2.1 Durum Çizgisi (Situation Line)

Dashboard'un en üstünde "Şirket sağlıklı seyrediyor" gibi bir durum cümlesi yer alır. Bu cümle, Flowra'nın beş boyutlu skorlamasına dayanır.

**Skor nasıl hesaplanır?**

Sistem her ay şirketinizi beş kriterde 0-100 arasında puanlar ve ağırlıklı ortalama alır:

| Kriter | Ağırlık | Ne Ölçer |
|--------|---------|----------|
| Nakit Durumu | %30 | Mevcut nakit ile aylık gider karşılaştırması |
| Kârlılık | %25 | Son 3 aylık net kâr marjı trendi |
| Borç Yükü | %20 | Toplam borcun öz kaynağa oranı |
| Alacak Sağlığı | %15 | 60 günü aşan alacakların toplam alacaklara oranı |
| Ortak Durumu | %10 | Ortak borç/öz kaynak dengesi |

**Durum cümlesi yorumu:**

- **"Şirket sağlıklı seyrediyor"** (Skor 70-100): Kritik bir sorun yok, normal operasyon sürdürülebilir.
- **"Dikkat: bazı göstergeler baskı altında"** (Skor 50-69): En az iki kriterde sorun var, yakından takip edilmeli.
- **"Kritik: acil müdahale gerekiyor"** (Skor 0-49): Nakit sıkışması veya ciddi kâr erimesi var; yönetim kararı gerektiriyor.

Durum çizgisine tıkladığınızda her kriterin detaylı puanını ve son 6 aylık trendi gösteren panel açılır.

### 2.2 Karar Uyarıları (Decision Alerts)

Dashboard'un sol üst bölümündeki kırmızı veya sarı kutular, sizden eylem bekleyen konuları gösterir. Uyarı türleri:

**RECEIVABLE_30 — 30 Günü Aşan Alacaklar**
Bir müşterinizin faturası 30 ila 60 gün gecikmiş demektir. Müşteriyi arayıp ödeme takvimi belirleyin; uyarı kartında müşteri adı ve tutarı görürsünüz.

**RECEIVABLE_60 — 60 Günü Aşan Alacaklar**
Alacak 60 günü geçmiş; tahsilat riski artıyor. Hukuki veya icra yolunu değerlendirmenin zamanı olabilir. Uyarı direkten Tahsilatlar ekranına bağlantı verir.

**CASH_RUNWAY — Nakit Vadesi Kısa**
Mevcut nakit bakiyeniz ve beklenen tahsilatlarınız dikkate alındığında X gün sonra nakit sıfırlanabilir. Önemsenmemesi gereken en kritik uyarıdır; finansman veya tahsilat hızlandırma planı yapın.

**PARTNER_LOAN_DUE — Ortak Borcu Vadesi Yaklaşıyor**
Bir ortağa karşı kısa vadeli borcunuzun vadesi 30 gün içinde doluyor. Ödeme planını ortakla teyit edin.

**PERIOD_NOT_CLOSED — Dönem Kapatılmadı**
Geçen ayın muhasebe dönemi kapatılmamış. Bu durum raporların doğruluğunu olumsuz etkiler. CFO veya muhasebeciniz ilgili dönemi kapatmalıdır.

**TAX_DUE — Vergi Bildirimi Yaklaşıyor**
KDV beyannamesi veya kurumlar vergisi ödeme tarihi 15 gün içinde. Vergi uzmanınızla koordineli hareket edin.

Her uyarı kartında "Detayları Gör" butonu ilgili ekrana götürür.

### 2.3 KPI Kartları

Dashboard'un ortasında dört ana kart yer alır:

**Ciro (Revenue)**
Seçili dönem içindeki toplam faturalanmış satış tutarı. Kart altında bir önceki döneme kıyasla yüzde değişim gösterilir.

**Net Kâr (Net Profit)**
Gelirden giderler ve vergiler düşüldükten sonra kalan tutar. Negatif ise kart kırmızı renk alır.

**Nakit Vadesi (Cash Runway)**
Mevcut nakit ile beklenen tahsilatlar toplanıp aylık ortalama gidere bölünerek hesaplanır. "47 gün" yazan kart, ek gelir gelmese bile 47 gün boyunca giderlerinizi karşılayabileceğinizi söyler.

**Tahsilat Süresi (DSR — Days Sales Receivable)**
Açık alacaklarınızın kaç günlük ciroyu temsil ettiğidir. 30 gün altı çok iyi, 60 gün üzeri dikkat gerektirir.

Kartların üzerine geldiğinizde hesaplama detaylarını içeren bir açıklama balonu görünür.

### 2.4 Tahmin Grafiği (Forecast Chart)

Dashboard'un alt bölümündeki grafik, önümüzdeki 3 aylık nakit ve gelir tahmini gösterir. Üç senaryo sunulur:

- **Baz (Base):** Mevcut trend devam ederse beklenen değer
- **İyimser (Optimistic):** Tüm açık alacaklar zamanında tahsil edilir, yeni satışlar geçen ayın %10 üzerinde seyreder
- **Kötümser (Pessimistic):** Gecikmiş alacakların %30'u bu dönem tahsil edilemez, satışlar %10 düşer

Tahmin yalnızca mevcut veriye dayalı bir projeksiyon olup kesin bir taahhüt değildir. Yeni satış veya büyük gider girildiğinde otomatik güncellenir.

### 2.5 Hızlı Eylemler (Quick Actions)

Dashboard sağ üst köşesinde dört hızlı eylem butonu yer alır:

- **Yeni Proforma:** Anında proforma oluşturma formu açar
- **Gider Ekle:** Hızlı gider kayıt formu açar
- **Tahsilat Kaydet:** Belirli bir alacak için ödeme kaydı açar
- **Rapor İndir:** Son dönem CFO paketi PDF indirir

---

## 3. Ticari Hub

Ticari Hub'a sol menüden "Ticari" başlığına tıklayarak erişirsiniz (`/dashboard/commercial`). Hub içinde dört bölüm vardır: Proformalar, Satışlar, Tahsilatlar, Müşteriler.

### 3.1 Proformalar

#### Yeni Proforma Oluşturma

1. **Ticari > Proformalar** ekranına gidin.
2. Sağ üst köşedeki **"Yeni Proforma"** butonuna tıklayın.
3. Formu doldurun:
   - **Müşteri:** Listeden mevcut müşteri seçin veya "Yeni Müşteri Ekle" ile kayıt oluşturun.
   - **Geçerlilik Tarihi:** Proformanın ne zaman geçersiz sayılacağı; genellikle 30 gün.
   - **Kalemler:** Her satır için ürün/hizmet seçin, miktar girin, birim fiyatı onaylayın.
   - **KDV Oranı:** Her kalem için ayrı ayrı %18, %10 veya %1 seçilebilir. Standart ticari ürünlerde %18 uygulanır.
   - **İskonto:** Kalem bazında veya toplam tutara sabit tutar ya da yüzde iskonto eklenebilir.
4. Alt bölümde KDV dahil toplam tutar otomatik hesaplanır.
5. **"Kaydet"** ile taslak olarak saklayın veya doğrudan **"Gönder"** ile müşteriye iletin.

#### Müşteriyle Paylaşma (Herkese Açık Bağlantı)

Proforma kaydedildikten sonra **"Paylaşım Linki Oluştur"** butonuna tıklayın. Sistem benzersiz, zaman sınırlı bir URL üretir. Bu linki müşteriye e-posta veya mesajlaşma uygulamasıyla iletebilirsiniz.

Müşteri bu linki açtığında:
- Proforma detaylarını görür (kalemler, tutarlar, KDV)
- "Onaylıyorum" veya "Reddet" butonuna basabilir
- Giriş yapması gerekmez; link tek başına yeterlidir

#### Müşteri Onay Süreci

Müşteri "Onaylıyorum" tıkladığında:
- Proforma durumu **"Onaylandı"** olarak güncellenir
- Size sistem içi bildirim gönderilir
- Proforma artık satışa dönüştürülmeye hazırdır

Müşteri reddettiğinde durum **"Reddedildi"** olur; proformayı düzenleyip yeniden gönderebilirsiniz.

#### Proformadan Satışa Dönüştürme

Onaylanmış proformanın detay sayfasında **"Satışa Dönüştür"** butonuna tıklayın. Sistem:
- Yeni bir satış kaydı oluşturur
- Fatura tarihini bugün olarak ayarlar (değiştirebilirsiniz)
- Muhasebe kayıtlarını (alacak ve KDV tahakkuku) otomatik yazar
- Proformanın durumunu **"Dönüştürüldü"** olarak işaretler

#### Proforma Durumları

| Durum | Anlamı |
|-------|--------|
| **Taslak** | Kaydedildi, henüz gönderilmedi |
| **Gönderildi** | Müşteri linki aldı, yanıt bekleniyor |
| **Onaylandı** | Müşteri kabul etti, satışa dönüştürülmeye hazır |
| **Dönüştürüldü** | Satış kaydına çevrildi |
| **Reddedildi** | Müşteri kabul etmedi |
| **Süresi Doldu** | Geçerlilik tarihi geçti, aksiyon alınmadı |

### 3.2 Satışlar

#### Satış Listesi

**Ticari > Satışlar** ekranı tüm faturalanmış satışları listeler. Kolonu başlıklarına tıklayarak tarih, tutar veya müşteriye göre sıralama yapabilirsiniz. Üst filtrelerde tarihe, müşteriye ve ödeme durumuna göre daraltma yapılır.

**Ödeme durumu renk kodu:**
- Yeşil: Ödendi
- Sarı: Kısmen ödendi
- Kırmızı: Vadesi geçmiş, ödenmedi
- Gri: Vade dolmamış, bekleniyor

#### Ödeme Kaydetme

Bir müşteriden ödeme aldığınızda:

1. Satış satırına veya detay sayfasına gidin.
2. **"Ödeme Kaydet"** butonuna tıklayın.
3. Ödeme tutarını girin (tam veya kısmi).
4. Ödeme yöntemini seçin: Banka havalesi, nakit, çek.
5. Ödeme tarihini onaylayın.
6. **"Kaydet"** tıklayın.

Sistem otomatik olarak muhasebede banka hesabına giriş ve alacak kapatma kaydı yazar. Kısmi ödeme yapılırsa satış "Kısmen Ödendi" olarak güncellenir ve bakiye alacak olarak açık kalır.

#### Satış Detay Sayfası

Satış satırına tıkladığınızda ayrıntı sayfası açılır. Bu sayfada şunları görürsünüz:
- Satış kalemleri (ürün, miktar, birim fiyat, KDV tutarı)
- Toplam tutar ve KDV ayrımı
- Ödeme geçmişi (hangi tarihte ne kadar geldi)
- Kalan bakiye
- Bu satışa ait muhasebe kayıtları özeti (Finans rolü gerektirebilir)

#### Vadesi Geçmiş Satışlar

Ödeme tarihi geçmiş ancak ödenmemiş satışlar "Gecikmiş" olarak işaretlenir. Bu satışlarla ilgili önerilen adımlar:

1. Tahsilat ekranından yaşlandırma tablosuna bakın (hangi müşteri kaç gündür gecikiyor).
2. Müşteriyle iletişime geçin ve ödeme taahhüdü alın.
3. Taahhüt tarihini satış notlarına kaydedin.
4. 60 günü aşarsa yöneticiye eskalasyon uyarısı gelir.

#### Satışları CSV Olarak Dışa Aktarma

Satış listesinin sağ üst köşesindeki **"Dışa Aktar"** butonuna tıklayın ve "CSV" seçin. Aktif filtrenize uyan tüm satışlar indirilir. Tarih aralığı belirtmek için önce filtre uygulayın, sonra dışa aktarın.

### 3.3 Tahsilatlar

#### Tahsilat Baskı Ekranı

**Ticari > Tahsilatlar** (`/dashboard/commercial/collections`) ekranı, açık alacaklarınızın yaşlandırma analizini gösterir. Hangi müşterinin ne kadar süredir ödeme yapmadığını tek bakışta görürsünüz.

#### Yaşlandırma Grupları (Aging Buckets)

| Grup | Aralık | Tavsiye Edilen Eylem |
|------|--------|---------------------|
| **Cari** | 0-30 gün | Normal takip, yeterli |
| **Kısa Gecikme** | 31-60 gün | Hatırlatma mesajı gönder |
| **Orta Gecikme** | 61-90 gün | Telefon görüşmesi yap, yazılı uyarı gönder |
| **Ciddi Gecikme** | 90+ gün | Hukuki süreç veya icra değerlendirin |

#### Tahsilat İşaretleme

Tahsilatlar ekranından da ödeme kayıt yapılabilir. Müşteri satırındaki **"Tahsilat Kaydet"** butonuna tıklayın; Satışlar ekranındaki ödeme kayıt formuyla aynı form açılır.

### 3.4 Müşteriler

#### Müşteri Listesi

**Ticari > Müşteriler** ekranı tüm kayıtlı müşterileri listeler. Arama kutusuna müşteri adı veya vergi numarası yazarak hızlı arama yapabilirsiniz.

#### Müşteri Detay Sayfası

Bir müşteriye tıkladığınızda:
- **Bilgiler:** Şirket adı, vergi numarası, vergi dairesi, adres, iletişim
- **Bakiye:** Bu müşteriye ait toplam açık alacak tutarı
- **Satış geçmişi:** Bu müşteriyle yapılan tüm işlemler, tarihlere göre sıralı
- **Tahsilat geçmişi:** Gelen ödemeler

Müşteri bakiyesi, sistemdeki tüm açık (ödenmemiş veya kısmen ödenmiş) satışların toplamıdır.

---

## 4. Operasyon Hub

### 4.1 Giderler

#### Gider Oluşturma

1. **Operasyon > Giderler** ekranına gidin.
2. **"Yeni Gider"** butonuna tıklayın.
3. Formu doldurun:
   - **Açıklama:** Giderin ne için yapıldığı
   - **Kategori:** Aşağıdaki tabloda belirtilen kategorilerden birini seçin
   - **Tutar:** KDV hariç tutar
   - **KDV Oranı:** %18, %10, %1 veya KDV'siz seçeneklerinden biri
   - **Tarih:** Giderin oluştuğu tarih
   - **Ödeme Yöntemi:** Banka, nakit, kredi kartı
   - **Belge Yükle:** Fatura veya makbuzun görüntüsü (PDF veya JPG)
4. **"Kaydet"** tıklayın.

#### Gider Kategorileri ve Muhasebe Hesapları

| Kategori | Muhasebe Hesabı | Açıklama |
|----------|----------------|----------|
| Maaş ve Personel | 771 | Personel maaşları ve SGK |
| Kira | 772 | Ofis, depo, arazi kiralama |
| Yazılım / Abonelik | 773 | SaaS araçlar, lisanslar |
| Pazarlama | 760 | Reklam, tanıtım, organizasyon |
| Genel Yönetim | 770 | Ofis malzemeleri, posta, kırtasiye |
| Finansman | 780 | Banka faizi, kredi maliyeti |

#### Büyük Giderlerde Onay Süreci (>50.000 TRY)

50.000 TRY ve üzerindeki giderler sisteme girildiğinde otomatik olarak onay akışına alınır:

1. Gider "Onay Bekliyor" durumuna geçer.
2. Yetkili onaylayıcıya (genellikle CFO veya CEO) bildirim gider.
3. Onaylayıcı detayları inceleyip "Onayla" veya "Reddet" butonuna basar.
4. Onaylanırsa gider aktifleşir ve ödeme kaydı yapılabilir.
5. Reddedilirse gideri giren kişiye gerekçeli bildirim gider.

Büyük giderler için belge yükleme zorunludur.

#### Tekrarlayan Giderler

Kira veya abonelik gibi her ay aynı tutarda tekrarlayan giderler için gider oluştururken "Tekrarlayan Gider" seçeneğini aktif edin. Aylık veya yıllık periyot seçin. Sistem her dönem başında otomatik taslak gider oluşturur; siz sadece onaylarsınız.

#### Giderleri Dışa Aktarma

Gider listesinin sağ üstündeki **"Dışa Aktar"** butonu ile CSV indirebilirsiniz. Tarih filtresi uygulayarak belirli bir dönemin giderlerini çekebilirsiniz.

### 4.2 Katalog

#### Ürün Ekleme

1. **Operasyon > Katalog** ekranına gidin.
2. **"Yeni Ürün"** butonuna tıklayın.
3. Doldurun:
   - **Ürün Adı ve Kodu:** Benzersiz bir ürün kodu girin (örn. PRD-001)
   - **Kategori:** Ürünü bir kategoriye atayın
   - **Satış Fiyatı (KDV Hariç):** Liste fiyatı
   - **Maliyet Fiyatı:** Stok maliyeti hesaplamasında kullanılır (FIFO)
   - **KDV Oranı:** Ürüne uygun oran
   - **Birim:** Adet, kg, lt, m², kutu vb.
4. **"Kaydet"** tıklayın.

#### Maliyet Fiyatı ve FIFO

Flowra stok maliyetini FIFO (İlk Giren İlk Çıkar) yöntemiyle izler. Bu şu anlama gelir:

- Her satın alma farklı bir maliyet fiyatıyla stok lotuna girer.
- Satış yapıldığında en eski satın alınan lot maliyeti COGS'a yazılır.
- Maliyet fiyatı satın alma anında dondurulur; sonradan değiştirilmesi geçmiş kayıtları etkilemez.

Katalogdaki "Maliyet Fiyatı" alanı yeni girişler için varsayılan fiyattır; gerçek maliyet her satın almada belirlenir.

#### Ürün Kategorileri

Kategoriler, ürünleri gruplamak ve raporlarda filtrelemek için kullanılır. Kategori eklemek için Katalog ekranındaki "Kategoriler" sekmesine gidin ve "Yeni Kategori" oluşturun. Her kategoriye renk ve simge atanabilir.

#### Stok Seviyesi Görüntüleme

Katalog listesindeki her ürün satırında anlık stok adedi görünür. Stok sıfıra yaklaştığında satır sarı renk alır; stok sıfırlandığında kırmızıya döner.

### 4.3 Stok

#### Stok Lotları (FIFO)

**Operasyon > Stok** ekranı tüm stok lotlarını gösterir. Her lot bir satın almaya karşılık gelir:

- **Lot No:** Otomatik atanır (LOT-2026-001 gibi)
- **Ürün:** Hangi ürüne ait
- **Giriş Tarihi:** Satın alma tarihi
- **Giriş Adedi:** Kaç adet alındı
- **Kalan Adet:** Henüz satılmamış miktar
- **Birim Maliyet:** Bu satın almadaki ücret; sonradan değişmez

#### Giriş Maliyeti Dondurulur

FIFO mantığı gereği her lot kendi giriş maliyetini taşır. Aynı ürünün farklı zamanlarda farklı fiyatlardan alınmış olması normal bir durumdur. Raporlarda maliyet, hangi lotun satıldığına göre otomatik hesaplanır.

#### Kritik Stok Uyarıları

Bir ürünün toplam stoku, Katalog'da belirlenen minimum stok seviyesinin altına düştüğünde:
- Stok ekranında ürün kırmızı işaretlenir
- Dashboard uyarılar bölümünde "Kritik Stok" bildirimi görünür

Minimum stok seviyesini ürün detay sayfasından ayarlayabilirsiniz.

---

## 5. Finans Hub

Finans Hub'a sol menüden **"Finans"** başlığına tıklayarak erişirsiniz (`/dashboard/finance`). Sekiz sekme içerir.

### 5.1 Sekmelerin Kısa Açıklaması

| Sekme | Türkçe Adı | Ne Gösterir |
|-------|-----------|------------|
| **Overview** | Genel Bakış | Ciro, kâr, nakit özeti yan yana |
| **P&L** | Gelir Tablosu | Gelir - Gider = Kâr detaylı |
| **Balance Sheet** | Bilanço | Varlık, yükümlülük, öz kaynak |
| **Cash Flow** | Nakit Akışı | Para nereden geldi, nereye gitti |
| **Tax** | Vergi | KDV özeti ve vergi pozisyonu |
| **Risks** | Riskler | Finansal risk göstergeleri |
| **Forecast** | Tahmin | 3 aylık projeksiyon |
| **Quarterly** | Çeyreklik | 3 aylık karşılaştırmalı analiz |

### 5.2 Gelir Tablosunu Okuma (P&L)

Gelir tablosu, seçili dönemde şirketin ne kadar kazandığını ve harcadığını gösterir.

**Temel yapı:**

```
Toplam Satış Geliri          +1.000.000 TRY
─────────────────────────────────────────
Satılan Malın Maliyeti        -600.000 TRY
                              ──────────
BRÜT KÂR                      400.000 TRY  (%40 marj)

Pazarlama Giderleri           -50.000 TRY
Genel Yönetim Giderleri       -80.000 TRY
Maaş Giderleri               -120.000 TRY
Kira Giderleri                -24.000 TRY
                              ──────────
FAALİYET KÂRI (EBIT)          126.000 TRY

Finansman Giderleri            -6.000 TRY
                              ──────────
VERGİ ÖNCESİ KÂR              120.000 TRY

Kurumlar Vergisi (%25)         -30.000 TRY
                              ──────────
NET KÂR                         90.000 TRY
```

Üst sağ köşedeki dönem seçicisini kullanarak Ocak-Aralık arasında herhangi bir ay veya dönem için görüntüleyebilirsiniz.

### 5.3 Bilançoyu Okuma

Bilanço, belirli bir tarihteki şirket varlıklarını ve bu varlıkların nasıl finanse edildiğini gösterir.

**Temel denklem:** Varlıklar = Yükümlülükler + Öz Kaynak

- **Dönen Varlıklar:** Nakit, banka, müşteri alacakları, stok
- **Duran Varlıklar:** Makine, ekipman, araç (birikmiş amortisman düşülmüş)
- **Kısa Vadeli Borçlar:** Satıcı borçları, ödenecek vergiler, ortak kısa vadeli borç
- **Uzun Vadeli Borçlar:** Ortak uzun vadeli borç
- **Öz Kaynak:** Sermaye, yasal yedek, geçmiş yıl kârları, dönem net kârı

Bilanço her zaman dengelenmiş olmalıdır. Küçük yuvarlama farkları normaldir; 0,01 TRY'yi aşan fark varsa CFO'nuza bildirin.

### 5.4 Nakit Akış Tablosunu Anlama

Nakit akışı tablosu üç bölümden oluşur:

**İşletme Faaliyetleri:** Günlük ticaretten gelen/giden nakit. Müşterilerden tahsil, satıcılara ödeme, personel ödemeleri.

**Yatırım Faaliyetleri:** Uzun vadeli varlık alımları (makine, ekipman gibi).

**Finansman Faaliyetleri:** Ortak borçları, sermaye artışları, temettü ödemeleri.

Alt satırdaki "Net Nakit Değişimi", dönem başı ve sonu nakit arasındaki farktır. Bu rakam banka hesaplarınızdaki gerçek değişimle örtüşmelidir.

### 5.5 KDV Özeti

Vergi sekmesindeki KDV özeti üç satırdan oluşur:

- **Hesaplanan KDV (Çıkış KDV):** Müşterilere faturaladığınız KDV toplamı
- **İndirilecek KDV (Giriş KDV):** Tedarikçilerinize ödediğiniz KDV toplamı
- **Ödenecek KDV:** Çıkış - Giriş farkı; bu tutarı vergi dairesine ödersiniz

Beyanname dönemlerinde bu sekmedeki rakamları beyanname formunuza aktarabilirsiniz. Dışa aktar butonuyla KDV raporunu Excel formatında indirebilirsiniz.

### 5.6 Çeyreklik Görünüm

Çeyreklik sekme, dört çeyreği yan yana karşılaştırır. Her çeyrek için ciro, kâr marjı ve nakit gösterilir. Mevsimsel dalgalanmaları (örneğin yaz aylarındaki düşüş veya yılsonu satış zirvesi) görmek için idealdir.

---

## 6. Ortaklar Hub

Ortaklar Hub'a sol menüden **"Ortaklar"** başlığına tıklayarak erişirsiniz (`/dashboard/partners`). Altı sekme içerir.

### 6.1 Pozisyon Sekmesi

Her ortağın güncel finansal pozisyonunu gösterir:

- **Öz Kaynak (Equity):** Ortağın şirketteki pay tutarı (sermaye + birikmiş kâr payı)
- **Borçlar (Loans):** Bu ortağın şirkete verdiği ve henüz geri ödenmemiş kredi/borç toplamı
- **Dağıtım Hakkı:** Bu ortağın dönem kârından alabileceği azami temettü tutarı

Pozisyon ekranı anlık bir kesit sunar; dönem seçici ile geçmiş tarihlere de bakılabilir.

### 6.2 Defter (Ledger) Sekmesi

Ortak bazında tüm finansal hareketlerin kronolojik listesi. Kredi girişleri, geri ödemeler, temettü beyanları ve sermaye hareketleri bu sekmede görünür. Her hareketin kaynak belgesi (Muhasebe Fişi No.) da listelenir.

### 6.3 Dilimler (Tranches) Sekmesi

Bir ortağın verdiği kredi tek bir toplu ödeme olmayabilir; dilimler halinde gelebilir. Her dilim:
- Kendi vade tarihine sahiptir
- Kendi faiz oranını taşır (sabit veya değişken)
- Bağımsız olarak takip edilir

Dilim listesinde her birinin güncel bakiyesi, işlemiş faiz ve kalan vadeye kaç gün kaldığı görülür.

### 6.4 Geri Ödeme Sekmesi (Repayment)

**Normalleştirme Şelalesi (Normalization Waterfall):** Birden fazla ortağa borç olduğunda kim önce geri ödenir? Flowra iki aşamalı bir yöntem uygular:

1. **Normalleştirme Aşaması:** Ortaklar arasındaki orantısızlık giderilir. Çok fazla kredi vermiş ortak ile az vermiş ortak arasındaki oran dengelenir.
2. **Pro-Rata Aşaması:** Normalleştirme tamamlandıktan sonra kalan ödemeler ortakların pay oranlarına göre dağıtılır.

Pratik örnek: Şirkette iki ortak var; A ortağı %60, B ortağı %40 paya sahip. Ancak A ortağı şirkete 500.000 TRY, B ortağı 100.000 TRY borç vermiş. Normalleştirme aşaması önce bu orantısızlığı giderir, ardından eşit oranda geri ödeme yapılır. Bu sistem bir ortağın diğerini ezmesini önler.

### 6.5 Dağıtım (Distribution) Sekmesi

Dönem kârından temettü dağıtımı şu sırayla yapılır:

1. **Yasal Yedek (TTK 519):** Kârın %5'i yasal yedek olarak ayrılır. Bu ayrım toplam ödenmiş sermayenin %20'sine ulaşana kadar zorunludur.
2. **Kalan Kâr:** Yasal yedek ayrıldıktan sonra kalan kâr ortakların pay oranlarına göre dağıtılır.
3. **Stopaj Vergisi:** Temettü ödemelerinden %10 GVK 94 stopajı kesilir; şirket vergi dairesine yatırır.

Dağıtım sekmesinde her ortak için brüt temettü, kesilen stopaj ve net ödeme tutarları görülür.

### 6.6 Risk Haritası (Risk Map)

Altı boyutlu risk değerlendirmesi sunar:

1. **Konsantrasyon Riski:** Kredi tek bir ortaktan mı geliyor?
2. **Vade Riski:** Borcun büyük kısmı kısa vadeli mi?
3. **Faiz Yükü:** Faiz ödemeleri nakit akışını eziyor mu?
4. **Çıkış Riski:** Bir ortak aniden çıkmak istese ne olur?
5. **Likidite Uyuşmazlığı:** Borçların vadesi ile nakit girişleri örtüşüyor mu?
6. **Temerrüt Maruziyeti:** Şirketin borcunu ödeyememesi ihtimali ne kadar?

Her boyut 0-10 arası puanlanır; 8'in üzeri kritik olarak işaretlenir.

---

## 7. Planlama Hub

Planlama Hub'a sol menüden **"Planlama"** başlığına tıklayarak erişirsiniz (`/dashboard/planning`).

### 7.1 Senaryo Oluşturma

1. Planlama ekranında **"Yeni Senaryo"** butonuna tıklayın.
2. Senaryo adı girin (örn. "2026 İyimser Plan").
3. Baz periyodu seçin (genellikle geçen yıl fiili verisi).
4. Büyüme varsayımlarını girin:
   - Aylık satış artış oranı
   - Gider büyüme oranı
   - Yeni ürün/müşteri ekleme varsayımları
5. **"Hesapla"** tıklayın; sistem 12 aylık projeksiyon üretir.

Birden fazla senaryo oluşturabilir ve karşılaştırmak için yan yana görüntüleyebilirsiniz.

### 7.2 Mevsimsel Gelir Dağılımı

Turizm, tarım veya perakende gibi mevsimsel sektörlerde gelir yıla eşit dağılmaz. Mevsimsel dağılım parametresinde her aya 1-100 arası ağırlık vererek gelirin yıl içindeki dağılımını tanımlayabilirsiniz.

Örnek: Yaz sezonu ağırlıklı bir işletme için Haziran-Ağustos aylarına 90, Ocak-Şubat aylarına 30 puan verebilirsiniz. Sistem bu ağırlıkları kullanarak aylık projeksiyonları gerçekçi biçimde hesaplar.

### 7.3 Borç Baskısı Zaman Çizelgesi

Bu görünüm, borç ödemelerinin nakit akışı üzerindeki baskısını gösterir. **DSR (Debt Service Ratio):** Aylık borç ödemelerinin o ayki nakit girişlerine oranı.

**Yorum kılavuzu:**
- DSR < %40: Rahat bölge, borç ödemeleri nakit akışını zorlamıyor
- DSR %40-70: Dikkat bölgesi, nakit yönetimi önemli
- DSR > %70: Kritik bölge — bu ayda borç ödemeleri gelirinizin %70'inden fazlasını alıyor

DSR > %70 olduğunda, yüksek gelir aylarına denk gelen ödemeleri öne almak veya ek finansman aramak gerekebilir.

### 7.4 Nakit Projeksiyonu

Nakit projeksiyon ekranı şu ay sonundan 12 ay sonuna kadar tahmini nakit bakiyenizi gösterir. Hesaplama şu bileşenleri dikkate alır:
- Bugünkü banka bakiyesi
- Beklenen tahsilatlar (açık satışlar + senaryo büyüme oranı)
- Beklenen ödemeler (tekrarlayan giderler + borç ödemeleri)
- Sezonsal dağılım ağırlıkları

Grafiğin herhangi bir noktasının 0'ın altına düşmesi, o ayda nakit açığı oluşabileceği anlamına gelir; bu noktalar kırmızı uyarı ile işaretlenir.

### 7.5 Birim Kâr Hesaplayıcı

Bir ürün veya hizmetin gerçek marjını hesaplamak için kullanılır. Şunları girin:
- Satış fiyatı (KDV hariç)
- Doğrudan maliyet (hammadde, ambalaj)
- Dolaylı maliyet payı (kira, personel, genel gider)

Sistem birim katkı payı ve marjı hesaplar. Hangi ürünlerinizin gerçekte para kazandırdığını, hangilerinin maliyet yükü yarattığını bu araçla görebilirsiniz.

---

## 8. Raporlar

Raporlar modülüne sol menüden **"Raporlar"** başlığına tıklayarak erişirsiniz (`/dashboard/reports`).

### 8.1 CFO Paketi (PDF) Oluşturma

CFO Paketi, tüm finansal tabloları tek bir PDF'te toplar. Banka veya ortak sunumları için idealdir.

1. Raporlar ekranında **"CFO Paketi"** seçeneğine tıklayın.
2. Dönem seçin (ay veya çeyrek).
3. Dahil edilecek bölümleri işaretleyin:
   - Kapak sayfası
   - Durum özeti
   - Gelir tablosu
   - Bilanço
   - Nakit akış tablosu
   - KDV özeti
   - Yönetici özeti
4. **"PDF Oluştur"** butonuna tıklayın.
5. Dosya hazırlandığında otomatik indirme başlar (genellikle 10-30 saniye).

### 8.2 Gelir Tablosu PDF

Sadece gelir tablosunu PDF olarak indirmek için:
1. Raporlar > **Gelir Tablosu**
2. Dönem ve karşılaştırma dönemi seçin (örn. Mart 2026 ve Mart 2025)
3. **"PDF İndir"** tıklayın

### 8.3 Bilanço PDF

Raporlar > **Bilanço** seçeneğiyle belirli bir tarihin bilanço fotoğrafını PDF olarak alabilirsiniz.

### 8.4 Yönetici Özeti

Teknik detay içermeyen, sade dilde yazılmış tek sayfalık özet. CEO veya yönetim kurulu sunumları için tasarlanmıştır. İçerir:
- 3 cümlelik durum özeti
- Öne çıkan 5 KPI
- Kritik uyarılar
- Önümüzdeki ay önerilen eylemler

---

## 9. Ayarlar

Ayarlar ekranına sağ üst köşedeki profil simgesinden veya sol menü altındaki çark simgesinden ulaşılır.

### 9.1 Şirket Profil Ayarları

**Şirket > Profil** bölümünde şunları düzenleyebilirsiniz:
- Şirket adı
- Vergi Numarası (Vergi Kimlik No.)
- Vergi Dairesi
- MERSİS Numarası
- Adres ve iletişim bilgileri
- Fatura başlığı (PDF raporlarda görünür)
- Şirket logosu (PDF raporlara eklenir)

Bu bilgiler PDF raporlarına ve proforma çıktılarına yansır.

### 9.2 Uyarı Eşikleri

**Şirket > Uyarı Eşikleri** bölümünde sistemin karar uyarısı üretmesini tetikleyen değerleri ayarlayabilirsiniz:

| Uyarı | Varsayılan Eşik | Özelleştirilebilir mi? |
|-------|----------------|----------------------|
| Alacak gecikmesi (gün) | 30 gün | Evet |
| Nakit vadesi uyarısı (gün) | 45 gün | Evet |
| Büyük gider onay sınırı | 50.000 TRY | Evet |
| Kritik stok seviyesi | 10 adet | Ürün bazında |
| DSR kritik eşiği | %70 | Evet |

### 9.3 E-posta Bildirimleri

**Hesabım > Bildirimler** bölümünde hangi olaylar için e-posta almak istediğinizi seçebilirsiniz:

- Yeni karar uyarısı oluştuğunda
- Büyük gider onayı bekliyor
- Proforma onaylandı / reddedildi
- Dönem kapatma hatırlatması (ay sonundan 3 gün önce)
- Vergi bildirimi hatırlatması

Her bildirim türü bağımsız olarak açılıp kapatılabilir.

---

## 10. Sık Kullanılan İş Akışları — Adım Adım

### 10.1 Tam Satış Döngüsü: Proformadan Ödemeye

Bu adımlar, bir müşteriye satış yapmanın başından sonuna tüm sürecini anlatmaktadır.

**Adım 1 — Proforma Oluştur**
1. Ticari > Proformalar > Yeni Proforma
2. Müşteriyi seç veya yeni müşteri ekle
3. Ürün kalemlerini ekle, KDV oranlarını ayarla
4. Geçerlilik tarihini gir
5. Kaydet

**Adım 2 — Müşteriye Gönder**
1. Proforma detay sayfasından "Paylaşım Linki Oluştur" tıkla
2. Oluşan URL'yi müşteriye e-posta veya WhatsApp ile gönder

**Adım 3 — Onay Bekle**
1. Müşteri linki açar ve "Onaylıyorum" tıklar
2. Sisteme bildirim gelir, proforma durumu "Onaylandı" olur

**Adım 4 — Satışa Dönüştür**
1. Onaylanan proformanın detay sayfasına git
2. "Satışa Dönüştür" butonuna tıkla
3. Fatura tarihini onayla
4. Kaydet — sistem muhasebe kaydını otomatik yazar

**Adım 5 — Ödeme Kaydet**
1. Ticari > Satışlar listesine git
2. İlgili satışı bul
3. "Ödeme Kaydet" butonuna tıkla
4. Tutarı, tarihi ve ödeme yöntemini gir
5. Kaydet — nakit bakiyesi otomatik güncellenir

**Sonuç:** Satış "Ödendi" durumuna geçer, nakit akışı güncellenmiş olur.

---

### 10.2 Ay Sonu Süreci

Her ayın son birkaç günü şu adımları izleyin:

**Adım 1 — Tahsilatları Gözden Geçir**
1. Ticari > Tahsilatlar ekranına git
2. 60+ gün grubundaki alacakları incele
3. Gerekiyorsa müşteriyle iletişime geç veya ödeme planı yap
4. Gelen ödemeleri "Tahsilat Kaydet" ile işle

**Adım 2 — Bekleyen Giderleri Onayla**
1. Operasyon > Giderler ekranına git
2. Durum filtresiyle "Onay Bekliyor" giderleri listele
3. Her gideri incele, belgesi var mı kontrol et
4. Uygun giderleri "Onayla" ile aktifleştir

**Adım 3 — Gider Girişi Tamamla**
Ay boyunca girilmemiş gider varsa bu ay kapanmadan önce kaydet. Özellikle:
- Kredi kartı ekstresi giderleri
- Makbuzu olan küçük giderler

**Adım 4 — Dönem Kapat**
CFO veya muhasebe rolüne sahip kullanıcı şu adımları izler:
1. CFO Merkezi > Dönem Kapatma
2. 8 maddelik kontrol listesini işaretle (her madde için kısaca aşağıda)
3. "Dönemi Kapat" butonuna tıkla
4. Kapatma işlemi geri alınamaz; sistem dönem verilerini kilitler

**Dönem kapatma kontrol listesi hızlı özet:**
- Banka mutabakatı yapıldı mı?
- Tüm satış faturaları girildi mi?
- Tüm giderler kaydedildi mi?
- Stok sayımı yapıldı mı?
- KDV beyanı hazır mı?
- Mizan dengeli mi?
- Ortak huzur hakkı işlendi mi?
- Faiz tahakkukları hesaplandı mı?

---

### 10.3 Ortak Kredisi Ekleme ve Takibi

Bir ortak şirkete nakit kredi sağladığında:

**Adım 1 — Ortak Kaydını Kontrol Et**
Ortaklar > Pozisyon ekranında ortağın zaten kayıtlı olduğundan emin olun.

**Adım 2 — Yeni Dilim Gir**
1. Ortaklar > Dilimler sekmesine git
2. "Yeni Dilim" butonuna tıkla
3. Doldurun:
   - Ortak adı
   - Tutar
   - Vade türü: Kısa vadeli (≤12 ay) veya Uzun vadeli
   - Faiz oranı (varsa)
   - Vade tarihi
4. Kaydet

Sistem otomatik olarak muhasebe kaydı yazar: Banka hesabı borçlu, ortak cari hesabı alacaklı.

**Adım 3 — Geri Ödeme Kaydet**
1. Ortaklar > Geri Ödeme sekmesine git
2. "Ödeme Kaydet" tıkla
3. Hangi dilime ödeme yapıldığını seç
4. Ödeme tutarı ve tarihini gir
5. Kaydet

**Adım 4 — Bakiye Takibi**
Dilimler sekmesinden her döneme ait kalan bakiye, ödenen anapara ve işlemiş faiz görülebilir.

---

*Bu kılavuz Flowra v2.0 sürümü için hazırlanmıştır. Ekran görüntüleri ve menü yolları minor güncellemelerle değişebilir.*
