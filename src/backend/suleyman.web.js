// Süleyman — insan tarafından tetiklenen geçişler (yalnızca site yöneticileri).
//
//   asama1YzOlmadanTamamla  YZ analizi gelmeyen KN işini Giriş'ten çıkarır.
//   takipYapildi            Kısa yol işi (B, C, D) "Yapıldı".
//   durakIslemiYap          Ticari (A) işin durağındaki karar ve işlemler
//                           (Başla, Beklet, Devam, İptal, Takip yapıldı,
//                           evet / hayır çıkışları, İleri atla). Kurulum "İyi çalışıyor"
//                           ile kapanırken yazılan notlar bağlı iş açar
//                           (sorunlar → Ar-Ge, olumlu geri bildirim → Pazarlama).
//   takipYapildi            Ar-Ge (D) işinde isteğe bağlı "çözüm" notu
//                           Pazarlama'ya bağlı iş açar.

import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import wixData from 'wix-data';
import { gecisYap, durakIslemi, asamaEtiketi } from './suleyman';
import { bagliIsAc } from './isGirisi';
import { BAGLI_ISLER } from './rota';

// Bağlı işleri açar; açılamayanlar uyarı olur (ana işlem geri alınmaz).
async function bagliIsleriAc(liste, anaIsId, aktor) {
  const bagliIsler = [];
  const uyarilar = [];
  for (const [tur, metin] of liste) {
    if (!String(metin || '').trim()) continue;
    try {
      const yeni = await bagliIsAc(tur, metin, String(anaIsId), aktor);
      if (yeni) bagliIsler.push({ tur, ad: BAGLI_ISLER[tur].ad, isId: yeni.isId });
    } catch (hata) {
      console.error(`${anaIsId} için ${tur} bağlı işi açılamadı:`, hata);
      uyarilar.push(`${BAGLI_ISLER[tur].ad} notu iş olarak açılamadı; elle girin.`);
    }
  }
  return { bagliIsler, uyarilar };
}

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
    if (!temizGerekce) throw new Error('Gerekçe zorunlu: Giriş neden YZ analizi olmadan tamamlanıyor?');

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

// Kısa yol (B Pazarlama, C Yapılacaklar, D Ar-Ge): "Yapıldı" — işi kapatır.
// D işinde isteğe bağlı cozumNotu: çözüm / iyileştirme Pazarlama'ya gider.
export const takipYapildi = webMethod(
  Permissions.Admin,
  async (isId, secenek) => {
    if (!isId) throw new Error('İş ID eksik.');
    const aktor = { tur: 'insan', kim: await istekYapan() };
    const sonuc = await gecisYap(String(isId), 'takip_tamamlandi', aktor);
    if (!sonuc.basarili) throw new Error(sonuc.mesaj);
    let ek = { bagliIsler: [], uyarilar: [] };
    const cozum = secenek && secenek.cozumNotu;
    if (sonuc.degisti && String(cozum || '').trim()) {
      const k = await wixData.query('IsKayitlari').eq('isId', String(isId)).limit(1).find({ suppressAuth: true });
      if (k.items[0] && k.items[0].kategori === 'D') ek = await bagliIsleriAc([['cozum', cozum]], isId, aktor);
    }
    return { ...sonuc, ...ek };
  }
);

// Ticari (A) iş: durak işlemi.
// secenek: { not, tarih (takip için), hedef (İleri atla), argeNotu, referansNotu (Kurulum kapanışı) }
// Döner: Süleyman'ın sonucu + bagliIsler: [{ tur, isId }] + uyarilar: []
export const durakIslemiYap = webMethod(
  Permissions.Admin,
  async (isId, islem, secenek) => {
    if (!isId) throw new Error('İş ID eksik.');
    const s = secenek || {};
    const aktor = { tur: 'insan', kim: await istekYapan() };
    const sonuc = await durakIslemi(String(isId), String(islem || ''), aktor, { not: s.not, tarih: s.tarih, hedef: s.hedef });
    if (!sonuc.basarili) throw new Error(sonuc.mesaj);

    // Ana iş kapandı; bağlı işler açılamazsa ana iş yine kapalı kalır,
    // kullanıcıya uyarı döner (notu elle Ar-Ge / Pazarlama işi olarak girer).
    const ek = sonuc.bagliIsAcilabilir
      ? await bagliIsleriAc([['arge', s.argeNotu], ['referans', s.referansNotu]], isId, aktor)
      : { bagliIsler: [], uyarilar: [] };
    return { ...sonuc, durakAdi: asamaEtiketi(sonuc.asama), ...ek };
  }
);
