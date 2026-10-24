import wixData from 'wix-data';
import { fetch } from 'wix-fetch';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { isKaydiEkleYenidenDenemeli } from '../../../isIdCounter';
import { ilkKayitAlanlari } from '../../../suleyman';

const elevatedGetSecretValue = elevate(secrets.getSecretValue);

const SECRET_ADI = 'BOLT_WEBHOOK_SECRET';

// KN formunda kişisel bilgi sorulmaz (2026-10-23 kararı): ad, işletme adı,
// konum, e-posta yok. Kişi kendine bir rumuz seçer; Durum Fotoğrafı'nı
// almak için bu rumuzu WhatsApp'tan yazar. Formdaki soru başlığı:
const RUMUZ_SORUSU = 'Kendine bir rumuz seç';

// Bolt/Netlify gatekeeper (hap-intake). Secret'ı kontrol eder, 202 döner,
// YZ işini arka planda yapar ve sonucu /_functions/boltSonucu'ya gönderir.
const BOLT_URL = 'https://quiet-fudge-87d5ac.netlify.app/.netlify/functions/hap-intake';

// KN form cevaplarından soru başlığına göre değer okur. Başlıklar kırpılır
// ve büyük/küçük harf duyarsız (Türkçe kurallarıyla) karşılaştırılır; formda
// başlığın sonuna boşluk eklenmesi gibi küçük değişiklikler eşleşmeyi bozmasın.
function knCevabi(answers, soruBasligi) {
  const normallestir = (metin) => String(metin).trim().toLocaleLowerCase('tr-TR');
  const aranan = normallestir(soruBasligi);
  for (const [anahtar, deger] of Object.entries(answers || {})) {
    if (normallestir(anahtar) === aranan) {
      return typeof deger === 'string' ? deger.trim() : String(deger ?? '').trim();
    }
  }
  return '';
}

export const invoke = async ({ payload }) => {

  const answers = payload?.answers || {};
  const dil = payload?.language || '';

  // Rumuz: İş Kaydı'nda ayrı alan (panelde aranır, WhatsApp'ta eşleştirilir).
  // Tam cevaplar yine yalnızca IsBaglamlari.answers içinde kalır.
  const rumuz = knCevabi(answers, RUMUZ_SORUSU).slice(0, 100);
  if (!rumuz) console.warn(`issKaydi: '${RUMUZ_SORUSU}' cevabı boş geldi; iş rumuzsuz açılıyor.`);

  let isId;

  // 1. Hafif İş Kaydı: sadece takip/backend bilgisi (isId, rumuz, tarih,
  // dil, kaynak, aşama). Çakışma durumunda otomatik yeniden dener
  // (bkz. isIdCounter.js).
  try {
    const sonuc = await isKaydiEkleYenidenDenemeli({
      tarih: new Date(),
      rumuz: rumuz || null,
      dil,
      source: 'Webhook',
      // Giriş başlar; YZ analizi (hazırlık) çalışırken durum: devam_ediyor.
      // YZ sonucu gelince Süleyman işi "Talep bekleniyor" / sırada'ya taşır
      // (bkz. http-functions.js → post_boltSonucu).
      ...ilkKayitAlanlari({ tur: 'sistem', kim: 'KN' })
    });
    isId = sonuc.isId;
    console.log('issKaydi: İş kaydı oluşturuldu:', isId);
  } catch (hata) {
    console.error('issKaydi: İş kaydı oluşturulamadı:', hata);
    throw hata;
  }

  // 2. Bağlam kaydı: asıl içerik (form cevapları) + YZ'nin sonradan
  // dolduracağı context/summary/checklist alanları. isId, İş Kaydı'yla
  // aynı — iki koleksiyon bu şekilde eşleşiyor.
  //
  // ÖNEMLİ: Bu, yukarıdaki İş Kaydı ile aynı "transaction" içinde değil
  // (classic wix-data'da bu tür çoklu-koleksiyon işlemler atomik değil).
  // Yani teorik olarak İş Kaydı oluşup bu adım başarısız olabilir —
  // isId'li bir iş var ama bağlamı yok. Bu durumu gizlemek yerine
  // hata olarak fırlatıyoruz ki otomasyon "başarısız" görünsün ve
  // fark edilsin.
  try {
    await wixData.insert(
      'IsBaglamlari',
      {
        isId,
        answers,
        context: null,   // YZ tarafından sonradan doldurulacak
        summary: null,   // YZ tarafından sonradan doldurulacak
        checklist: []    // YZ tarafından sonradan doldurulacak
      },
      { suppressAuth: true }
    );
    console.log('issKaydi: Bağlam kaydı oluşturuldu:', isId);
  } catch (hata) {
    console.error(
      `issKaydi: UYARI — İş Kaydı ${isId} oluştu ama bağlam kaydı BAŞARISIZ:`,
      hata
    );
    throw hata;
  }

  // 3. Bolt'a "işle" isteği gönder — fire-and-forget. Sadece Bolt'un
  // isteği KABUL ettiğini (hızlı bir HTTP cevabı) doğruluyoruz, AI
  // sonucunu beklemiyoruz (Section 9'daki timeout dersi burada da
  // geçerli — senkron beklemek yerine, sonuç ayrıca /_functions/
  // boltSonucu üzerinden geri gelecek).
  //
  // ÖNEMLİ: Bu adımın başarısız olması İş Kaydı'nı veya Bağlam
  // kaydını GERİ ALMIYOR — ikisi de zaten oluştu. Bolt'a ulaşılamazsa
  // sadece logluyoruz; iş kaydı hâlâ geçerli, sadece YZ işlemesi
  // henüz tetiklenmemiş olur.
  try {
    // getSecretValue { value: '...' } nesnesi döndürür, düz metin değil.
    const secretSonuc = await elevatedGetSecretValue(SECRET_ADI);
    const secret = typeof secretSonuc === 'string' ? secretSonuc : secretSonuc?.value;
    if (!secret) throw new Error('BOLT_WEBHOOK_SECRET boş veya okunamadı.');
    const yanit = await fetch(BOLT_URL, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`
      },
      body: JSON.stringify({ isId, answers })
    });

    if (!yanit.ok) {
      console.warn(
        `issKaydi: Bolt isteği kabul edilmedi (isId=${isId}), status: ${yanit.status}`
      );
    } else {
      console.log(`issKaydi: Bolt'a işleme isteği gönderildi: ${isId}`);
    }
  } catch (hata) {
    console.error(
      `issKaydi: Bolt'a ulaşılamadı (isId=${isId}) — iş kaydı ve bağlam yine de oluşturuldu:`,
      hata
    );
    // Kasıtlı olarak fırlatmıyoruz — bu adım opsiyonel/best-effort.
  }

  return {};
};