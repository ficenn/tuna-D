// Bolt (veya başka bir dış sistem), YZ işlemesi bittiğinde bu endpoint'e
// POST atarak sonucu HAP'a geri yazar.
//
// URL: https://<site>/_functions/boltSonucu
//
// Beklenen istek gövdesi:
//   { "isId": "000024", "context": "...", "summary": "...", "checklist": ["...", "..."] }
// YZ başarısız olursa (Netlify tekrar denemelerinden sonra):
//   { "isId": "000024", "hata": true, "neden": "HTTP 429: ..." }
//   → iş Giriş'te kalır, neden geçmişe yazılır, panel hemen gösterir.
//
// Yetkilendirme: Authorization header'ında "Bearer <secret>" bekleniyor.
// <secret>, Wix Secrets Manager'da BOLT_WEBHOOK_SECRET adıyla saklanan
// değerle eşleşmeli. Bolt tarafı da çağrı yaparken aynı değeri göndermeli.

import { ok, badRequest, serverError } from 'wix-http-functions';
import wixData from 'wix-data';
import { gecisYap, yzHatasiKaydet, yzOlayiKaydet } from './suleyman';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';

const elevatedGetSecretValue = elevate(secrets.getSecretValue);

const SECRET_ADI = 'BOLT_WEBHOOK_SECRET';

export async function post_boltSonucu(request) {

  // 1. Yetki kontrolü
  let beklenenSecret;
  try {
    // getSecretValue { value: '...' } nesnesi döndürür, düz metin değil.
    const sonuc = await elevatedGetSecretValue(SECRET_ADI);
    beklenenSecret = typeof sonuc === 'string' ? sonuc : sonuc?.value;
  } catch (hata) {
    console.error('boltSonucu: secret okunamadı:', hata);
    return serverError({ body: { hata: 'Sunucu yapılandırma hatası.' } });
  }
  if (!beklenenSecret) {
    // Boş secret ile "Bearer " başlığı kabul edilmesin.
    console.error('boltSonucu: secret boş.');
    return serverError({ body: { hata: 'Sunucu yapılandırma hatası.' } });
  }

  const gelenAuth = request.headers['authorization'];
  if (gelenAuth !== `Bearer ${beklenenSecret}`) {
    console.warn('boltSonucu: yetkisiz istek reddedildi.');
    return badRequest({ body: { hata: 'Yetkisiz.' } });
  }

  // 2. Gövdeyi oku
  let govde;
  try {
    govde = await request.body.json();
  } catch (hata) {
    return badRequest({ body: { hata: 'Geçersiz JSON.' } });
  }

  const { isId, context, summary, checklist } = govde || {};

  if (!isId) {
    return badRequest({ body: { hata: 'isId eksik.' } });
  }

  // YZ başarısız haberi: bağlama dokunmadan geçmişe yaz, Giriş'te bırak.
  if (govde.hata) {
    try {
      const s = await yzHatasiKaydet(String(isId), govde.neden);
      if (!s.basarili) console.warn(`boltSonucu: ${isId} YZ hatası kaydedilmedi: ${s.mesaj}`);
      return ok({ body: { basarili: true } });
    } catch (hata) {
      console.error(`boltSonucu: ${isId} YZ hatası kaydedilemedi:`, hata);
      return serverError({ body: { hata: 'YZ hatası kaydedilemedi.' } });
    }
  }

  // 3. IsBaglamlari'nda isId'ye göre kaydı bul
  let sonuc;
  try {
    sonuc = await wixData
      .query('IsBaglamlari')
      .eq('isId', isId)
      .limit(1)
      .find({ suppressAuth: true });
  } catch (hata) {
    console.error('boltSonucu: sorgu başarısız:', hata);
    return serverError({ body: { hata: 'Sorgu başarısız.' } });
  }

  if (!sonuc.items.length) {
    console.warn(`boltSonucu: isId ${isId} için bağlam kaydı bulunamadı.`);
    return badRequest({ body: { hata: `isId ${isId} için bağlam kaydı bulunamadı.` } });
  }

  const kayit = sonuc.items[0];

  // 4. Güncelle (yalnızca gönderilen alanları — undefined olanlar mevcut
  // değeri korur)
  try {
    await wixData.update(
      'IsBaglamlari',
      {
        ...kayit,
        context: context !== undefined ? context : kayit.context,
        summary: summary !== undefined ? summary : kayit.summary,
        checklist: checklist !== undefined ? checklist : kayit.checklist
      },
      { suppressAuth: true }
    );
  } catch (hata) {
    console.error('boltSonucu: güncelleme başarısız:', hata);
    return serverError({ body: { hata: 'Güncelleme başarısız.' } });
  }

  console.log(`boltSonucu: ${isId} için bağlam güncellendi.`);

  // 5. İş Giriş'teyse (eski akış / yolda kalan kayıt) → "Talep bekleniyor".
  // 2026-10-26'dan beri taslak Durum Fotoğrafı'nda istenir; o zaman iş
  // durak değiştirmez, yalnızca "YZ taslağı geldi" geçmişe yazılır.
  // Hata olursa 500 döner; Netlify tekrar dener (her iki adım da tekrar
  // edilmeye güvenlidir).
  try {
    const gecis = await gecisYap(isId, 'yz_hazirlik_tamamlandi', { tur: 'yz', kim: 'Memur YZ' });
    if (!gecis.basarili) {
      const olay = await yzOlayiKaydet(isId, 'yz_geldi', null);
      if (!olay.basarili) console.warn(`boltSonucu: ${isId} için taslak bağlama yazıldı; geçmiş notu düşülmedi: ${olay.mesaj}`);
    }
  } catch (hata) {
    console.error(`boltSonucu: ${isId} aşama geçişi başarısız:`, hata);
    return serverError({ body: { hata: 'Durak geçişi başarısız.' } });
  }

  return ok({ body: { basarili: true } });
}
