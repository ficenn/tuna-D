import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';

export const isKaydiniOlustur = webMethod(
  Permissions.Admin,
  async (aciklama) => {

    const temizAciklama = String(aciklama || '').trim();

    if (!temizAciklama) {
      throw new Error('İş açıklaması boş.');
    }

    // 1. İş ID sayacını oku
const sonuc = await wixData
  .query('sistem')
  .eq('anahtar', 'IS_ID_SAYAC')
  .limit(1)
  .find({ suppressAuth: true });

if (!sonuc.items.length) {
  throw new Error('IS_ID_SAYAC kaydı bulunamadı.');
}

const sayacKaydi = sonuc.items[0];

    const mevcutSayac = Number(sayacKaydi.sayac || 0);
    const yeniSayac = mevcutSayac + 1;

    // 2. Sayacı güncelle
    await wixData.update(
      'sistem',
      {
        ...sayacKaydi,
        sayac: yeniSayac
      },
      { suppressAuth: true }
    );

    // 3. İş ID oluştur
    const isId = String(yeniSayac).padStart(6, '0');

    // 4. İş kaydını oluştur
    const kayit = await wixData.insert(
      'IsKayitlari',
      {
        tarih: new Date(),
        isId: isId,
        source: 'Panel',
        description: temizAciklama,
        status: 'İlk kayıt'
      },
      { suppressAuth: true }
    );

    console.log('İş kaydı oluşturuldu:', isId);

    // 5. UI'a sadece hızlı sonucu döndür
    return {
      id: kayit._id,
      isId: isId
    };
  }
);
