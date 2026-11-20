// Kontrol Paneli — sayfadan çağrılan okuma fonksiyonları (yalnızca "HAP Ekibi"
// rolündeki üyeler; bkz. hapYetki.js). İşi ilerleten işlemler suleyman.web.js'tedir.

import { Permissions, webMethod } from 'wix-web-module';
import { hapYetkisiVar, hapYetkisiGerekli } from './hapYetki';
import { currentMember } from 'wix-members-backend';
import { panelVerisiHazirla, isDetayiHazirla } from './kontrolPaneli';
import { talepleriIsle } from './isTalepleri'; // HAP işi 000064: bekleyen iş talepleri önce açılır

// Selamlama için ad. Bulunamazsa (ör. Editor Önizleme) boş döner.
async function kullaniciAdi() {
  try {
    const uye = await currentMember.getMember({ fieldsets: ['FULL'] });
    return uye?.contactDetails?.firstName || uye?.profile?.nickname || '';
  } catch (hata) {
    return '';
  }
}

export const panelVerisi = webMethod(Permissions.SiteMember, async () => {
  if (!(await hapYetkisiVar())) return { yetkiYok: true }; // HAP Ekibi rolü yoksa
  try { await talepleriIsle(); } catch (e) { console.error('isTalepleri:', e); } // bekleyen iş talepleri önce açılır
  const [veri, ad] = await Promise.all([panelVerisiHazirla(), kullaniciAdi()]);
  return { ...veri, kullanici: ad };
});

export const isDetayi = webMethod(Permissions.SiteMember, async (isId) => {
  await hapYetkisiGerekli(); // yalnızca HAP Ekibi rolündeki üyeler
  return isDetayiHazirla(isId);
});
