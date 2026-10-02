// Bolt (veya başka bir dış sistem), YZ işlemesi bittiğinde bu endpoint'e
// POST atarak sonucu HAP'a geri yazar.
//
// URL: https://<site>/_functions/boltSonucu
//
// Beklenen istek gövdesi:
//   { "isId": "000024", "context": "...", "summary": "...", "checklist": ["...", "..."] }
//
// Yetkilendirme: Authorization header'ında "Bearer <secret>" bekleniyor.
// <secret>, Wix Secrets Manager'da BOLT_WEBHOOK_SECRET adıyla saklanan
// değerle eşleşmeli. Bolt tarafı da çağrı yaparken aynı değeri göndermeli.

import { ok, badRequest, serverError } from 'wix-http-functions';
import wixData from 'wix-data';
import { gecisYap } from './suleyman';
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

  // 5. Aşama 1 tamamlandı → Aşama 2 / sırada (Süleyman). Sadece ileri:
  // iş zaten Aşama 1'in ötesindeyse (ör. YZ'siz tamamlandıysa) dokunulmaz.
  // Hata olursa 500 döner; Netlify tekrar dener (her iki adım da tekrar
  // edilmeye güvenlidir).
  try {
    const gecis = await gecisYap(isId, 'yz_hazirlik_tamamlandi', { tur: 'yz', kim: 'Memur YZ' });
    if (!gecis.basarili) {
      console.warn(`boltSonucu: ${isId} aşama geçişi yapılmadı: ${gecis.mesaj}`);
    }
  } catch (hata) {
    console.error(`boltSonucu: ${isId} aşama geçişi başarısız:`, hata);
    return serverError({ body: { hata: 'Aşama geçişi başarısız.' } });
  }

  return ok({ body: { basarili: true } });
}
