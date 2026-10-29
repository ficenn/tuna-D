// İş Girişi — sayfadan çağrılan fonksiyonlar (yalnızca site yöneticileri).

import { Permissions, webMethod } from 'wix-web-module';
import { hapYetkisiVar, hapYetkisiGerekli } from './hapYetki';
import { currentMember } from 'wix-members-backend';
import {
  KATEGORILER,
  KAYNAKLAR,
  ACILIYETLER,
  B_MODUL_SECENEKLERI,
  BASLANGIC_SECENEKLERI,
  musterileriListele,
  sorumluListesi,
  musteriKaydet,
  isGirisiKaydet,
  isGuncelle
} from './isGirisi';
import { asamaEtiketi, durumEtiketi } from './suleyman';

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
export const isGirisiSecenekleri = webMethod(Permissions.SiteMember, async () => {
  if (!(await hapYetkisiVar())) return { yetkiYok: true }; // HAP Ekibi rolü yoksa
  return {
    kategoriler: KATEGORILER,
    kaynaklar: KAYNAKLAR,
    aciliyetler: ACILIYETLER,
    moduller: B_MODUL_SECENEKLERI, // B için: Masa SK / İçerik / Görünürlük
    baslangicDuraklari: BASLANGIC_SECENEKLERI, // A işi nereden başlasın
    musteriler: await musterileriListele(),
    sorumlular: await sorumluListesi() // "Sorumlu" alanının önerileri
  };
});

// "Yeni müşteri" penceresinden müşteri kaydı.
export const yeniMusteriKaydet = webMethod(Permissions.SiteMember, async (bilgiler) => {
  await hapYetkisiGerekli(); // yalnızca HAP Ekibi rolündeki üyeler
  return musteriKaydet(bilgiler);
});

export const isGirisiniKaydet = webMethod(Permissions.SiteMember, async (girdi) => {
  await hapYetkisiGerekli(); // yalnızca HAP Ekibi rolündeki üyeler
  const aktor = { tur: 'insan', kim: await istekYapan() };
  const sonuc = await isGirisiKaydet(girdi, aktor);
  return {
    ...sonuc,
    asamaEtiketi: asamaEtiketi(sonuc.asama),
    durumEtiketi: durumEtiketi(sonuc.asama, sonuc.durum)
  };
});

// Kontrol Paneli → İş Detayı → "Düzenle".
export const isiGuncelle = webMethod(Permissions.SiteMember, async (isId, girdi) => {
  await hapYetkisiGerekli(); // yalnızca HAP Ekibi rolündeki üyeler
  const aktor = { tur: 'insan', kim: await istekYapan() };
  return isGuncelle(isId, girdi, aktor);
});
