// Masa sayfaları — sayfadan çağrılan okuma fonksiyonu (yalnızca "HAP Ekibi"
// rolündeki üyeler; bkz. hapYetki.js). "Yapıldı" suleyman.web.js'teki
// takipYapildi ile yapılır (Kontrol Paneli'yle aynı yol).

import { Permissions, webMethod } from 'wix-web-module';
import { hapYetkisiVar } from './hapYetki';
import { masaSayfasiHazirla } from './masaSayfasi';

export const masaSayfasiVerisi = webMethod(Permissions.SiteMember, async (kod) => {
  if (!(await hapYetkisiVar())) return { yetkiYok: true }; // HAP Ekibi rolü yoksa
  return masaSayfasiHazirla(String(kod || '').trim());
});
