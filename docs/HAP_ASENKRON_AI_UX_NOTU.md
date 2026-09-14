# HAP – Asenkron AI Sonuç Ekranı / UX Notu

**Tarih:** 2026-09-14  
**Durum:** Fikir / araştırılacak

## Not

Mevcut sistemde Wix sitesinden harici bir sisteme (Boltt olduğu düşünülen servis) istem gönderildiği ve AI sonucunun email yoluyla müşteriye iletildiği yönündeki yapı yeterince sofistike bir ana kullanıcı deneyimi olarak görülmüyor.

Email tamamen kaldırılmak zorunda değil. Ancak ana sonuç teslim mekanizması HAP'ın kendi arayüzünde olmalı; email ikincil bildirim kanalı olarak kalabilir.

## Önerilen temel UX

Kullanıcı istemi gönderir.

1. HAP iş kaydını oluşturur.
2. Kullanıcı, sonuç beklenirken bir bekleme ekranına geçer.
3. Ekranda örneğin:
   - bir `swirly/loading` animasyonu
   - **“Yanıt oluşturuluyor…”** veya **“İşleminiz gerçekleştiriliyor…”**
   - gerekirse İş ID
4. Harici AI/işleme sistemi sonucu tamamladığında sonuç HAP tarafına kaydedilir.
5. HAP sonucu algılar ve kullanıcıyı sonuç ekranına geçirir.

Bu aşamada kullanıcıya gerçek olmayan yüzde/ilerleme bilgileri gösterilmesi düşünülmüyor. Eğer sistem gerçekten aşamaları takip edebiliyorsa ileride durum adımları gösterilebilir.

## Olası ileri seviye versiyon

İleride gerçek işlem durumları biliniyorsa ekran şöyle evrilebilir:

`İş kaydedildi ✓`
→ `İlgili masa belirleniyor ✓`
→ `Memur YZ çalışıyor ◌`
→ `Yanıt hazırlanıyor`
→ `Sonuç hazır`

Bu, şu an alınmış bir ürün kararı değildir. Önce mevcut Wix → harici sistem/Boltt → AI → sonuç → email zincirinin pratikte nasıl çalıştığı doğrulanmalıdır.

## Teknik mimari açısından

Bu fikir, Wix frontend isteğinin uzun süren AI işlemini beklememesi açısından da anlamlıdır.

Tercih edilen araştırma yönü:

`Frontend → İş kaydı → Bekleme ekranı`

ve ayrı olarak:

`Harici AI/işleme → Sonuç → HAP/CMS`

Frontend sonucu beklemek yerine sonucu sonradan okuyabilir/algılayabilir.

Bu yaklaşım, daha önce görülen uzun AI işlemlerinde Wix request timeout problemiyle de uyumludur.

## Şimdilik karar

**Not edildi. Henüz implementasyon kararı değil.**

Önce mevcut harici işlem sisteminin nerede çalıştığı, Boltt'ın rolü, AI sonucunun nereye yazıldığı ve HAP'ın bu sonucu nasıl okuyabileceği doğrulanacak.

Email tabanlı teslimat, gerektiğinde tamamlayıcı bildirim kanalı olarak korunabilir.
