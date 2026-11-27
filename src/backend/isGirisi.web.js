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
import { asamaEtiketi, durumEtiketi, silmeIsaretle } from './suleyman';
import wixData from 'wix-data';
import { profilKurallari, izinliler } from './profil';

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
  const kural = await profilKurallari(); // kurulum profili (000090)
  return {
    kategoriler: izinliler(KATEGORILER, kural.kategoriler),
    kaynaklar: KAYNAKLAR,
    aciliyetler: ACILIYETLER,
    moduller: B_MODUL_SECENEKLERI, // B için: Masa SK / İçerik / Görünürlük
    baslangicDuraklari: BASLANGIC_SECENEKLERI, // A işi nereden başlasın
    musteriler: kural.musteri ? await musterileriListele() : [], // psikologda müşteri kaydı yok
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

// Kontrol Paneli → İş Detayı → "Sil" / "Geri al" (000055, basit sürüm). Kayıt silinmez,
// işaretlenir; bu HAP'ta açık olmayan bir iş türü silinemez.
async function silinebilirMi(isId) {
  const id = String(isId || '').trim();
  if (!id) throw new Error('İş ID eksik.');
  const s = await wixData.query('IsKayitlari').eq('isId', id).limit(1).find({ suppressAuth: true });
  if (!s.items.length) throw new Error(`İş bulunamadı: ${id}`);
  const kategori = s.items[0].kategori || (s.items[0].source === 'Webhook' ? 'A' : null);
  if (!kategori || !(await profilKurallari()).kategoriler.includes(kategori)) throw new Error('Bu iş buradan silinemez.');
  return id;
}

export const isiSil = webMethod(Permissions.SiteMember, async (isId, neden) => {
  await hapYetkisiGerekli();
  const id = await silinebilirMi(isId);
  return silmeIsaretle(id, true, { tur: 'insan', kim: await istekYapan() }, neden);
});

export const isiGeriAl = webMethod(Permissions.SiteMember, async (isId) => {
  await hapYetkisiGerekli();
  const id = await silinebilirMi(isId);
  return silmeIsaretle(id, false, { tur: 'insan', kim: await istekYapan() });
});
