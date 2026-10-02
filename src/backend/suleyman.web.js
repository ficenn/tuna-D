// Süleyman — insan tarafından tetiklenen geçişler (yalnızca site yöneticileri).
//
// Şimdilik tek fonksiyon: YZ analizi başarısız olduğunda veya hiç
// gelmediğinde, işin Aşama 1'de takılı kalmaması için insan kontrollü çıkış.
// Kontrol Paneli'ndeki butona daha sonra bağlanacak.

import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import { gecisYap } from './suleyman';

// İşlemi yapan yöneticiyi geçmişe yazmak için. Üye bilgisi alınamazsa
// "yonetici" yazılır; işlem yine de yapılır.
async function istekYapan() {
  try {
    const uye = await currentMember.getMember({ fieldsets: ['FULL'] });
    return uye?.loginEmail || uye?._id || 'yonetici';
  } catch (hata) {
    return 'yonetici';
  }
}

export const asama1YzOlmadanTamamla = webMethod(
  Permissions.Admin,
  async (isId, gerekce) => {
    const temizGerekce = String(gerekce || '').trim();
    if (!isId) throw new Error('İş ID eksik.');
    if (!temizGerekce) throw new Error('Gerekçe zorunlu: Aşama 1 neden YZ analizi olmadan tamamlanıyor?');

    const sonuc = await gecisYap(
      String(isId),
      'hazirlik_yz_olmadan_tamamlandi',
      { tur: 'insan', kim: await istekYapan() },
      temizGerekce
    );
    if (!sonuc.basarili) throw new Error(sonuc.mesaj);
    return sonuc;
  }
);
