# Flowra — Sürüm Notları

**Son Güncelleme:** Mayıs 2026

---

## İçindekiler

- [v1.0.0 — Mayıs 2026](#v100--mayıs-2026-i̇lk-kurumsal-sürüm)
- [Teknik Gereksinimler](#teknik-gereksinimler)
- [Bilinen Sınırlamalar — v1.0](#bilinen-sınırlamalar--v10)
- [Gelecek Sürüm Yol Haritası](#gelecek-sürüm-yol-haritası)

---

## v1.0.0 — Mayıs 2026 (İlk Kurumsal Sürüm)

Flowra v1.0.0, Türk KOBİ'leri için tasarlanmış kurumsal düzeyde Finansal İşletim Sistemi'nin (Financial OS) ilk tam prodüksiyon sürümüdür. Bu sürüm, çift taraflı muhasebe sisteminden yapay zeka destekli anomali tespitine, ortaklık yönetiminden CEO komuta merkezine kadar uzanan eksiksiz bir finansal yönetim platformu sunar.

---

### Temel Özellikler

#### Çift Taraflı Muhasebe Sistemi (Double-Entry GL)

Her finansal işlem borç ve alacak dengesi korunarak kayıt altına alınır. Sistem, matematiksel olarak dengeli olmayan hiçbir kayıdı kabul etmez; bu da veri bütünlüğünü en temel düzeyde garanti eder.

- Her işlem için otomatik yevmiye kaydı oluşturma
- Hesap kodu tabanlı yapılandırılabilir hesap planı
- Dönemsel borç/alacak dengesi doğrulama
- Mizan üretimi (anlık ve dönem bazlı)
- GL Mod geçiş sistemi: shadow → parallel → gl_primary

#### PCLE Ortak Sermaye ve Borç Motoru (6 Sekme)

Türk KOBİ'lerinin en kritik finansal ilişkisi olan ortak sermaye ve borç yönetimi için özel olarak tasarlanmış modül.

- **Sekme 1 — Genel Bakış:** Tüm ortakların konsolide sermaye ve borç durumu
- **Sekme 2 — Sermaye:** Ortaklık payları, sermaye artırım/azaltım geçmişi
- **Sekme 3 — Borç Yönetimi:** Ortak borçları, vade takibi, faiz hesaplama
- **Sekme 4 — İşlem Geçmişi:** Tüm ortak hareketlerinin denetim izi
- **Sekme 5 — Mutabakat:** Ortak hesap mutabakatı ve doğrulama
- **Sekme 6 — Yönetişim:** Karar kayıtları, oylama ve audit hash zinciri

#### CEO Komuta Merkezi

C-suite yöneticiler için tasarlanmış, gerçek zamanlı karar destek ortamı.

- **Durum Motoru (Status Engine):** Şirketin finansal sağlığını beş renk kodlu göstergede özetleyen akıllı sistem
- **Karar Uyarıları:** Acil müdahale gerektiren finansal olayları öne çıkaran otomatik uyarı motoru
- **12 Aylık Tahmin:** Mevcut verilere dayalı nakit akış tahmini ve trend analizi
- **KPI Paneli:** Gelir, gider, net pozisyon ve ortak bakiyeleri anlık özeti

#### CFO Merkezi

Mali direktörler ve muhasebeciler için eksiksiz finansal yönetim ortamı.

- **Mizan:** Tüm hesapların anlık borç/alacak dengesi görünümü
- **Yevmiye Defteri:** Tüm kayıtların kronolojik listesi, arama ve filtre özellikleriyle
- **Dönem Kapanışı:** Kontrol listesi destekli muhasebe dönemi kapatma akışı
- **Hesap Planı Yönetimi:** Yapılandırılabilir hesap kodu ağacı
- **GL Mutabakat Paneli:** Paralel mod fark raporlama ve mutabakat arayüzü

#### İş Akışı Motoru (Workflow Engine)

Finansal süreçlerin çok aşamalı onay akışlarıyla yönetimi.

- **Masraf Onay Akışı:** Çalışan masraflarının çok adımlı onay süreçleri
- **Dönem Kapanışı Kontrol Listesi:** Dönem sonu kapatma işlemlerinin adım adım yönetimi
- **Otomatik Hatırlatmalar:** Vadesi yaklaşan onaylar için bildirim sistemi
- **Onay Geçmişi:** Her onayın kimin tarafından ne zaman verildiğinin tam denetim izi
- **Süresi Dolmuş İş Akışları:** Tamamlanmamış akışların otomatik işlenmesi

#### Çoklu Şirket Yönetimi

Tek bir Flowra kurulumunda birden fazla şirketin bağımsız olarak yönetilmesi.

- Her şirket için tamamen ayrı veri ve yapılandırma
- Kullanıcı bazlı şirket erişim kontrolü (bir kullanıcı birden fazla şirkete erişebilir)
- Şirket bazlı rol ve yetki sistemi
- Şirketler arası geçiş için hızlı menü

#### Branded PDF Raporlama

Kurumsal kimlik taşıyan, paylaşıma hazır finansal raporlar.

- **Gelir Tablosu (P&L):** Dönem bazlı gelir ve gider özeti
- **Bilanço:** Aktif, pasif ve öz kaynak detayı
- **Nakit Akış Tablosu:** Dönemsel nakit giriş ve çıkışları
- **CFO Paketi:** Tüm finansal raporların tek PDF'te birleşimi
- Şirket logosu ve bilgileri ile özelleştirilebilir başlık/alt bilgi
- Mesleki standartlara uygun tablo formatları

#### Ortak Yönetişim (Governance Engine)

Ortak kararlarının yasal geçerlilik ve denetlenebilirlik standartlarında yönetimi.

- **Karar Kayıtları:** Ortak kararlarının dijital ortamda belgelenmesi
- **Audit Hash Zinciri:** Her kaydın kriptografik parmak izi ile değişmezliğin kanıtlanması
- **Aylık Anlık Görüntü (Snapshot):** Her ayın ilk günü otomatik yönetişim özeti
- **Mutabakat Sistemi:** Tüm tarafların aynı veriyi gördüğünün doğrulanması

#### İstatistiksel Anomali Tespiti

Finansal verilerinizdeki anormal hareketleri erken tespit eden yapay zeka destekli sistem.

- Geçmiş dönem istatistiklerine dayalı sapma analizi
- CEO Komuta Merkezi'nde öne çıkan anomali uyarıları
- Anthropic Claude AI desteğiyle doğal dil açıklamaları (opsiyonel — API key gerektirir)
- Anomali önem derecesi sıralaması (kritik, uyarı, bilgi)

#### OPS Komuta Merkezi

Operasyonel ekipler için günlük iş süreçleri yönetim paneli.

- Açık fatura takibi ve hatırlatmalar
- Vadesi geçmiş alacak/borç listesi
- Günlük operasyonel görev listesi
- Tedarikçi ve müşteri iletişim özeti

#### 8 Finans Hub Sekmesi

Finans modülü sekiz uzmanlaşmış sekme üzerinden organize edilmiştir:

1. **Genel Bakış** — Özet finansal durum
2. **Nakit Akış** — Banka ve kasa hareketleri
3. **Alacaklar** — Müşteri faturaları ve tahsilat takibi
4. **Borçlar** — Tedarikçi faturaları ve ödeme takibi
5. **Stok** — Ürün ve hizmet envanter yönetimi
6. **Bütçe** — Bütçe planlama ve sapma analizi
7. **Raporlar** — Tüm finansal raporlar
8. **Ayarlar** — Finans modülü yapılandırması

#### Test Kapsamı

Flowra v1.0.0, **1.575 otomatik test** ile kapsamlı kalite güvencesi altındadır.

- Çift taraflı muhasebe değişmezlikleri için özel test paketi (58 test)
- Yevmiye kaydı servisi tam kapsama
- Format ve yardımcı fonksiyon testleri
- API endpoint testleri
- Bileşen düzeyinde kullanıcı arayüzü testleri

#### GL Paralel Mod

Kesintisiz geçiş için üç aşamalı GL aktivasyon sistemi:

- **shadow:** GL hesaplamalar sessizce çalışır, kullanıcıya gösterilmez
- **parallel:** Her iki sistem de çalışır; farklar raporlanır ve karşılaştırılır
- **gl_primary:** GL modülü tek yetkili muhasebe kaynağı olarak çalışır

Bu tasarım, mevcut verilerle çalışan şirketlerin sıfır kesinti ile GL sistemine geçmesini sağlar.

---

### Teknik Gereksinimler

| Bileşen | Gereksinim | Notlar |
|---|---|---|
| **Node.js** | 24.x | Üretim için önerilen sürüm |
| **Next.js** | 14.x | Framework sürümü |
| **Veritabanı** | Supabase (PostgreSQL 15+) | Tam yönetilen bulut veritabanı |
| **Barındırma** | Vercel (önerilen) | Diğer Node.js platformları da desteklenir |
| **Tarayıcı** | Chrome 110+, Edge 110+, Firefox 115+ | Safari 16+ |
| **Ekran çözünürlüğü** | Minimum 1280×720 | 1920×1080 önerilir |

**Sunucu Gereksinimleri (Vercel Dışı Barındırma):**
- Minimum 512 MB RAM (1 GB önerilir)
- Node.js 24.x veya üstü
- HTTPS zorunlu (SSL sertifikası gerekli)
- Cron job desteği için ayrı zamanlayıcı

---

### Bilinen Sınırlamalar — v1.0

Bu sınırlamalar v1.0 sürümü için belgelenmiştir. Sonraki sürümlerde giderilmesi planlanmaktadır.

#### 1. GL Primary Geçişi Manuel Onay Gerektirir

**Kısıtlama:** shadow → parallel → gl_primary geçiş süreci tamamen otomatik değildir. Özellikle gl_primary geçişi için admin kullanıcısının manuel onayı zorunludur.

**Etki:** Büyük veri geçişlerinde zaman alabilir.

**Planlanan İyileştirme:** v1.1'de yönetici onay bildirimleri ve tek tıkla onay akışı eklenecektir.

#### 2. Negatif Envanter Kozmeti Düzeltme Gerektiriyor

**Kısıtlama:** Geriye dönük tarihli satış kayıtları veya sistem dışı veri girişleri negatif stok değerlerine yol açabilir. Sistem negatif stoku engellemiyor.

**Etki:** Stok raporlarında anlamsız negatif değerler görünebilir.

**Geçici Çözüm:** Düzeltici alım kaydı oluşturarak negatif stok sıfırlanabilir. Detaylar için [Sorun Giderme Kılavuzu](SORUN_GIDERME_KILAVUZU.md) bölüm 3.2'yi inceleyin.

**Planlanan İyileştirme:** v1.1'de negatif stok uyarısı ve önleme mekanizması eklenecektir.

#### 3. Çoklu Şirket Holding Katmanı v2.0'da Planlandı

**Kısıtlama:** v1.0'da birden fazla şirket ayrı ayrı yönetilebilir; ancak şirketler arasında otomatik konsolidasyon ve holding düzeyinde raporlama bulunmamaktadır.

**Etki:** Birden fazla şirketi olan holding yapıları için konsolide bilanço manuel olarak hazırlanmalıdır.

**Planlanan İyileştirme:** v2.0'da çok katmanlı holding mimarisi, otomatik konsolidasyon ve holding bazlı raporlama eklenecektir.

#### 4. E-posta Bildirimleri için Resend API Key Gerekli

**Kısıtlama:** E-posta bildirimleri, şifre sıfırlama ve özet raporlar için harici Resend e-posta servisi kullanılmaktadır. Bu servis için ayrı bir API anahtarı gerekmektedir.

**Etki:** Resend API key tanımlanmadan e-posta bildirimleri çalışmaz. Kullanıcı davet e-postaları iletilmez.

**Geçici Çözüm:** Kullanıcı hesapları Supabase Auth panelinden manuel olarak oluşturulabilir. Resend API key ücretsiz planda günlük 100 e-posta limitiyle kullanılabilir.

**Planlanan İyileştirme:** v1.1'de SMTP yapılandırması seçeneği eklenerek e-posta sağlayıcı bağımlılığı azaltılacaktır.

---

### Gelecek Sürüm Yol Haritası

#### v1.1 (Planlanan: Ağustos 2026)

- Negatif stok önleme mekanizması
- GL Primary geçişi için basitleştirilmiş onay akışı
- SMTP e-posta seçeneği (Resend zorunluluğu kaldırılıyor)
- Bütçe karşılaştırma raporları iyileştirmesi
- Performans optimizasyonları (büyük veri setleri için)
- Mobil arayüz iyileştirmeleri

#### v2.0 (Planlanan: Aralık 2026)

- Çok katmanlı holding mimarisi ve otomatik konsolidasyon
- Gelişmiş bütçeleme ve tahmin modülü
- API entegrasyon katmanı (ERP, muhasebe yazılımları)
- Çoklu para birimi desteği
- Gelişmiş yetki yönetimi (granüler rol sistemi)
- Mobil uygulama (iOS ve Android)

---

*Sürüm notları ve güncelleme duyuruları için destek kanallarımızı takip edin.*

*Flowra v1.0.0 — Mayıs 2026*
