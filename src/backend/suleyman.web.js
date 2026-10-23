// Süleyman — insan tarafından tetiklenen geçişler (yalnızca site yöneticileri).
//
//   asama1YzOlmadanTamamla  YZ analizi gelmeyen KN işini Giriş'ten çıkarır.
//   takipYapildi            Kısa yol işi (B, C, D) "Yapıldı".
//   durakIslemiYap          Ticari (A) işin durağındaki karar ve işlemler
//                           (Başla, Beklet, Devam, İptal, Takip yapıldı,
//                           evet / hayır çıkışları). Kurulum "İyi çalışıyor"
//                           ile kapanırken yazılan notlar bağlı iş açar.

import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import { gecisYap, durakIslemi } from './suleyman';
import { bagliIsAc } from './isGirisi';

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
export const takipYapildi = webMethod(
  Permissions.Admin,
  async (isId) => {
    if (!isId) throw new Error('İş ID eksik.');
    const sonuc = await gecisYap(
      String(isId),
      'takip_tamamlandi',
      { tur: 'insan', kim: await istekYapan() }
    );
    if (!sonuc.basarili) throw new Error(sonuc.mesaj);
    return sonuc;
  }
);

// Ticari (A) iş: durak işlemi.
// secenek: { not, tarih (takip için), argeNotu, pazarlamaNotu (Kurulum kapanışı) }
// Döner: Süleyman'ın sonucu + bagliIsler: [{ tur, isId }] + uyarilar: []
export const durakIslemiYap = webMethod(
  Permissions.Admin,
  async (isId, islem, secenek) => {
    if (!isId) throw new Error('İş ID eksik.');
    const s = secenek || {};
    const aktor = { tur: 'insan', kim: await istekYapan() };
    const sonuc = await durakIslemi(String(isId), String(islem || ''), aktor, { not: s.not, tarih: s.tarih });
    if (!sonuc.basarili) throw new Error(sonuc.mesaj);

    // Ana iş kapandı; bağlı işler açılamazsa ana iş yine kapalı kalır,
    // kullanıcıya uyarı döner (notu elle Ar-Ge / Pazarlama işi olarak girer).
    const bagliIsler = [];
    const uyarilar = [];
    if (sonuc.bagliIsAcilabilir) {
      for (const [tur, metin] of [['arge', s.argeNotu], ['pazarlama', s.pazarlamaNotu]]) {
        if (!String(metin || '').trim()) continue;
        try {
          const yeni = await bagliIsAc(tur, metin, String(isId), aktor);
          if (yeni) bagliIsler.push({ tur, isId: yeni.isId });
        } catch (hata) {
          console.error(`durakIslemiYap: ${isId} için ${tur} bağlı işi açılamadı:`, hata);
          uyarilar.push(`${tur === 'arge' ? 'Ar-Ge' : 'Pazarlama'} notu iş olarak açılamadı; elle girin.`);
        }
      }
    }
    return { ...sonuc, bagliIsler, uyarilar };
  }
);
