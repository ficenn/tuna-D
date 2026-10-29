import wixData from 'wix-data';
import { isKaydiEkleYenidenDenemeli } from '../../../isIdCounter';
import { ilkKayitAlanlari, gecisYap } from '../../../suleyman';

// KN formunda kişisel bilgi sorulmaz (2026-10-23 kararı): ad, işletme adı,
// konum, e-posta yok. Kişi kendine bir rumuz seçer; Durum Fotoğrafı'nı
// almak için bu rumuzu WhatsApp'tan yazar. Formlardaki soru başlıkları
// (TR form ve EN Checkpoint formu; ilk eşleşen kullanılır):
const RUMUZ_SORULARI = ['Kendine bir rumuz seç', 'Choose a nickname for yourself'];

// KN form cevaplarından soru başlığına göre değer okur. Başlıklar kırpılır,
// baştaki soru numarası ("14. ") atılır ve büyük/küçük harf duyarsız (Türkçe
// kurallarıyla) karşılaştırılır; formda soruların yeri değişse ya da başlığın
// sonuna boşluk eklense de eşleşme bozulmasın.
function knCevabi(answers, soruBasligi) {
  const normallestir = (metin) => String(metin).trim().replace(/^\d+\s*[.)-]\s*/, '').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
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
  const rumuz = (RUMUZ_SORULARI.map((s) => knCevabi(answers, s)).find(Boolean) || '').slice(0, 100);
  if (!rumuz) console.warn(`issKaydi: rumuz cevabı boş geldi (${RUMUZ_SORULARI.join(' / ')}); iş rumuzsuz açılıyor.`);

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
      // Giriş başlar; kayıt ve bağlam yazılınca aşağıda "Talep bekleniyor"a geçer.
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

  // 3. Giriş tamamlandı → "Talep bekleniyor" (2026-10-26). YZ'ye burada
  // GİDİLMEZ: Durum Fotoğrafı taslağı kişi rumuzuyla yazınca istenir
  // (yzCagir.js). Hiç yazmayan kişinin cevapları böylece YZ'ye gitmez.
  // Geçiş başarısız olursa iş Giriş'te kalır; panel bunu gösterir ve
  // insan "Giriş'i YZ'siz tamamla" ile ilerletir.
  try {
    const gecis = await gecisYap(isId, 'kn_giris_tamamlandi', { tur: 'sistem', kim: 'KN' });
    if (!gecis.basarili) console.warn(`issKaydi: ${isId} Talep bekleniyor'a geçmedi: ${gecis.mesaj}`);
  } catch (hata) {
    console.error(`issKaydi: ${isId} Talep bekleniyor'a geçirilemedi:`, hata);
  }

  return {};
};