// İş Girişi — sayfadan çağrılan fonksiyonlar (yalnızca site yöneticileri).

import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import {
  KATEGORILER,
  KAYNAKLAR,
  ACILIYETLER,
  musterileriListele,
  musteriKaydet,
  isGirisiKaydet
} from './isGirisi';
import { ASAMALAR, DURUMLAR } from './suleyman';

// İşi giren kişi (geçmişe yazılır). Editor Önizleme'de üye bilgisi
// gelmez; o durumda "yonetici" yazılır.
async function istekYapan() {
  try {
    const uye = await currentMember.getMember({ fieldsets: ['FULL'] });
    return uye?.loginEmail || uye?._id || 'yonetici';
  } catch (hata) {
    return 'yonetici';
  }
}

// Formu doldurmak için gereken listeler.
export const isGirisiSecenekleri = webMethod(Permissions.Admin, async () => {
  return {
    kategoriler: KATEGORILER,
    kaynaklar: KAYNAKLAR,
    aciliyetler: ACILIYETLER,
    musteriler: await musterileriListele()
  };
});

// "Yeni müşteri" penceresinden müşteri kaydı.
export const yeniMusteriKaydet = webMethod(Permissions.Admin, async (bilgiler) => {
  return musteriKaydet(bilgiler);
});

export const isGirisiniKaydet = webMethod(Permissions.Admin, async (girdi) => {
  const aktor = { tur: 'insan', kim: await istekYapan() };
  const sonuc = await isGirisiKaydet(girdi, aktor);
  return {
    ...sonuc,
    asamaEtiketi: ASAMALAR[sonuc.asama],
    durumEtiketi: DURUMLAR[sonuc.durum]
  };
});
