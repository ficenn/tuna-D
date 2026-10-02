import { Permissions, webMethod } from 'wix-web-module';
import { isKaydiEkleYenidenDenemeli } from './isIdCounter';
import { currentMember } from 'wix-members-backend';
import { ilkKayitAlanlari, gecisYap } from './suleyman';

async function istekYapan() {
  try {
    const uye = await currentMember.getMember({ fieldsets: ['FULL'] });
    return uye?.loginEmail || uye?._id || 'yonetici';
  } catch (hata) {
    return 'yonetici';
  }
}

export const isKaydiniOlustur = webMethod(
  Permissions.Admin,
  async (aciklama) => {

    const temizAciklama = String(aciklama || '').trim();

    if (!temizAciklama) {
      throw new Error('İş açıklaması boş.');
    }

    // İş kaydını, çakışma durumunda otomatik yeniden deneyerek oluştur
    // (bkz. isIdCounter.js)
    const aktor = { tur: 'insan', kim: await istekYapan() };

    const { kayit, isId } = await isKaydiEkleYenidenDenemeli({
      tarih: new Date(),
      source: 'Panel',
      description: temizAciklama,
      ...ilkKayitAlanlari(aktor)
    });

    console.log('İş kaydı oluşturuldu:', isId);

    // İnsanın girdiği işte girişin kendisi hazırlıktır: Aşama 1 hemen
    // tamamlanır → Aşama 2 / sırada. Bu adım başarısız olursa iş Aşama 1'de
    // kalır ve YZ'siz tamamlama çıkışıyla ilerletilebilir.
    try {
      await gecisYap(isId, 'giris_tamamlandi', aktor);
    } catch (hata) {
      console.error(`Panel: ${isId} Aşama 1 tamamlanamadı:`, hata);
    }

    // 5. UI'a sadece hızlı sonucu döndür
    return {
      id: kayit._id,
      isId: isId
    };
  }
);
