// Masa sayfaları — sayfadan çağrılan fonksiyonlar (yalnızca "HAP Ekibi"
// rolündeki üyeler; bkz. hapYetki.js). "Yapıldı" suleyman.web.js'teki
// takipYapildi ile yapılır (Kontrol Paneli'yle aynı yol).
//
//   masaSayfasiVerisi(kod, secenek)   sayfanın bütün verisi (secenek.hafta: takvim haftası)
//   masaIslem(islem, veri)            kararlar, iğneler, içerik, istatistik, kanal, rehber,
//                                     YZ ayarı, yeni işin yönlendirilmesi (ISLEMLER)
//   masaYzSor(sayfa, soru, gecmis)    masa / modül YZ'sine soru (arka planda)
//   masaYzSonucu(istekId)             yanıt hazır mı?

import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import { hapYetkisiVar, hapYetkisiGerekli } from './hapYetki';
import { masaSayfasiHazirla } from './masaSayfasi';
import * as V from './masaVeri';
import * as Y from './yzMasa';

// Geçmişe ve kararlara yazılacak ad: profildeki takma ad, yoksa ad, yoksa e-posta.
async function aktor() {
  try {
    const u = await currentMember.getMember({ fieldsets: ['FULL'] });
    const ad = u?.profile?.nickname || u?.contactDetails?.firstName || u?.loginEmail || 'HAP Ekibi';
    return { tur: 'insan', kim: String(ad) };
  } catch (e) {
    return { tur: 'insan', kim: 'HAP Ekibi' };
  }
}

const ISLEMLER = {
  kararOner: (v, a) => V.kararOner(v, a),
  kararOnayla: (v, a) => V.kararOnayla(v.id, a),
  kararReddet: (v, a) => V.kararReddet(v.id, v.not, a),
  igneEkle: (v, a) => V.igneEkle(v, a),
  igneKaldir: (v) => V.igneKaldir(v.id),
  icerikKaydet: (v, a) => V.icerikKaydet(v, a),
  icerikDurumu: (v) => V.icerikDurumu(v.id, v.durum),
  icerikSil: (v) => V.icerikSil(v.id),
  istatistikKaydet: (v, a) => V.istatistikKaydet(v, a),
  kanalGuncelle: (v) => V.kanalGuncelle(v),
  rehberAdimi: (v, a) => V.rehberAdimi(v.sayfa, v.adim, v.tamam, a),
  yzEtkinlestir: (v, a) => V.yzEtkinlestir(v.etkin, a),
  yzSiniri: (v, a) => V.yzSiniriAyarla(v.tl, a),
  tempoAyarla: (v, a) => V.tempoAyarla(v, a),
  isYonlendir: (v, a) => V.isYonlendir(v.isId, v.hedef, a)
};

export const masaSayfasiVerisi = webMethod(Permissions.SiteMember, async (kod, secenek) => {
  if (!(await hapYetkisiVar())) return { yetkiYok: true }; // HAP Ekibi rolü yoksa
  const veri = await masaSayfasiHazirla(String(kod || '').trim(), 'tr', new Date(), secenek || {});
  veri.ben = (await aktor()).kim;   // sohbette "sen" balonunun adı
  return veri;
});

// Hata mesajı yayındaki sitede gizlenir; bu yüzden hata { hata } olarak döner.
export const masaIslem = webMethod(Permissions.SiteMember, async (islem, veri) => {
  await hapYetkisiGerekli();
  const f = ISLEMLER[islem];
  if (!f) return { hata: 'Bilinmeyen işlem.' };
  try {
    return { sonuc: await f(veri || {}, await aktor()) };
  } catch (hata) {
    console.error(`masaIslem ${islem}:`, hata);
    return { hata: String(hata && hata.message || hata).replace(/^Süleyman: /, '') };
  }
});

export const masaYzSor = webMethod(Permissions.SiteMember, async (sayfa, soru, gecmis) => {
  await hapYetkisiGerekli();
  try {
    return await Y.masaYzSor(String(sayfa || ''), soru, gecmis, await aktor());
  } catch (hata) {
    console.error('masaYzSor:', hata);
    return { hata: String(hata && hata.message || hata) };
  }
});

export const masaYzSonucu = webMethod(Permissions.SiteMember, async (istekId) => {
  await hapYetkisiGerekli();
  try {
    return await Y.masaYzSonucu(istekId);
  } catch (hata) {
    console.error('masaYzSonucu:', hata);
    return { durum: 'hata', neden: String(hata && hata.message || hata) };
  }
});
