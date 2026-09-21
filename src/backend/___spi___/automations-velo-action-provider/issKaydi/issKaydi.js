import wixData from 'wix-data';
import { isKaydiEkleYenidenDenemeli } from '../../../isIdCounter';

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

  return {};
};