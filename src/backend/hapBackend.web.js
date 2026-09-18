import { Permissions, webMethod } from 'wix-web-module';
import { isKaydiEkleYenidenDenemeli } from './isIdCounter';

export const isKaydiniOlustur = webMethod(
  Permissions.Admin,
  async (aciklama) => {

    const temizAciklama = String(aciklama || '').trim();

    if (!temizAciklama) {
      throw new Error('İş açıklaması boş.');
    }

    // İş kaydını, çakışma durumunda otomatik yeniden deneyerek oluştur
    // (bkz. isIdCounter.js)
    const { kayit, isId } = await isKaydiEkleYenidenDenemeli({
      tarih: new Date(),
      source: 'Panel',
      description: temizAciklama,
      status: 'İlk kayıt'
    });

    console.log('İş kaydı oluşturuldu:', isId);

    // 5. UI'a sadece hızlı sonucu döndür
    return {
      id: kayit._id,
      isId: isId
    };
  }
);
