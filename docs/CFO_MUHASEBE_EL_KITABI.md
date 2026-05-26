# Flowra CFO El Kitabı

**Mali İşler ve Muhasebe Uzmanları için Teknik Başvuru Kılavuzu**

Bu el kitabı, Flowra'yı muhasebe ve finansal kontrol amacıyla kullanan CFO'lar, muhasebeciler ve mali müşavirler için hazırlanmıştır. MSUGT hesap planı, çift taraflı kayıt sistemi ve Türk muhasebe standartları hakkında temel bilgi varsayılmaktadır.

---

## İçindekiler

1. [Muhasebe Mimarisi Genel Bakış](#1-muhasebe-mimarisi-genel-bakış)
2. [Hesap Planı (Hesap Planı)](#2-hesap-planı)
3. [Otomatik Muhasebe Fişi Kuralları](#3-otomatik-muhasebe-fişi-kuralları)
4. [GL Modları — Anlamları ve Geçiş Stratejisi](#4-gl-modları--anlamları-ve-geçiş-stratejisi)
5. [Mizan (Trial Balance)](#5-mizan-trial-balance)
6. [Muhasebe Fişleri Görüntüleyici](#6-muhasebe-fişleri-görüntüleyici)
7. [Dönem Kapatma Süreci](#7-dönem-kapatma-süreci)
8. [GL'den Finansal Tablolar](#8-glden-finansal-tablolar)
9. [KDV Yönetimi](#9-kdv-yönetimi)
10. [Ortak Finansmanı ve Dağıtımlar](#10-ortak-finansmanı-ve-dağıtımlar)
11. [Mutabakat Süreci](#11-mutabakat-süreci)
12. [Denetim İzi](#12-denetim-i̇zi)
13. [Doğruluk Kontrolü](#13-doğruluk-kontrolü)

---

## 1. Muhasebe Mimarisi Genel Bakış

### 1.1 Üç Katmanlı Model

Flowra'nın muhasebe altyapısı üç katmandan oluşur:

```
┌─────────────────────────────────────────────────────────┐
│  KATMAN 3: FİNANSAL TABLOLAR                            │
│  Gelir Tablosu · Bilanço · Nakit Akışı · KDV Özeti      │
│  (GL hesaplarının işlenmiş toplamları)                   │
├─────────────────────────────────────────────────────────┤
│  KATMAN 2: MUHASEBE FİŞLERİ (Journal Entries)           │
│  Her işlem için otomatik oluşturulan borç/alacak çifti   │
│  Kaynak referansı, fiş numarası, dönem bilgisi           │
├─────────────────────────────────────────────────────────┤
│  KATMAN 1: OPERASYONELİ VERİ                            │
│  Satışlar · Giderler · Satın Almalar · Ortak İşlemleri   │
│  (Ham iş verileri; kullanıcılar doğrudan bu katmana girer)│
└─────────────────────────────────────────────────────────┘
```

**Neden bu mimarı?**

Operasyonel veri, günlük iş süreçlerini yansıtır ve teknik muhasebe bilgisi gerektirmeden girilebilir. Muhasebe fişleri, her operasyonel olayı otomatik olarak MSUGT uyumlu çift taraflı kayda dönüştürür. Finansal tablolar ise yalnızca bu fişlerden türetilir; hiçbir tablo elle doldurulmaz.

### 1.2 Çift Taraflı Kaydın Önemi

Her finansal işlem iki tarafı olan bir transfer olarak kodlanır: bir hesap borçlu (DR) olurken eş değer tutarda başka bir hesap alacaklı (CR) olur. Bu denge hiçbir zaman bozulamaz.

Çift taraflı kayıt sistemi şunları garanti eder:
- Herhangi bir dönemde toplam DR = toplam CR
- Herhangi bir hesabın bakiyesi her an doğru hesaplanabilir
- Hata veya manipülasyon anında tespit edilebilir (mizan dengesizliği oluşur)

### 1.3 Otomatik Fiş Oluşturma

Flowra'da kullanıcı muhasebe fişi yazmaz; sistem yazar. Bir satış, gider veya ortak işlemi kaydedildiğinde:

1. Olay tetikleyicisi (`sale.created`, `expense.paid`, `partner_loan.created` vb.) ateşlenir.
2. İlgili muhasebe kuralı uygulanır (bkz. Bölüm 3).
3. `journal_entries` tablosuna fatura numarasına bağlı bir veya daha fazla satır eklenir.
4. Her satır: `account_code`, `debit`, `credit`, `period`, `source_type`, `source_id`, `voucher_no`, `created_at` alanlarını taşır.

GL modu `shadow` iken sistem fiş üretmez; yalnızca operasyonel verileri toplar. `parallel` ve `gl_primary` modlarında otomatik fiş üretimi aktiftir (bkz. Bölüm 4).

---

## 2. Hesap Planı

Flowra, Muhasebe Sistemi Uygulama Genel Tebliği (MSUGT) çerçevesinde aşağıdaki hesapları kullanır:

### 2.1 Aktif Hesaplar (Varlıklar)

| Hesap No | Hesap Adı | Açıklama |
|----------|-----------|----------|
| **100** | Kasa | İşyerinde tutulan nakit para |
| **102** | Bankalar | Banka vadesiz hesap bakiyeleri |
| **120** | Alıcılar | Müşterilere yapılan satışlardan doğan ticari alacaklar |
| **153** | Ticari Mallar | Satılmak amacıyla tutulan stok; FIFO yöntemiyle değerlenir |
| **191** | İndirilecek KDV | Tedarikçilere ödenen ve indirim konusu yapılabilecek KDV |
| **253** | Tesis Makine Teçhizat | Demirbaş ve makine ekipmanın kayıtlı değeri |
| **257** | Birikmiş Amortismanlar | 253'e karşı eksi bakiyeli; net defter değeri = 253 - 257 |

### 2.2 Pasif Hesaplar (Yükümlülükler)

| Hesap No | Hesap Adı | Açıklama |
|----------|-----------|----------|
| **320** | Satıcılar | Tedarikçilere olan ticari borçlar |
| **321** | Ortaklara Borçlar - Kısa Vadeli | 12 ay veya daha kısa vadeli ortak kredileri |
| **335** | Personele Borçlar | Ödenmemiş maaş ve SGK yükümlülükleri |
| **360** | Ödenecek Vergi | Kurumlar vergisi ve diğer vergi yükümlülükleri |
| **391** | Hesaplanan KDV | Müşterilere faturalanan çıkış KDV'si |
| **421** | Ortaklara Borçlar - Uzun Vadeli | 12 ayı aşan vadeli ortak kredileri |

### 2.3 Öz Kaynak Hesapları

| Hesap No | Hesap Adı | Açıklama |
|----------|-----------|----------|
| **500** | Sermaye | Tescil edilmiş ve ödenmiş sermaye tutarı |
| **542** | Yasal Yedekler | TTK 519 kapsamında ayrılan kâr yedekleri |
| **570** | Geçmiş Yıllar Kârları | Kapatılmış dönemlerden devredilen birikmiş kârlar |
| **590** | Dönem Net Kârı | Cari dönemde oluşan net kâr (dönem sonunda 570'e aktarılır) |

### 2.4 Gelir Hesapları

| Hesap No | Hesap Adı | Açıklama |
|----------|-----------|----------|
| **600** | Yurt İçi Satışlar | KDV hariç faturalanmış yurt içi satış tutarları |

### 2.5 Gider Hesapları

| Hesap No | Hesap Adı | Açıklama |
|----------|-----------|----------|
| **620** | Satılan Malın Maliyeti | Satılan stok birimlerinin FIFO maliyet tutarı |
| **760** | Pazarlama/Dağıtım Giderleri | Reklam, tanıtım, satış komisyonları |
| **770** | Genel Yönetim Giderleri | Ofis, yönetim, kırtasiye giderleri |
| **771** | Maaş Giderleri | Brüt ücretler ve işveren SGK primleri |
| **772** | Kira Giderleri | Ofis, depo ve diğer mülk kiralamaları |
| **773** | Yazılım/Abonelik | SaaS abonelikler, yazılım lisansları |
| **780** | Finansman Giderleri | Kredi faizi, banka komisyonları, kur farkı giderleri |

---

## 3. Otomatik Muhasebe Fişi Kuralları

Aşağıdaki tablo, her tetikleyici olay için Flowra'nın ürettiği fişi göstermektedir. KDV'li işlemlerde fiş iki satır değil; gelir/gider, KDV ve nakit/alacak olmak üç veya dört satırdan oluşabilir.

### 3.1 Fiş Tablosu

| Olay | Borç (DR) | Alacak (CR) | Tutar Açıklaması |
|------|-----------|------------|-----------------|
| **Satış tahakkuku** (sale.created) | 120 Alıcılar | 600 Yurt İçi Satışlar | KDV hariç satış tutarı |
| | 120 Alıcılar | 391 Hesaplanan KDV | KDV tutarı (DR 120 = satış + KDV toplamı) |
| **Satılan mal maliyeti** (sale.created, eş zamanlı) | 620 Satılan Malın Maliyeti | 153 Ticari Mallar | Satılan birimlerin FIFO maliyeti |
| **Tahsilat** (sale_payment.created) | 102 Bankalar | 120 Alıcılar | Tahsil edilen tutar |
| **Gider tahakkuku — bankadan ödeme** | 7xx Gider Hesabı | 102 Bankalar | Gider KDV hariç tutarı |
| | 191 İndirilecek KDV | 102 Bankalar | Giderdeki KDV tutarı |
| **Gider tahakkuku — borçlanarak** | 7xx Gider Hesabı | 320 Satıcılar | Gider KDV hariç tutarı |
| | 191 İndirilecek KDV | 320 Satıcılar | Giderdeki KDV tutarı |
| **Satın alma — bankadan ödeme** | 153 Ticari Mallar | 102 Bankalar | KDV hariç alım fiyatı |
| | 191 İndirilecek KDV | 102 Bankalar | Alımdaki KDV tutarı |
| **Satın alma — vadeli** | 153 Ticari Mallar | 320 Satıcılar | KDV hariç alım fiyatı |
| | 191 İndirilecek KDV | 320 Satıcılar | Alımdaki KDV tutarı |
| **Ortak kredi girişi — kısa vadeli** | 102 Bankalar | 321 Ortaklara Borçlar (KV) | Aktarılan tutar |
| **Ortak kredi girişi — uzun vadeli** | 102 Bankalar | 421 Ortaklara Borçlar (UV) | Aktarılan tutar |
| **Ortak geri ödemesi** | 321 veya 421 Ortaklara Borçlar | 102 Bankalar | Ödenen anapara tutarı |
| **Faiz tahakkuku** | 780 Finansman Giderleri | 321 veya 421 | Dönem faiz tutarı |
| **Temettü beyanı** | 590 Dönem Net Kârı | 335 Personele Borçlar (veya ortak alacak) | Brüt temettü tutarı |
| | 335 | 360 Ödenecek Vergi | %10 GVK 94 stopaj tutarı |
| **Dönem sonu kâr aktarımı** | 590 Dönem Net Kârı | 542 Yasal Yedekler | Kârın %5'i (TTK 519 sınırı dolmamışsa) |
| | 590 Dönem Net Kârı | 570 Geçmiş Yıllar Kârları | Kalan net kâr |

### 3.2 Örnek: Tam KDV'li Satış Fişi

Müşteriye 100.000 TRY + %18 KDV = 118.000 TRY fatura kesildi; malın FIFO maliyeti 65.000 TRY:

```
Fiş No: JE-2026-00147
Kaynak: sale#1042
Tarih:  2026-03-15

  120 Alıcılar          DR  118.000,00
    600 Yurt İçi Satışlar      CR  100.000,00
    391 Hesaplanan KDV         CR   18.000,00

  620 Satılan Malın Maliyeti  DR   65.000,00
    153 Ticari Mallar          CR   65.000,00

Toplam DR: 183.000,00  |  Toplam CR: 183.000,00  ✓
```

---

## 4. GL Modları — Anlamları ve Geçiş Stratejisi

Her şirket, `companies` tablosundaki `gl_mode` sütunuyla üç moddan birinde çalışır.

### 4.1 Shadow Modu

`gl_mode = 'shadow'`

**Ne çalışır:** Tüm operasyonel fonksiyonlar aktiftir. Satışlar, giderler, stok, ortak işlemleri kaydedilebilir. Dashboard KPI'ları operasyonel veriden hesaplanır.

**Ne çalışmaz:** Muhasebe fişi üretilmez. Mizan, GL tabanlı gelir tablosu ve bilanço görüntülenemez. `/dashboard/cfo/trial-balance` boş görünür.

**Ne zaman kullanılır:** Sisteme ilk geçiş döneminde, muhasebe altyapısı kurulmadan önce. Veri kalitesini test etmek için önerilir. Şirket shadow modda aylarca çalışabilir; bu sürede veriler toplanır ama GL doğrulanmamıştır.

**Riski:** Finansal tablolar GL tabanlı değildir; yalnızca dashboard projeksiyonları gösterilir. Denetim için yeterli değildir.

### 4.2 Parallel Mod

`gl_mode = 'parallel'`

**Ne çalışır:** Her yeni operasyonel kayıt için eş zamanlı muhasebe fişi üretilir (çift yazım). Hem operasyonel hem GL bazlı tablolar gösterilir. Sistem iki kaynağı karşılaştıran doğrulama raporları üretir.

**Ne zaman kullanılır:** Shadow'dan GL Primary'ye geçiş aşaması. Minimum 2-3 tam dönem (ay) parallel modda kalınması önerilir. Bu sürede GL sonuçları ile mevcut muhasebe programınızın sonuçları karşılaştırılır.

**Doğrulama:** `/api/admin/gl-shadow-audit` endpoint'i parallel dönemdeki sapmaları listeler. Gelir tablosu farkı < %0,5 ise geçişe hazırsınız demektir.

**Öneri:** Parallel geçişten önce tüm açık alacak ve borçların sisteme aktarılmış olması gerekir. Eski dönem bakiyeleri açılış fişi olarak girilmelidir.

### 4.3 GL Primary Modu

`gl_mode = 'gl_primary'`

**Ne çalışır:** GL (muhasebe defteri) gerçeğin tek kaynağıdır. Tüm finansal tablolar yalnızca `journal_entries` tablosundan türetilir. Operasyonel kayıtlar yardımcı defter niteliğindedir.

**Finansal tablolar nasıl değişir:**
- Gelir tablosu: 600 hesabının CR bakiyesi = toplam gelir; 620-780 hesapların DR bakiyesi = toplam gider
- Bilanço: Tüm hesapların kümülatif net bakiyeleri
- Nakit akışı: 102 hesabındaki hareketlerin kaynak tipine göre sınıflandırılması

**Ne zaman geçilir:** En az iki tam dönem parallel çalışmış ve doğrulama raporlarında sapma < %0,5 ise.

### 4.4 Mevcut GL Modunu Kontrol Etme

```sql
SELECT id, name, gl_mode
FROM companies
WHERE id = '<your_company_id>';
```

GL modunu değiştirmek admin yetkisi gerektirir ve `/dashboard/admin` üzerinden yapılır. Mod değişikliği geri alınamaz (shadow → parallel → gl_primary tek yönlü).

---

## 5. Mizan (Trial Balance)

### 5.1 Mizanı Okuma

Mizana `/dashboard/cfo/trial-balance` adresinden ulaşılır. GL modu parallel veya gl_primary olduğunda aktiftir.

Mizan, seçilen dönem sonu itibarıyla tüm hesapların borç ve alacak kalanlarını listeler. Her satırda şunlar görülür:

- **Hesap Kodu ve Adı**
- **Dönem DR:** Bu dönem içinde hesaba yapılan borç girişleri toplamı
- **Dönem CR:** Bu dönem içinde hesaba yapılan alacak girişleri toplamı
- **Bakiye (Kalanlar sütunu):** Kümülatif net bakiye; aktif hesaplar için DR fazlası normal, pasif ve öz kaynak hesapları için CR fazlası normaldir

### 5.2 DR = CR İnvaryantı

Mizanın en alt satırında şu kontrolün sağlanmış olması gerekir:

```
Toplam Borç Kalanı = Toplam Alacak Kalanı
```

Bu denge, sistemin her işlemi eksiksiz çift taraflı kaydettiğinin garantisidir. Flowra bu dengeyi her dönem hesaplamasında otomatik kontrol eder.

### 5.3 Dengesizlik Durumunda Ne Yapılır

Mizan sayfasında kırmızı uyarı görüyorsanız şu adımları izleyin:

1. **Fark tutarını not alın:** Toplam DR - Toplam CR = fark tutarı.
2. **Son girilen fişleri inceleyin:** `/dashboard/cfo/journal-entries` filtresinde son 24 saati seçin. Tek taraflı kalan bir fiş satırı var mı?
3. **Kaynak işlemi kontrol edin:** Fiş kaynak ID'sini bulun (sale#XXX, expense#XXX gibi). Operasyonel kayıt tamamlanmış mı, yoksa yarım mı kalmış?
4. **Teknik destek:** Otomatik oluşturulan fişlerde manuel düzeltme yapamazsınız; sistemi yeniden tetiklemek gerekiyorsa teknik destek açın.

Elle yazılmış düzeltme fişleri (CFO Merkezi > Yevmiye Maddeleri) her zaman tam çift taraflı olmalıdır.

### 5.4 Dönem Bazlı ve Kümülatif Görünüm

Mizan sayfasında üst sağ köşede iki görünüm seçeneği bulunur:

- **Dönem Bazlı:** Yalnızca seçili ay içindeki hareketler
- **Kümülatif:** Şirket kuruluşundan bugüne tüm dönemlerin birikimli bakiyesi

Dönem bazlı mizan, aylık kapanış kontrolü için kullanılır. Kümülatif mizan, bilanço hesaplarının gerçek bakiyelerini yansıtır.

---

## 6. Muhasebe Fişleri Görüntüleyici

### 6.1 Fişlere Erişim

`/dashboard/cfo/journal-entries` adresine gidin. Varsayılan görünüm cari ayın tüm fişlerini gösterir; en yeni fiş en üsttedir.

### 6.2 Filtreleme

Üst çubukta şu filtreler mevcuttur:
- **Tarih aralığı:** Başlangıç ve bitiş tarihi
- **Kaynak tipi (source_type):** Aşağıdaki tabloya bakın
- **Hesap kodu:** Belirli bir hesabı içeren fişler
- **Fiş numarası:** JE-YYYY-NNNNN formatında doğrudan arama

### 6.3 Fiş Numarası Formatı

Her fiş benzersiz bir numara taşır:

```
JE-2026-00001
│   │     │
│   │     └── Dönem içindeki sıra numarası (5 hane, sıfır dolgusu)
│   └──────── Yıl
└──────────── Journal Entry sabit öneki
```

### 6.4 Kaynak Tipi (source_type) Açıklaması

| source_type | Açıklama | Tetikleyen Olay |
|-------------|----------|----------------|
| `sale` | Satış tahakkuku | Proformadan satışa dönüştürme veya doğrudan satış |
| `expense` | Gider kaydı | Gider onayı ve ödeme |
| `purchase` | Satın alma | Satın alma finalize edildiğinde |
| `sale_payment` | Tahsilat | Müşteriden ödeme alındığında |
| `partner_loan` | Ortak kredi | Ortak kredi dilimi girildiğinde |
| `partner_repayment` | Ortak geri ödeme | Ortak borcuna ödeme yapıldığında |
| `dividend_declared` | Temettü beyanı | Dağıtım kararı alındığında |
| `period_close` | Dönem kapanışı | Dönem kapatıldığında (590 → 570 + 542 aktarımı) |
| `manual` | Elle yazılan fiş | CFO düzeltme kaydı |

### 6.5 İptal (Reversal) Fişleri

Hatalı bir fişin iptali gerektiğinde orijinal fişin tüm borç/alacak tarafları yer değiştirir. İptal fişleri `is_reversal = true` ve `reversal_of` alanında orijinal fişin ID'sini taşır. Listedeki iptal fişleri turuncu "İPTAL" etiketi ile işaretlenmiştir.

**Önemli:** Otomatik oluşturulan fişler doğrudan iptal edilemez; önce operasyonel kayıt geri alınmalı veya düzeltilmeli, sistem fark fişini otomatik oluşturur. Yalnızca `source_type = 'manual'` olan fişler CFO arayüzünden iptale konu olabilir.

---

## 7. Dönem Kapatma Süreci

Dönem kapatma işlemi `/dashboard/cfo` üzerinden yapılır. Kapatma geri alınamaz; kilitlenmiş dönemin fişleri değiştirilemez.

### 7.1 Sekiz Maddelik Kontrol Listesi

Her madde sistem tarafından otomatik kontrol edilebilir veya CFO tarafından manuel olarak işaretlenebilir.

---

**Madde 1 — Banka Mutabakatı (Banka Mutabakatı)**

Sistem 102 Bankalar hesabının dönem sonu bakiyesinin banka ekstresiyle örtüşüp örtüşmediğini kontrol etmenizi ister. Mutabakat farkı sıfır olmalıdır.

*Türk mevzuatı notu:* VUK 219 kapsamında her hesap dönemi için banka mutabakatının yazılı belgesi tutulmalıdır.

---

**Madde 2 — Tüm Satış Faturaları Girildi**

Dönem içinde düzenlenen tüm satış faturalarının sisteme eklenmiş olduğu doğrulanır. Eksik fatura varsa bu dönemin geliri eksik raporlanır.

*Kontrol:* Fiziksel fatura klasörü veya e-fatura portali kayıtlarıyla sistemdeki satışları karşılaştırın.

---

**Madde 3 — Tüm Masraflar Girildi**

Dönem içindeki tüm tedarikçi faturaları ve giderler sisteme kaydedilmiş olmalıdır. Özellikle ay sonuna yakın gelen kredi kartı ekstresi giderleri atlanabilir; dikkat edin.

---

**Madde 4 — Stok Sayımı (Stok Sayımı)**

Sistemdeki stok adetleri ile fiziksel depo sayımının eşleşip eşleşmediği kontrol edilir. Fark varsa fire, hırsızlık veya giriş hatası araştırılmalıdır.

*FIFO notu:* Stok adedi farkı varsa lot bazında inceleme yapın; hangi lot eksik veya fazla?

---

**Madde 5 — KDV Beyanı Hazır (KDV Beyanı Hazır)**

Dönemin KDV özet tablosu Finans Hub > Vergi sekmesinden kontrol edilir. 391 Hesaplanan KDV - 191 İndirilecek KDV = Ödenecek KDV net rakamı beyanname formuna aktarılmaya hazır olmalıdır.

*Beyanname tarihi:* KDV beyannamesi her ayın 26'sına kadar e-beyanname ile verilmelidir.

---

**Madde 6 — Mizan Dengeli (Mizan Dengeli)**

`/dashboard/cfo/trial-balance` adresinde toplam DR = toplam CR eşitliği sağlanmış olmalıdır. Fark varsa kapatma işlemi engellenebilir; fark giderilene kadar bu madde işaretlenemez.

---

**Madde 7 — Ortak Huzur Hakkı İşlendi (Ortak Huzur Hakkı İşlendi)**

TTK 394 kapsamında yönetim kurulu üyesi olan ortaklara huzur hakkı ödemesi yapılmaktadır. Bu ödeme dönem içinde gider olarak kaydedilmiş ve SGK'ya bildirilmiş olmalıdır.

*Muhasebe kaydı:* DR 771 Maaş Giderleri | CR 335 Personele Borçlar, ardından ödeme yapıldığında DR 335 | CR 102

---

**Madde 8 — Faiz Tahakkukları Hesaplandı (Faiz Tahakkukları Hesaplandı)**

Ortak kredileri ve banka kredileri üzerinde dönem içinde işleyen faizler tahakkuk ettirilmiş olmalıdır. Sistem, aktif dilimler üzerindeki faizi otomatik hesaplar; CFO bu rakamı onaylar.

*Muhasebe kaydı:* DR 780 Finansman Giderleri | CR 321 veya 421 Ortaklara Borçlar

---

### 7.2 Kapatma Sonrası İşlemler

Tüm maddeler işaretlendikten ve "Dönemi Kapat" tıklandıktan sonra sistem:

1. Dönem net kârını aktarır:
   ```
   DR 590 Dönem Net Kârı   (kâr tutarının tamamı)
     CR 542 Yasal Yedekler    (kârın %5'i; TTK 519 sınırına kadar)
     CR 570 Geçmiş Yıllar Kârları  (kalan tutar)
   ```
2. Dönem için snapshot (anlık görüntü) oluşturur; bu görüntü değiştirilemez.
3. Dönem `is_locked = true` olarak işaretlenir; bu dönemdeki tüm operasyonel ve muhasebe kayıtları salt okunur hale gelir.

---

## 8. GL'den Finansal Tablolar

### 8.1 Gelir Tablosu

GL primary modunda gelir tablosu şu şekilde hesaplanır:

```
Satış Geliri
  = 600 Hesabının dönem CR bakiyesi
  (tüm JE satırlarından WHERE account_code = '600' AND credit > 0)

Satılan Malın Maliyeti (COGS)
  = 620 Hesabının dönem DR bakiyesi

BRÜT KÂR = Satış Geliri - COGS
Brüt Marj % = (Brüt Kâr / Satış Geliri) × 100

Faaliyet Giderleri = DR bakiyesi toplamı (760 + 770 + 771 + 772 + 773)
FAALİYET KÂRI (EBIT) = Brüt Kâr - Faaliyet Giderleri

Finansman Giderleri = DR bakiyesi (780)
VERGİ ÖNCESİ KÂR (EBT) = EBIT - Finansman Giderleri

Kurumlar Vergisi = EBT × 0,25  (Kurumlar Vergisi %25)
NET KÂR = EBT - Kurumlar Vergisi
```

### 8.2 Bilanço

Denklem: **Toplam Aktif = Toplam Pasif + Öz Kaynak**

**Dönen Varlıklar:**
- Kasa ve Bankalar: 100 + 102 DR kalanı
- Ticari Alacaklar: 120 DR kalanı
- İndirilecek KDV: 191 DR kalanı
- Stok: 153 DR kalanı

**Duran Varlıklar:**
- Net Maddi Duran Varlıklar: 253 DR kalanı - 257 CR kalanı

**Kısa Vadeli Yükümlülükler:**
- Satıcılar: 320 CR kalanı
- Ortaklara Kısa Vadeli Borç: 321 CR kalanı
- Personele Borç: 335 CR kalanı
- Ödenecek Vergi: 360 CR kalanı
- Hesaplanan KDV: 391 CR kalanı

**Uzun Vadeli Yükümlülükler:**
- Ortaklara Uzun Vadeli Borç: 421 CR kalanı

**Öz Kaynak:**
- Sermaye: 500 CR kalanı
- Yasal Yedekler: 542 CR kalanı
- Geçmiş Yıllar Kârları: 570 CR kalanı
- Dönem Net Kârı: 590 CR kalanı

**Denge kontrolü:** |Toplam Aktif - (Toplam Pasif + Öz Kaynak)| < 0,01 TRY

Bu eşik aşıldığında sistem bilanço sayfasında kırmızı uyarı gösterir.

### 8.3 Nakit Akış Tablosu (Doğrudan Yöntem)

Nakit akış tablosu 102 Bankalar hesabındaki hareketleri kaynak tipine göre sınıflandırır:

**İşletme Faaliyetlerinden Nakit Akışı:**
```
+ Müşterilerden Tahsilatlar
    (102 DR hareketi WHERE source_type = 'sale_payment')
- Tedarikçilere Ödemeler
    (102 CR hareketi WHERE source_type IN ('purchase', 'expense'))
- Ödenen Vergiler
    (102 CR hareketi WHERE source_type = 'tax_payment')
= Net İşletme Nakit Akışı
```

**Yatırım Faaliyetlerinden Nakit Akışı:**
```
- Ekipman / Demirbaş Alımları
    (102 CR hareketi, karşı hesap 253)
= Net Yatırım Nakit Akışı
```

**Finansman Faaliyetlerinden Nakit Akışı:**
```
+ Ortak Kredisi Girişi
    (102 DR hareketi WHERE source_type = 'partner_loan')
- Ortak Kredisi Geri Ödemesi
    (102 CR hareketi WHERE source_type = 'partner_repayment')
+ Sermaye Artışı
    (102 DR hareketi, karşı hesap 500)
- Temettü Ödemesi
    (102 CR hareketi WHERE source_type = 'dividend_declared')
= Net Finansman Nakit Akışı
```

**Net Nakit Değişimi = İşletme + Yatırım + Finansman**

Dönem başı nakit + Net değişim = Dönem sonu nakit  
Bu rakam 102 hesabının dönem sonu bakiyesiyle örtüşmelidir.

---

## 9. KDV Yönetimi

### 9.1 KDV Mekanizması

Türkiye'de KDV, nihai tüketici tarafından yüklenilen dolaylı bir vergidir. Şirket, aşağıdaki mekanizmayla vergi dairesine aracılık eder:

**Çıkış KDV (391 Hesaplanan KDV):**
Müşterilere düzenlenen faturalarda tahsil edilen KDV. Her satışta CR 391 olarak kaydedilir. Şirket bu tutarı müşteri adına devlet için tutar.

**Giriş KDV (191 İndirilecek KDV):**
Tedarikçilerden alınan faturalarda ödenen KDV. Her satın alma ve giderde DR 191 olarak kaydedilir. Bu tutar çıkış KDV'sinden mahsup edilir.

**Net KDV Borcu:**
```
Ödenecek KDV = 391 hesabı CR kalanı - 191 hesabı DR kalanı
```

Fark pozitifse vergi dairesine ödeme yapılır (360 Ödenecek Vergi hesabına aktarılır).  
Fark negatifse (giriş > çıkış) iade hakkı doğar; bir sonraki döneme devreder.

### 9.2 KDV Oranları

| Oran | Kapsam |
|------|--------|
| %18 | Standart oran; genel ticari mallar ve hizmetler |
| %10 | İndirimli oran; bazı gıda, tarım, sağlık ürünleri |
| %1 | Özel indirimli; bazı temel gıda maddeleri |

### 9.3 KDV Beyannamesini Hazırlama

1. Finans Hub > Vergi sekmesine gidin.
2. Beyan dönemini (ay) seçin.
3. Şu üç satırı not alın:
   - Hesaplanan KDV (391 kalanı): müşteriden tahsil edilen
   - İndirilecek KDV (191 kalanı): tedarikçiye ödenen
   - Ödenecek / İade Edilecek KDV: fark
4. "KDV Raporu İndir" butonuyla Excel çıktısı alın.
5. Bu rakamları e-beyanname sistemine (GİB) aktarın.

*Beyanname süresi:* Her ayın 26'sına kadar verilmeli, aynı gün ödenmelidir.

---

## 10. Ortak Finansmanı ve Dağıtımlar

### 10.1 PCLE (Ortak Sermaye ve Borç Motoru)

PCLE (Partner Capital & Liability Engine), Flowra'nın ortak finansal pozisyonlarını tek bir çatı altında yöneten modülüdür. Şunları izler:

- Her ortağın sermaye tutarı (500 hesabındaki payları)
- Her ortağın şirkete verdiği kredi bakiyeleri (321 ve 421)
- Her ortağın temettü alma hakkı
- Ortak kredi / öz kaynak dengesizlik riski

### 10.2 İki Aşamalı Geri Ödeme Şelalesi

Birden fazla ortak kredi verdiğinde geri ödeme sırası şöyle belirlenir:

**Aşama 1 — Normalleştirme (Normalization Phase):**

Her ortağın "beklenen kredi oranı" vardır: toplam kredideki payı, öz kaynak payıyla orantılı olmalıdır. Orantısızlık varsa — yani bir ortak, pay oranına kıyasla çok daha fazla kredi vermişse — bu dengesizlik önce giderilir.

Örnek:
- Ortak A: %60 pay → 600.000 TRY kredi vermeli
- Ortak B: %40 pay → 400.000 TRY kredi vermeli
- Gerçekte A 900.000 TRY vermiş (300.000 TRY fazla), B 100.000 TRY (300.000 TRY eksik)
- Normalleştirme aşamasında A'ya önce 300.000 TRY geri ödenir.

**Aşama 2 — Pro-Rata Aşaması:**

Normalleştirme tamamlandıktan sonra kalan geri ödemeler ortakların pay oranına göre eş zamanlı yapılır.

Bu yapı, büyük kredi veren ortağın küçük ortakları kademeli olarak dışlamasını önler.

### 10.3 TTK 519 — Yasal Yedekler

Türk Ticaret Kanunu'nun 519. maddesi uyarınca:

- Her hesap döneminde net kârın **%5**'i yasal yedek olarak ayrılır.
- Yasal yedekler, ödenmiş sermayenin **%20**'sine ulaşana kadar zorunludur.
- Bu sınır aşıldıktan sonra yedek ayırma isteğe bağlı hale gelir.
- Yasal yedekler temettü olarak dağıtılamaz; yalnızca zarar mahsubu veya sermayeye ekleme amacıyla kullanılabilir.

**Dönem sonu muhasebe kaydı:**
```
DR 590 Dönem Net Kârı     10.000,00
  CR 542 Yasal Yedekler              10.000,00
  (Kârın %5'i; 500 hesabının %20 sınırı dolmamışsa)
```

### 10.4 TTK 509 — Temettü Kısıtı

Şirket, dönemde net kâr elde etmeden temettü dağıtamaz. Geçmiş yıl birikmiş kârından dağıtım yapılabilir; ancak bu da yasal yedek minimumu korunduğu sürece mümkündür.

Flowra, dağıtım miktarı dağıtılabilir kârı aşacaksa uyarı üretir ve işlemi engeller.

### 10.5 GVK 94 — Temettü Stopajı

Gelir Vergisi Kanunu'nun 94. maddesi uyarınca:

- Dağıtılan temettü üzerinden **%10** stopaj vergisi kesilir.
- Stopajı şirket keserek vergi dairesine yatırır.
- Ortağın eline net tutar = Brüt temettü × 0,90

**Muhasebe kaydı (beyan aşaması):**
```
DR 590 Dönem Net Kârı         100.000,00
  CR 335 Ortaklara Temettü Borcu     90.000,00
  CR 360 Ödenecek Stopaj Vergisi     10.000,00
```

**Ödeme aşaması:**
```
DR 335 Ortaklara Temettü Borcu   90.000,00
  CR 102 Bankalar                       90.000,00

DR 360 Ödenecek Stopaj Vergisi   10.000,00
  CR 102 Bankalar                       10.000,00
```

### 10.6 TTK 394 — Huzur Hakkı

Yönetim kurulu üyelerine ödenen huzur hakkı, bir gider olup dönem kârı hesaplanmadan önce düşülmelidir. SGK'ya bildirim zorunludur (4/1-a veya 4/1-b kapsamında).

Sistemde Operasyon > Giderler > Kategori: "Maaş ve Personel" (771 hesabı) olarak kaydedilir.

---

## 11. Mutabakat Süreci

### 11.1 Mutabakat Snapshot Nedir?

Dönem kapanışında veya isteğe bağlı olarak oluşturulan bir mutabakat snapshot'ı, o anki finansal tablo değerlerinin değiştirilemez bir kaydını saklar. Her snapshot:

- Oluşturulma tarihi ve saati
- Dönem bilgisi
- 19 bölümlük mutabakat raporu verileri
- İmzalayan kullanıcıların adı ve zaman damgası
- SHA-256 hash değeri (bütünlük doğrulaması için)

### 11.2 19 Bölümlük Mutabakat Raporu

Bir mutabakat raporu şu bölümleri içerir:

1. Banka bakiyesi
2. Müşteri alacakları
3. Tedarikçi borçları
4. Stok değeri
5. Giriş KDV (191)
6. Çıkış KDV (391)
7. Net KDV pozisyonu
8. Ortak kısa vadeli borçlar (321)
9. Ortak uzun vadeli borçlar (421)
10. Personel borçları (335)
11. Vergi borçları (360)
12. Öz kaynak özeti
13. Dönem net kârı
14. Gelir tablosu özeti
15. Bilanço özeti
16. Nakit akışı özeti
17. Faaliyet giderleri detayı
18. Yasal yedek hesaplaması (TTK 519)
19. Dağıtılabilir kâr hesaplaması

### 11.3 Mutabakat Oluşturma

1. `/dashboard/admin` > Mutabakat sekmesine gidin.
2. **"Yeni Mutabakat Oluştur"** butonuna tıklayın.
3. Dönem ve başlık girin.
4. Sistem verileri toplayarak raporu oluşturur.
5. Her bölümü gözden geçirin ve onaylayın.
6. **"İmzala"** butonuyla mutabakatı imzalayın.

İkinci bir yetkili imzası gerekiyorsa sistem e-posta daveti gönderir.

### 11.4 İmzalama ve Arşivleme

Her mutabakat imzalanana kadar "Taslak" statüsündedir. İmzalandıktan sonra "Kapalı" olur ve içeriği değiştirilemez. İmzalı mutabakat PDF olarak indirilebilir; tarih damgası ve imza bilgileri içerir. PDF yasal kayıt amaçlı güvenli arşivde saklanmalıdır.

---

## 12. Denetim İzi

### 12.1 Denetim Günlükleri Nasıl Çalışır

Flowra, her finansal aksiyonu `audit_logs` tablosuna yazar. Kaydedilen olaylar:
- Muhasebe fişi oluşturma, güncelleme, iptal
- Satış, gider, satın alma CRUD işlemleri
- Dönem açma, kapatma
- Mutabakat imzalama
- Kullanıcı giriş/çıkış
- Rol değişiklikleri

Her log kaydı şu alanları içerir:

| Alan | Açıklama |
|------|----------|
| `id` | Benzersiz UUID |
| `company_id` | Hangi şirkete ait |
| `user_id` | İşlemi yapan kullanıcı |
| `action` | Eylem tipi (create, update, delete, approve, close vb.) |
| `entity_type` | Hangi varlık (sale, expense, journal_entry vb.) |
| `entity_id` | Varlığın ID'si |
| `payload` | İşlem öncesi ve sonrası değerler (JSON) |
| `content_hash` | Bu kaydın SHA-256 hash'i |
| `prev_hash` | Önceki kaydın hash'i (zincir) |
| `created_at` | Milisaniye hassasiyetinde timestamp |

### 12.2 SHA-256 Hash Zinciri ile Kurcalama Tespiti

Her audit log kaydı, önceki kaydın hash'ini içerir (`prev_hash`). Bu yapı, blockchain'deki blok zincirine benzer şekilde çalışır:

```
Log #1: content_hash = H(payload_1)         prev_hash = NULL
Log #2: content_hash = H(payload_2)         prev_hash = H(payload_1)
Log #3: content_hash = H(payload_3)         prev_hash = H(payload_2)
```

Geçmiş bir kaydı değiştirmeye çalışırsanız, o kaydın hash'i değişir. Sonraki kaydın `prev_hash` değeri artık uyuşmaz. Sistem, zincir doğrulamasını çalıştırarak kurcalamayı tespit edebilir.

Zincir doğrulaması yapmak için:
```
GET /api/admin/audit-chain-verify?from=2026-01-01&to=2026-03-31
```

Yanıt: `{ "valid": true, "checked": 4821, "broken_at": null }`

### 12.3 Denetim Günlüklerini Dışa Aktarma

`/dashboard/admin` > Denetim sekmesinde:
- Tarih aralığı ve kullanıcı filtresi uygulayabilirsiniz
- **"PDF İndir"** butonu: Filtreye uyan tüm kayıtları kronolojik PDF olarak çıkarır; PDF başlığında oluşturma tarihi, saat ve şirket bilgisi yer alır
- **"CSV İndir"** butonu: Ham veri; kendi raporlama araçlarınıza aktarmak için

PDF dışa aktarımı otomatik olarak audit log'a kaydedilir (kim, ne zaman dışa aktardı).

---

## 13. Doğruluk Kontrolü

### 13.1 GL Doğruluk Adımları

GL'nizin muhasebe gerçeğini doğru yansıtıp yansıtmadığını kontrol etmek için şu adımları izleyin:

**Adım 1 — GL Modunu Doğrula**
```sql
SELECT name, gl_mode FROM companies WHERE id = '<id>';
```
`gl_primary` ise tablolar GL'den geliyordur. `shadow` ise tablolar operasyonel tahminden geliyordur; farklı bir doğrulama yöntemi gerekir.

**Adım 2 — Mizan Dengesini Kontrol Et**
`/dashboard/cfo/trial-balance` adresine gidin. Toplam DR = Toplam CR mı? Fark < 0,01 TRY mi?

**Adım 3 — Kapsam Kontrolü**
Her satış, gider ve satın alımın bir karşılık fişi olup olmadığını kontrol edin:
```
GET /api/admin/gl-readiness
```
Yanıt şu alanları içerir:
```json
{
  "coverage_percent": 98.7,
  "missing_journals": [
    { "source_type": "sale", "source_id": "1234", "reason": "fiş üretilemedi" }
  ],
  "gl_mode": "gl_primary",
  "trial_balance_balanced": true
}
```

**Adım 4 — Shadow Denetim Karşılaştırması**
Parallel modda veya gl_primary'ye geçiş sonrasında, operasyonel toplamlar ile GL toplamlarının örtüşüp örtüşmediğini kontrol edin:
```
GET /api/admin/gl-shadow-audit?period=2026-03
```
Yanıt divergences listesi içerir. Her divergence için:
- `account_code`: Hangi hesapta fark var?
- `gl_amount`: GL'nin hesapladığı değer
- `operational_amount`: Operasyonel veriden hesaplanan değer
- `delta`: Fark tutarı

`delta` > 100 TRY olan satırları inceleyerek kök nedeni bulun.

### 13.2 Sık Karşılaşılan Sorunlar ve Çözümleri

| Sorun | Olası Neden | Çözüm |
|-------|------------|-------|
| Mizan dengesiz | Yarım kalan fiş satırı | Journal entries'de son fişleri kontrol et |
| Gelir tablosu boş | GL modu shadow | Şirketi parallel veya gl_primary'ye al |
| Coverage %100 değil | Bazı satışlar/giderler fiş üretemedi | `/api/admin/gl-readiness` çıktısındaki `missing_journals` listesini işle |
| Bilanço fark uyarısı | Açılış bakiyeleri eksik | Manuel açılış fişi oluştur; DR/CR dengeli olmalı |
| KDV hesabı yanlış | Doğru hesap kodu seçilmemiş | Gider kategorisi - hesap eşlemesini kontrol et |

### 13.3 API Endpoint Referansı

| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| `/api/admin/gl-shadow-audit` | GET | Operasyonel ve GL değer karşılaştırması |
| `/api/admin/gl-readiness` | GET | Kapsam yüzdesi ve eksik fiş listesi |
| `/api/admin/audit-chain-verify` | GET | Denetim zinciri kurcalama kontrolü |
| `/api/admin/trial-balance` | GET | Dönem bazlı veya kümülatif mizan verisi |
| `/api/admin/period-close-status` | GET | Dönem kontrol listesi durumu |

Tüm admin endpoint'leri `Authorization: Bearer <token>` başlığı ve CFO/Admin rolü gerektirir.

---

*Bu el kitabı Flowra v2.0 sürümü için hazırlanmıştır. MSUGT hesap planı referansları 2024 güncellemesine dayanmaktadır. Vergi oranları ve beyanname tarihleri Türk vergi mevzuatındaki değişikliklere göre güncellenebilir.*
