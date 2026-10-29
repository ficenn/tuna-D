// Kontrol Paneli — sayfadan çağrılan okuma fonksiyonları (yalnızca "HAP Ekibi"
// rolündeki üyeler; bkz. hapYetki.js). İşi ilerleten işlemler suleyman.web.js'tedir.

import { Permissions, webMethod } from 'wix-web-module';
import { hapKorumali, hapKorumaliIlk } from './hapYetki';
import { currentMember } from 'wix-members-backend';
import { panelVerisiHazirla, isDetayiHazirla } from './kontrolPaneli';

// Selamlama için ad. Bulunamazsa (ör. Editor Önizleme) boş döner.
async function kullaniciAdi() {
  try {
    const uye = await currentMember.getMember({ fieldsets: ['FULL'] });
    return uye?.contactDetails?.firstName || uye?.profile?.nickname || '';
  } catch (hata) {
    return '';
  }
}

export const panelVerisi = webMethod(Permissions.SiteMember, hapKorumaliIlk(async () => {
  const [veri, ad] = await Promise.all([panelVerisiHazirla(), kullaniciAdi()]);
  return { ...veri, kullanici: ad };
}));

export const isDetayi = webMethod(Permissions.SiteMember, hapKorumali(async (isId) => {
  return isDetayiHazirla(isId);
}));
