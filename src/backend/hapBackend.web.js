import wixData from 'wix-data';
import { Permissions, webMethod } from 'wix-web-module';
import { getNextIsId } from './isIdCounter';

export const isKaydiniOlustur = webMethod(
  Permissions.Admin,
  async (aciklama) => {

    const temizAciklama = String(aciklama || '').trim();

    if (!temizAciklama) {
      throw new Error('İş açıklaması boş.');
    }

    // İş ID'sini atomik olarak al (bkz. isIdCounter.js — artık tek,
    // paylaşılan uygulama; eski oku/artır/yaz mantığı kaldırıldı)
    const isId = await getNextIsId();

    // İş kaydını oluştur
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
