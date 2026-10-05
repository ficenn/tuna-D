// Kontrol Paneli — sayfadan çağrılan okuma fonksiyonları (yalnızca site
// yöneticileri). İşi ilerleten işlemler suleyman.web.js'tedir.

import { Permissions, webMethod } from 'wix-web-module';
import { panelVerisiHazirla, isDetayiHazirla } from './kontrolPaneli';

export const panelVerisi = webMethod(Permissions.Admin, async () => {
  return panelVerisiHazirla();
});

export const isDetayi = webMethod(Permissions.Admin, async (isId) => {
  return isDetayiHazirla(isId);
});
