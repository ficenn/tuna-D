// HAP sayfası — Kontrol Paneli + İş Girişi.
//
// Sayfada iki "Embed HTML" öğesi var; ikisi de bu kodla mesajlaşır.
// Veriye yalnızca backend (yalnızca yöneticilere açık) fonksiyonlar erişir.
//
// 1) İş Girişi formu (#isGirisiFormu, kaynak: docs/isGirisiFormu.html)
//   form → sayfa: { tip: 'hazir' }                 → seçenekleri gönder
//   form → sayfa: { tip: 'kaydet', girdi }         → backend'e kaydet
//   form → sayfa: { tip: 'musteriEkle', bilgiler } → yeni müşteriyi kaydet
//   sayfa → form: { tip: 'secenekler', veri }
//   sayfa → form: { tip: 'sonuc', basarili, veri | hata }
//   sayfa → form: { tip: 'musteriEklendi', basarili, musteri | hata }
//
// 2) Kontrol Paneli (#kontrolPaneli, kaynak: docs/kontrolPaneli.html)
//   panel → sayfa: { tip: 'panelHazir' } / { tip: 'panelYenile' } → panel verisini gönder
//   panel → sayfa: { tip: 'isDetayi', isId }                     → iş detayını gönder
//   panel → sayfa: { tip: 'yzsizTamamla', isId, gerekce }        → Süleyman: Aşama 1'i YZ'siz tamamla
//   panel → sayfa: { tip: 'yeniIs' }                             → İş Girişi formuna kaydır
//   panel → sayfa: { tip: 'panelBasinaKaydir' }                  → panelin başına kaydır
//   sayfa → panel: { tip: 'panelVerisi', veri } / { tip: 'panelHata', hata }
//   sayfa → panel: { tip: 'isDetayiSonuc', isId, basarili, veri | hata }
//   sayfa → panel: { tip: 'islemSonuc', basarili, mesaj | hata }
//
// Öğelerden biri sayfada yoksa diğeri yine çalışır.

import { isGirisiSecenekleri, isGirisiniKaydet, yeniMusteriKaydet } from 'backend/isGirisi.web';
import { panelVerisi, isDetayi } from 'backend/kontrolPaneli.web';
import { asama1YzOlmadanTamamla } from 'backend/suleyman.web';

const FORM = '#isGirisiFormu';
const PANEL = '#kontrolPaneli';

function hataMetni(hata) {
  const m = (hata && hata.message) || String(hata);
  if (/permission|NotAuthorized|unauthori[sz]ed/i.test(m) || (hata && /NotAuthorized/.test(hata.name || ''))) {
    return 'Yetki yok: bu sayfayı site yöneticisi olarak giriş yapmışken açın.';
  }
  return m;
}

function varMi(secici) {
  try {
    return typeof $w(secici).onMessage === 'function';
  } catch (e) {
    return false;
  }
}

// ---------- İş Girişi ----------

async function secenekleriGonder() {
  try {
    const veri = await isGirisiSecenekleri();
    $w(FORM).postMessage({ tip: 'secenekler', veri });
  } catch (hata) {
    console.error('İş Girişi seçenekleri yüklenemedi:', hata);
    $w(FORM).postMessage({ tip: 'yuklemeHatasi', hata: hataMetni(hata) });
  }
}

function formuBagla(panelVar) {
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
        // Yeni iş panelde hemen görünsün.
        if (panelVar) await panelVerisiGonder();
      } catch (hata) {
        console.error('İş kaydedilemedi:', hata);
        $w(FORM).postMessage({ tip: 'sonuc', basarili: false, hata: hataMetni(hata) });
      }
    }
  });
}

// ---------- Kontrol Paneli ----------

async function panelVerisiGonder() {
  try {
    const veri = await panelVerisi();
    $w(PANEL).postMessage({ tip: 'panelVerisi', veri });
  } catch (hata) {
    console.error('Kontrol Paneli verisi yüklenemedi:', hata);
    $w(PANEL).postMessage({ tip: 'panelHata', hata: hataMetni(hata) });
  }
}

function paneliBagla(formVar) {
  $w(PANEL).onMessage(async (olay) => {
    const mesaj = olay.data || {};

    if (mesaj.tip === 'panelHazir' || mesaj.tip === 'panelYenile') {
      await panelVerisiGonder();
      return;
    }

    if (mesaj.tip === 'isDetayi') {
      try {
        const veri = await isDetayi(mesaj.isId);
        $w(PANEL).postMessage({ tip: 'isDetayiSonuc', isId: mesaj.isId, basarili: true, veri });
      } catch (hata) {
        console.error('İş detayı yüklenemedi:', hata);
        $w(PANEL).postMessage({ tip: 'isDetayiSonuc', isId: mesaj.isId, basarili: false, hata: hataMetni(hata) });
      }
      return;
    }

    if (mesaj.tip === 'yzsizTamamla') {
      try {
        const sonuc = await asama1YzOlmadanTamamla(mesaj.isId, mesaj.gerekce);
        const metin = sonuc.degisti
          ? `${mesaj.isId}: Aşama 1 YZ'siz tamamlandı, iş Değerlendirme sırasında.`
          : `${mesaj.isId} zaten Değerlendirme sırasındaydı.`;
        $w(PANEL).postMessage({ tip: 'islemSonuc', basarili: true, mesaj: metin });
        await panelVerisiGonder();
      } catch (hata) {
        console.error('İşlem yapılamadı:', hata);
        $w(PANEL).postMessage({ tip: 'islemSonuc', basarili: false, hata: hataMetni(hata) });
      }
      return;
    }

    if (mesaj.tip === 'yeniIs' && formVar) {
      $w(FORM).scrollTo();
      return;
    }

    if (mesaj.tip === 'panelBasinaKaydir') {
      $w(PANEL).scrollTo();
    }
  });
}

$w.onReady(function () {
  const formVar = varMi(FORM);
  const panelVar = varMi(PANEL);

  if (!formVar) console.error(`İş Girişi: sayfada ${FORM} ID'li bir "Embed HTML" öğesi yok.`);
  if (!panelVar) console.warn(`Kontrol Paneli: sayfada ${PANEL} ID'li bir "Embed HTML" öğesi yok.`);

  if (formVar) formuBagla(panelVar);
  if (panelVar) paneliBagla(formVar);
});
