// HAP sayfası — Kontrol Paneli + Yeni İş Kaydı.
//
// Sayfada iki "Embed HTML" öğesi var; ikisi de bu kodla mesajlaşır. Veriye
// yalnızca backend (yalnızca yöneticilere açık) fonksiyonlar erişir.
//   #kontrolPaneli (docs/kontrolPaneli.html)
//   #isGirisiFormu (docs/isGirisiFormu.html): panelin hemen altında, kapalı
//     başlar; panelde "+ Yeni İş" açar, formda "Vazgeç" kapatır.
//
// Kontrol Paneli:
//   panel → sayfa: { tip: 'panelHazir' } / { tip: 'panelYenile' } → panel verisini gönder
//   panel → sayfa: { tip: 'isDetayi', isId }                     → iş detayını gönder
//   panel → sayfa: { tip: 'yzsizTamamla', isId, gerekce }        → Süleyman: Aşama 1'i YZ'siz tamamla
//   panel → sayfa: { tip: 'yapildi', isId }                      → Süleyman: Pazarlama/Yapılacak işi "Yapıldı"
//   panel → sayfa: { tip: 'isiGuncelle', isId, girdi }           → İş Detayı → Düzenle
//   panel → sayfa: { tip: 'panelSecenekleri' }                   → Düzenle için seçenekleri gönder
//   panel → sayfa: { tip: 'yeniIs' }                             → formu aç ve oraya kaydır
//   panel → sayfa: { tip: 'panelBasinaKaydir' }                  → panelin başına kaydır
//   sayfa → panel: { tip: 'panelVerisi', veri } / { tip: 'panelHata', hata }
//   sayfa → panel: { tip: 'isDetayiSonuc', isId, basarili, veri | hata }
//   sayfa → panel: { tip: 'islemSonuc', basarili, mesaj | hata }
//   sayfa → panel: { tip: 'secenekler', veri }
//
// Yeni İş Kaydı formu:
//   form → sayfa: { tip: 'hazir' }                 → seçenekleri gönder
//   form → sayfa: { tip: 'kaydet', girdi }         → işi kaydet (sonra panel yenilenir)
//   form → sayfa: { tip: 'musteriEkle', bilgiler } → yeni müşteriyi kaydet
//   form → sayfa: { tip: 'vazgec' }                → formu kapat, panele dön
//   sayfa → form: { tip: 'secenekler', veri } / { tip: 'yuklemeHatasi', hata }
//   sayfa → form: { tip: 'sonuc', basarili, veri | hata }
//   sayfa → form: { tip: 'musteriEklendi', basarili, musteri | hata }
//
// Öğelerden biri sayfada yoksa diğeri yine çalışır.

import { isGirisiSecenekleri, isGirisiniKaydet, yeniMusteriKaydet, isiGuncelle } from 'backend/isGirisi.web';
import { panelVerisi, isDetayi } from 'backend/kontrolPaneli.web';
import { asama1YzOlmadanTamamla, takipYapildi } from 'backend/suleyman.web';

const PANEL = '#kontrolPaneli';
const FORM = '#isGirisiFormu';
let panelVar = false;
let formVar = false;

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

function panele(mesaj) {
  if (panelVar) $w(PANEL).postMessage(mesaj);
}

function forma(mesaj) {
  if (formVar) $w(FORM).postMessage(mesaj);
}

async function panelVerisiGonder() {
  try {
    const veri = await panelVerisi();
    panele({ tip: 'panelVerisi', veri });
  } catch (hata) {
    console.error('Kontrol Paneli verisi yüklenemedi:', hata);
    panele({ tip: 'panelHata', hata: hataMetni(hata) });
  }
}

// Panel işlemleri: başarı mesajı + panel yenileme; hata: islemSonuc hatası.
async function islem(fonksiyon, basariMetni) {
  try {
    const sonuc = await fonksiyon();
    panele({ tip: 'islemSonuc', basarili: true, mesaj: basariMetni(sonuc) });
    await panelVerisiGonder();
  } catch (hata) {
    console.error('İşlem yapılamadı:', hata);
    panele({ tip: 'islemSonuc', basarili: false, hata: hataMetni(hata) });
  }
}

const ISLEYICILER = {
  panelHazir: () => panelVerisiGonder(),
  panelYenile: () => panelVerisiGonder(),

  async isDetayi(m) {
    try {
      const veri = await isDetayi(m.isId);
      panele({ tip: 'isDetayiSonuc', isId: m.isId, basarili: true, veri });
    } catch (hata) {
      console.error('İş detayı yüklenemedi:', hata);
      panele({ tip: 'isDetayiSonuc', isId: m.isId, basarili: false, hata: hataMetni(hata) });
    }
  },

  yzsizTamamla: (m) => islem(
    () => asama1YzOlmadanTamamla(m.isId, m.gerekce),
    (s) => (s.degisti
      ? `${m.isId}: Aşama 1 YZ'siz tamamlandı, iş Değerlendirme sırasında.`
      : `${m.isId} zaten Değerlendirme sırasındaydı.`)
  ),

  yapildi: (m) => islem(
    () => takipYapildi(m.isId),
    (s) => (s.degisti === false
      ? `${m.isId} zaten yapıldı olarak işaretliydi.`
      : `${m.isId}: yapıldı, arşive geçti.`)
  ),

  isiGuncelle: (m) => islem(
    () => isiGuncelle(m.isId, m.girdi),
    (s) => {
      if (!s.degisti) return `${m.isId}: değişiklik yok.`;
      const uyari = s.uyarilar && s.uyarilar.length ? ` (${s.uyarilar.join(' ')})` : '';
      return `${m.isId}: güncellendi.${uyari}`;
    }
  ),

  panelBasinaKaydir: () => $w(PANEL).scrollTo(),

  // Düzenle formu müşteri/modül listelerini buradan alır.
  async panelSecenekleri() {
    try {
      panele({ tip: 'secenekler', veri: await isGirisiSecenekleri() });
    } catch (hata) {
      console.error('Panel seçenekleri yüklenemedi:', hata);
    }
  },

  async yeniIs() {
    if (!formVar) return;
    await $w(FORM).expand();
    $w(FORM).scrollTo();
  }
};

const FORM_ISLEYICILERI = {
  async hazir() {
    try {
      forma({ tip: 'secenekler', veri: await isGirisiSecenekleri() });
    } catch (hata) {
      console.error('İş Girişi seçenekleri yüklenemedi:', hata);
      forma({ tip: 'yuklemeHatasi', hata: hataMetni(hata) });
    }
  },

  async vazgec() {
    if (!panelVar) return;
    await $w(FORM).collapse();
    $w(PANEL).scrollTo();
  },

  async musteriEkle(m) {
    try {
      const musteri = await yeniMusteriKaydet(m.bilgiler);
      forma({ tip: 'musteriEklendi', basarili: true, musteri });
      await ISLEYICILER.panelSecenekleri(); // Düzenle'deki müşteri listesi de güncellensin
    } catch (hata) {
      console.error('Müşteri kaydedilemedi:', hata);
      forma({ tip: 'musteriEklendi', basarili: false, hata: hataMetni(hata) });
    }
  },

  async kaydet(m) {
    try {
      const sonuc = await isGirisiniKaydet(m.girdi);
      forma({ tip: 'sonuc', basarili: true, veri: sonuc });
      if (panelVar) await panelVerisiGonder(); // yeni iş panelde hemen görünsün
    } catch (hata) {
      console.error('İş kaydedilemedi:', hata);
      forma({ tip: 'sonuc', basarili: false, hata: hataMetni(hata) });
    }
  }
};

$w.onReady(function () {
  panelVar = varMi(PANEL);
  formVar = varMi(FORM);
  if (!panelVar) console.error(`Kontrol Paneli: sayfada ${PANEL} ID'li bir "Embed HTML" öğesi yok.`);
  if (!formVar) console.error(`Yeni İş Kaydı: sayfada ${FORM} ID'li bir "Embed HTML" öğesi yok.`);

  // Panel varsa form kapalı başlar. (Panel yoksa form açık kalır, yoksa ona ulaşılamazdı.)
  if (panelVar && formVar) $w(FORM).collapse();

  if (panelVar) {
    $w(PANEL).onMessage(async (olay) => {
      const mesaj = olay.data || {};
      const isleyici = ISLEYICILER[mesaj.tip];
      if (isleyici) await isleyici(mesaj);
    });
  }
  if (formVar) {
    $w(FORM).onMessage(async (olay) => {
      const mesaj = olay.data || {};
      const isleyici = FORM_ISLEYICILERI[mesaj.tip];
      if (isleyici) await isleyici(mesaj);
    });
  }
});
