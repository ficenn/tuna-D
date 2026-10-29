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
//   panel → sayfa: { tip: 'yzsizTamamla', isId, gerekce }        → Süleyman: Giriş'i YZ'siz tamamla
//   panel → sayfa: { tip: 'yapildi', isId, cozumNotu }           → Süleyman: kısa yol işi (B/C/D) "Yapıldı"
//   panel → sayfa: { tip: 'durakIslemi', isId, islem, secenek }  → Süleyman: Ticari işin durak işlemi
//   panel → sayfa: { tip: 'isiGuncelle', isId, girdi }           → İş Detayı → Düzenle
//   panel → sayfa: { tip: 'panelSecenekleri' }                   → Düzenle için seçenekleri gönder
//   panel → sayfa: { tip: 'yeniIs' }                             → formu aç ve oraya kaydır
//   panel → sayfa: { tip: 'panelBasinaKaydir' }                  → panelin başına kaydır
//   panel → sayfa: { tip: 'kopyala', metin }                     → panoya kopyala (panel kendisi yapamazsa)
//   sayfa → panel: { tip: 'panelVerisi', veri } / { tip: 'panelHata', hata }
//   sayfa → panel: { tip: 'isDetayiSonuc', isId, basarili, veri | hata }
//   sayfa → panel: { tip: 'islemSonuc', basarili, mesaj | hata }
//   sayfa → panel: { tip: 'secenekler', veri }
//   sayfa → panel: { tip: 'sayfaAdresi', adres }                 → iş bağlantıları bu adresle kurulur
//   sayfa → panel: { tip: 'isAc', isId }                         → sayfa ?is=000123 ile açıldıysa o işi aç
//   sayfa → panel: { tip: 'kopyalaSonuc', basarili }
//
// Yeni İş Kaydı formu:
//   form → sayfa: { tip: 'hazir' }                 → seçenekleri gönder
//   form → sayfa: { tip: 'kaydet', girdi }         → işi kaydet (sonra panel yenilenir)
//   form → sayfa: { tip: 'musteriEkle', bilgiler } → yeni müşteriyi kaydet
//   form → sayfa: { tip: 'vazgec' }                → formu kapat, panele dön
//   form → sayfa: { tip: 'paneleDon' }             → form açık kalır, panelin başına kaydır
//   sayfa → form: { tip: 'secenekler', veri } / { tip: 'yuklemeHatasi', hata }
//   sayfa → form: { tip: 'sonuc', basarili, veri | hata }
//   sayfa → form: { tip: 'musteriEklendi', basarili, musteri | hata }
//
// Öğelerden biri sayfada yoksa diğeri yine çalışır.

import { isGirisiSecenekleri, isGirisiniKaydet, yeniMusteriKaydet, isiGuncelle } from 'backend/isGirisi.web';
import { panelVerisi, isDetayi } from 'backend/kontrolPaneli.web';
import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import { asama1YzOlmadanTamamla, takipYapildi, durakIslemiYap, yzTaslagiYenidenIste } from 'backend/suleyman.web';

const PANEL = '#kontrolPaneli';
const DURAK_MESAJLARI = { basla: 'çalışmaya başlandı', beklet: 'beklemeye alındı', devamEt: 'beklemeden çıktı', iptal: 'iptal edildi' };
const FORM = '#isGirisiFormu';
let acilacakIs = null;   // sayfa ?is=000123 ile açıldıysa; panel hazır olunca bir kez açılır
let panelVar = false;
let formVar = false;

// Bu sayfanın sorgusuz adresi, ör. https://site.com/hap
function sayfaAdresi() {
  const yol = (wixLocationFrontend.path || []).map(encodeURIComponent).join('/');
  return wixLocationFrontend.baseUrl.replace(/\/$/, '') + (yol ? '/' + yol : '');
}

// HAP yalnızca "HAP Ekibi" rolündeki üyelere açık (bkz. backend/hapYetki.js).
const YETKI_YOK = 'Yetki yok: sağ üstteki "Giriş" ile üye hesabınızla oturum açın. Hesabınızda "HAP Ekibi" rolü olmalı.';

function hataMetni(hata) {
  const m = (hata && hata.message) || String(hata);
  if (/permission|NotAuthorized|unauthori[sz]ed/i.test(m) || (hata && /NotAuthorized/.test(hata.name || ''))) {
    return YETKI_YOK;
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
    if (veri && veri.yetkiYok) {
      panele({ tip: 'panelHata', hata: YETKI_YOK });
      return;
    }
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
  async panelHazir() {
    panele({ tip: 'sayfaAdresi', adres: sayfaAdresi() });
    await panelVerisiGonder();
    if (acilacakIs) {
      panele({ tip: 'isAc', isId: acilacakIs });
      acilacakIs = null;
    }
  },
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
      ? `${m.isId}: Giriş YZ'siz tamamlandı, iş Talep bekleniyor sırasında.`
      : `${m.isId} zaten Talep bekleniyor sırasındaydı.`)
  ),

  yzTekrar: (m) => islem(
    async () => {
      const s = await yzTaslagiYenidenIste(m.isId);
      if (!s.basarili) throw new Error(s.mesaj || 'YZ taslağı istenemedi.');
      return s;
    },
    (s) => `${m.isId}: ${s.mesaj}`
  ),

  yapildi: (m) => islem(
    () => takipYapildi(m.isId, { cozumNotu: m.cozumNotu || '' }),
    (s) => {
      if (s.degisti === false) return `${m.isId} zaten yapıldı olarak işaretliydi.`;
      const parcalar = [`${m.isId}: yapıldı, arşive geçti.`];
      (s.bagliIsler || []).forEach((b) => parcalar.push(`${b.ad} işi açıldı: ${b.isId}.`));
      (s.uyarilar || []).forEach((u) => parcalar.push(u));
      return parcalar.join(' ');
    }
  ),

  durakIslemi: (m) => islem(
    () => durakIslemiYap(m.isId, m.islem, m.secenek || {}),
    (s) => {
      const parcalar = [`${m.isId}: ${s.etiket || DURAK_MESAJLARI[m.islem] || 'kaydedildi'}.`];
      if (s.sonuc) parcalar.push('İş kapandı, arşive geçti.');
      else if ((m.islem === 'evet' || m.islem === 'hayir') && s.durakAdi) parcalar.push(`İş şimdi: ${s.durakAdi}.`);
      (s.bagliIsler || []).forEach((b) => parcalar.push(`${b.ad} işi açıldı: ${b.isId}.`));
      (s.bilgiler || []).forEach((u) => parcalar.push(u));
      (s.uyarilar || []).forEach((u) => parcalar.push(u));
      return parcalar.join(' ');
    }
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

  async kopyala(m) {
    try {
      await wixWindowFrontend.copyToClipboard(String(m.metin || ''));
      panele({ tip: 'kopyalaSonuc', basarili: true });
    } catch (hata) {
      console.error('Kopyalanamadı:', hata);
      panele({ tip: 'kopyalaSonuc', basarili: false });
    }
  },

  async yeniIs() {
    if (!formVar) return;
    await $w(FORM).expand();
    $w(FORM).scrollTo();
  }
};

const FORM_ISLEYICILERI = {
  paneleDon() {
    if (panelVar) $w(PANEL).scrollTo();
  },

  async hazir() {
    try {
      const veri = await isGirisiSecenekleri();
      if (veri && veri.yetkiYok) {
        forma({ tip: 'yuklemeHatasi', hata: YETKI_YOK });
        return;
      }
      forma({ tip: 'secenekler', veri });
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
  const istenen = String((wixLocationFrontend.query || {}).is || '').trim();
  if (/^\d{1,10}$/.test(istenen)) acilacakIs = istenen.padStart(6, '0');
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
