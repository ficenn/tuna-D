// Tek, paylaşılan İş ID sayaç mantığı.
//
// Neden bu dosya var:
// Önceden bu mantık iki (fiilen üç, biri ölü kod) yerde bağımsız olarak
// kopyalanmıştı: hapBackend.web.js ve issKaydi.js. Her ikisi de
// "oku → +1 yap → geri yaz" şeklinde çalışıyordu. Bu, atomik değildir:
// iki çağrı aynı anda gelirse (ör. panelden biri, webhook'tan biri) her
// ikisi de aynı mevcut değeri okuyup aynı İş ID'sini üretebilir.
//
// Çözüm: wixData.query + wixData.update yerine, sunucu tarafında tek
// adımda çalışan atomik `incrementField` patch operasyonu kullanılıyor
// (@wix/data, "Developer Preview" API — Wix bunu ileride değiştirebilir,
// bu yüzden alttaki not'a bak).
//
// Güvenlik ağı: Bu fonksiyon atomik artırmayı doğru yapsa bile, üretilen
// isId'nin IsKayitlari koleksiyonuna asıl İş kaydıyla birlikte yazılması
// hâlâ iki ayrı adım. Bu yüzden Wix Content Manager'da IsKayitlari
// koleksiyonundaki `isId` alanının "Unique" (benzersiz) olarak
// işaretlenmesi öneriliyor — bu kod dosyasından ayarlanamıyor, elle
// yapılması gerekiyor. Bu ayar varsa, incrementField beklenmedik şekilde
// davranırsa bile aynı isId ile iki kayıt asla sessizce oluşmaz;
// insert() hata fırlatır ve bunu görürüz.

import wixData from 'wix-data';
import { items } from '@wix/data';

const SISTEM_KOLEKSIYONU = 'sistem';
const SAYAC_ANAHTARI = 'IS_ID_SAYAC';

/**
 * IS_ID_SAYAC kaydını atomik olarak bir artırır ve yeni İş ID'sini
 * (6 haneli, sıfır dolgulu string) döner.
 */
export async function getNextIsId() {
  // Sayaç kaydının _id'sini bulmak için tek bir okuma gerekiyor
  // (incrementField, koleksiyon + itemId ile çalışıyor, filtreyle değil).
  const sonuc = await wixData
    .query(SISTEM_KOLEKSIYONU)
    .eq('anahtar', SAYAC_ANAHTARI)
    .limit(1)
    .find({ suppressAuth: true });

  if (!sonuc.items.length) {
    throw new Error('IS_ID_SAYAC kaydı bulunamadı.');
  }

  const sayacKaydi = sonuc.items[0];

  // Atomik artırma: read-then-write yerine sunucu tarafında tek adımda +1.
  const guncellenmisKayit = await items
    .patch(SISTEM_KOLEKSIYONU, sayacKaydi._id)
    .incrementField('sayac', 1)
    .run();

  const yeniSayac = Number(guncellenmisKayit.sayac);

  if (!Number.isFinite(yeniSayac)) {
    throw new Error(
      'IS_ID_SAYAC artırıldı ama dönen değer sayı değil: ' +
        JSON.stringify(guncellenmisKayit)
    );
  }

  return String(yeniSayac).padStart(6, '0');
}
