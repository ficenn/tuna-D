// HAP sayfası — İş Girişi.
//
// Form, sayfadaki "Embed HTML" öğesinin (#isGirisiFormu) içindedir
// (kaynak: docs/isGirisiFormu.html). Form ile bu kod mesajlaşır:
//   form → sayfa: { tip: 'hazir' }              → seçenekleri gönder
//   form → sayfa: { tip: 'kaydet', girdi }      → backend'e kaydet
//   form → sayfa: { tip: 'musteriEkle', bilgiler } → yeni müşteriyi kaydet
//   sayfa → form: { tip: 'secenekler', veri }
//   sayfa → form: { tip: 'sonuc', basarili, veri | hata }
//   sayfa → form: { tip: 'musteriEklendi', basarili, musteri | hata }
// Veriye yalnızca backend (isGirisi.web.js, yalnızca yöneticiler) erişir.

import { isGirisiSecenekleri, isGirisiniKaydet, yeniMusteriKaydet } from 'backend/isGirisi.web';

const FORM = '#isGirisiFormu';

function hataMetni(hata) {
  const m = (hata && hata.message) || String(hata);
  if (/permission|NotAuthorized|unauthori[sz]ed/i.test(m) || (hata && /NotAuthorized/.test(hata.name || ''))) {
    return 'Yetki yok: bu sayfayı site yöneticisi olarak giriş yapmışken açın.';
  }
  return m;
}

async function secenekleriGonder() {
  try {
    const veri = await isGirisiSecenekleri();
    $w(FORM).postMessage({ tip: 'secenekler', veri });
  } catch (hata) {
    console.error('İş Girişi seçenekleri yüklenemedi:', hata);
    $w(FORM).postMessage({ tip: 'yuklemeHatasi', hata: hataMetni(hata) });
  }
}

$w.onReady(function () {
  if (typeof $w(FORM).onMessage !== 'function') {
    console.error(`İş Girişi: sayfada ${FORM} ID'li bir "Embed HTML" öğesi yok. Editor'de HTML öğesinin ID'sini kontrol edin.`);
    return;
  }

  $w(FORM).onMessage(async (olay) => {
    const mesaj = olay.data || {};

    if (mesaj.tip === 'hazir') {
      await secenekleriGonder();
      return;
    }

    if (mesaj.tip === 'musteriEkle') {
      try {
        const musteri = await yeniMusteriKaydet(mesaj.bilgiler);
        $w(FORM).postMessage({ tip: 'musteriEklendi', basarili: true, musteri });
      } catch (hata) {
        console.error('Müşteri kaydedilemedi:', hata);
        $w(FORM).postMessage({ tip: 'musteriEklendi', basarili: false, hata: hataMetni(hata) });
      }
      return;
    }

    if (mesaj.tip === 'kaydet') {
      try {
        const sonuc = await isGirisiniKaydet(mesaj.girdi);
        $w(FORM).postMessage({ tip: 'sonuc', basarili: true, veri: sonuc });
      } catch (hata) {
        console.error('İş kaydedilemedi:', hata);
        $w(FORM).postMessage({ tip: 'sonuc', basarili: false, hata: hataMetni(hata) });
      }
    }
  });
});
