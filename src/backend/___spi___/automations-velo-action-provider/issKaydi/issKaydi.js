import wixData from 'wix-data';
import { fetch } from 'wix-fetch';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { isKaydiEkleYenidenDenemeli } from '../../../isIdCounter';

const elevatedGetSecretValue = elevate(secrets.getSecretValue);

const SECRET_ADI = 'BOLT_WEBHOOK_SECRET';

// *** GEÇİCİ — Bolt tarafında henüz bir şey yok, bu URL gerçek bir
// endpoint'e işaret etmiyor. Bolt tarafı kurulunca burası güncellenmeli. ***
const BOLT_URL = 'https://TODO-bolt-endpoint-buraya.example.com/hap-is';

export const invoke = async ({ payload }) => {

  const email = payload?.email || '';
  const dil = payload?.language || '';
  const answers = payload?.answers || {};

  let isId;

  // 1. Hafif İş Kaydı: sadece takip/backend bilgisi (isId, email, tarih,
  // dil, kaynak, aşama). Çakışma durumunda otomatik yeniden dener
  // (bkz. isIdCounter.js).
  try {
    const sonuc = await isKaydiEkleYenidenDenemeli({
      tarih: new Date(),
      email,
      dil,
      source: 'Webhook',
      status: 'İlk kayıt'
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
    const secret = await elevatedGetSecretValue(SECRET_ADI);
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