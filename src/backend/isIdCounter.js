// Tek, paylaşılan İş kaydı oluşturma + İş ID sayaç mantığı.
//
// GEÇMİŞ (önemli): İlk sürüm burada @wix/data'nın items.patch().incrementField()
// atomik operasyonunu kullanıyordu. Panelde (webMethod) çalıştı ama Automation
// (issKaydi.js, webhook yolu) üzerinden test edilince hiç kayıt oluşmadı — sebebi,
// items.patch()'in classic wix-data'daki suppressAuth'a karşılık gelen bir
// seçeneği olmaması ve Automation'ın "Write Data Items" iznine/kimliğine panel
// çağrısıyla aynı şekilde sahip olmaması gibi görünüyor. Bu yüzden bu yaklaşımdan
// vazgeçildi.
//
// YENİ YAKLAŞIM: Sadece classic wix-data (suppressAuth her yerde çalışıyor)
// + IsKayitlari.isId alanının CMS'te Unique olması + çakışma durumunda
// yeniden deneme. Sayaç okuma/yazma hâlâ atomik değil (iki eşzamanlı çağrı
// aynı sayaç değerini okuyabilir), AMA gerçek korumayı sağlayan şey bu değil:
// iki kayıt aynı isId ile insert edilmeye çalışılırsa, Unique kısıtı ikincisini
// reddeder, biz de sayacı yeniden okuyup tekrar deneriz. Sonuçta IsKayitlari'nda
// asla iki kayıt aynı isId'yi taşıyamaz.
//
// *** BUNUN ÇALIŞMASI İÇİN ZORUNLU KOŞUL ***
// Wix Content Manager'da IsKayitlari koleksiyonundaki `isId` alanı "Unique"
// olarak işaretlenmiş OLMALI. İşaretli değilse bu dosya çakışmaya karşı hiçbir
// koruma sağlamaz — sessizce aynı isId'li iki kayıt oluşabilir. Bu kod
// dosyasından ayarlanamıyor, Content Manager'dan elle yapılması gerekiyor.

import wixData from 'wix-data';

const SISTEM_KOLEKSIYONU = 'sistem';
const SAYAC_ANAHTARI = 'IS_ID_SAYAC';
const MAX_DENEME = 5;

async function sayacKaydiniOku() {
  const sonuc = await wixData
    .query(SISTEM_KOLEKSIYONU)
    .eq('anahtar', SAYAC_ANAHTARI)
    .limit(1)
    .find({ suppressAuth: true });

  if (!sonuc.items.length) {
    throw new Error('IS_ID_SAYAC kaydı bulunamadı.');
  }
  return sonuc.items[0];
}

/**
 * Yalnızca sayacı bir artırıp sıradaki isId'yi döner. Kendi başına
 * çakışmaya karşı korumasızdır (bkz. yukarıdaki not) — asıl korumalı
 * yol isKaydiEkleYenidenDenemeli().
 */
export async function getNextIsId() {
  const sayacKaydi = await sayacKaydiniOku();
  const yeniSayac = Number(sayacKaydi.sayac || 0) + 1;

  await wixData.update(
    SISTEM_KOLEKSIYONU,
    { ...sayacKaydi, sayac: yeniSayac },
    { suppressAuth: true }
  );

  return String(yeniSayac).padStart(6, '0');
}

/**
 * kayitVerisi'ni (isId hariç tüm alanlar) IsKayitlari koleksiyonuna,
 * çakışma durumunda otomatik yeniden deneyerek ekler. Panel (webMethod)
 * ve Automation (Velo action provider) bağlamlarının ikisinde de aynı
 * şekilde çalışır — ikisi de sadece classic wix-data + suppressAuth
 * kullanıyor.
 *
 * ÖNEMLİ: Bu fonksiyonun çakışmayı gerçekten yakalaması için IsKayitlari
 * koleksiyonundaki isId alanının Unique olması ZORUNLU (yukarıdaki nota
 * bakın). Unique değilse bu fonksiyon hatasız çalışır ama aynı isId'li
 * iki kayıt sessizce oluşabilir.
 */
export async function isKaydiEkleYenidenDenemeli(kayitVerisi) {
  let sonHata;

  for (let deneme = 1; deneme <= MAX_DENEME; deneme++) {
    const isId = await getNextIsId();

    try {
      const kayit = await wixData.insert(
        'IsKayitlari',
        { ...kayitVerisi, isId },
        { suppressAuth: true }
      );
      return { kayit, isId };
    } catch (hata) {
      sonHata = hata;
      console.warn(
        `isKaydiEkleYenidenDenemeli: ${deneme}. deneme başarısız (isId=${isId}), tekrar deneniyor.`,
        hata
      );
    }
  }

  throw new Error(
    `İş kaydı ${MAX_DENEME} denemeden sonra oluşturulamadı. Son hata: ${sonHata}`
  );
}

