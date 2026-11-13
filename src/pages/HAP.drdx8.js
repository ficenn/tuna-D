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
//   panel → sayfa: { tip: 'yapildi', isId, cozumNotu, kapanisNotu } → Süleyman: kısa yol işi (B/C/D/Y) "Yapıldı"
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
// Masa sayfası (docs/masaSayfasi.html, #masaSayfasi): panelin altında, kapalı
// başlar. ?masa=yonetim|pazarlama|icerik|gorunurluk ile açılırsa ya da
// panelden / masa sayfasından masa seçilirse panel ve form kapanır, masa
// sayfası açılır. "Kontrol Paneli"ne dönünce tersi.
//   masa → sayfa: { tip: 'masaHazir' }                 → (masa görünümündeyse) veriyi gönder
//   masa → sayfa: { tip: 'masaAc', masa }              → o masayı aç
//   masa → sayfa: { tip: 'kontrolPaneli' }             → panele dön
//   masa → sayfa: { tip: 'isAc', isId }                → panele dön, işi aç
//   masa → sayfa: { tip: 'yeniIs', taslak? }           → panele dön, iş formunu aç (tek kapı);
//                                                         taslak { kategori, modul, aciklama } forma yazılır
//   masa → sayfa: { tip: 'istek', id, islem, veri }    → masaIslem / YZ; cevap { tip: 'yanit', id, sonuc | hata }
//                   islem 'yzSor' { sayfa, soru | hazir, gecmis } · 'yzSonuc' { istekId } · 'hafta' { hafta }
//                   · diğerleri backend/masaSayfasi.web.js ISLEMLER (sonra veri yenilenir)
//   masa → sayfa: { tip: 'yapildi', isId, kapanisNotu } → Süleyman: kısa yol "Yapıldı"
//   panel → sayfa: { tip: 'masaAc', masa }             → masa sayfasını aç
//   panel → sayfa: { tip: 'geriBildirim', metin }      → GeriBildirimler'e yaz; cevap { tip: 'geriBildirimSonuc', basarili, hata }
//   sayfa → masa: { tip: 'masaVerisi', veri, dil } / { tip: 'masaHata', hata }
//   sayfa → masa: { tip: 'islemSonuc', basarili, mesaj | hata }
//
// Öğelerden biri sayfada yoksa diğeri yine çalışır.

import { isGirisiSecenekleri, isGirisiniKaydet, yeniMusteriKaydet, isiGuncelle } from 'backend/isGirisi.web';
import { panelVerisi, isDetayi } from 'backend/kontrolPaneli.web';
import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import { asama1YzOlmadanTamamla, takipYapildi, durakIslemiYap, yzTaslagiYenidenIste } from 'backend/suleyman.web';
import { masaSayfasiVerisi, masaIslem, masaYzSor, masaYzSonucu } from 'backend/masaSayfasi.web';

const PANEL = '#kontrolPaneli';
const DURAK_MESAJLARI = { basla: 'çalışmaya başlandı', beklet: 'beklemeye alındı', devamEt: 'beklemeden çıktı', iptal: 'iptal edildi' };
const FORM = '#isGirisiFormu';
let acilacakIs = null;   // sayfa ?is=000123 ile açıldıysa; panel hazır olunca bir kez açılır
let panelVar = false;
let formVar = false;

const MASA = '#masaSayfasi';
const MASA_KODLARI = ['yonetim', 'pazarlama', 'icerik', 'gorunurluk'];
const DIL = 'tr';             // İngilizce 21 Kasım'dan sonra (masa sayfası METIN.en)
let masaVar = false;
let gorunum = 'panel';        // 'panel' | 'masa'
let aktifMasa = null;
let aktifHafta = null;        // İçerik takvimi / yayın planında seçili hafta (null = bu hafta)

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

function masaya(mesaj) {
  if (masaVar) $w(MASA).postMessage(mesaj);
}

async function masaVerisiGonder() {
  if (!aktifMasa) return;
  try {
    const veri = await masaSayfasiVerisi(aktifMasa, { hafta: aktifHafta });
    if (veri && veri.yetkiYok) {
      masaya({ tip: 'masaHata', hata: YETKI_YOK });
      return;
    }
    masaya({ tip: 'masaVerisi', veri, dil: DIL });
  } catch (hata) {
    console.error('Masa sayfası verisi yüklenemedi:', hata);
    masaya({ tip: 'masaHata', hata: hataMetni(hata) });
  }
}

// Masa görünümüne geç: panel ve form kapanır, masa sayfası açılır.
async function masayaGec(kod) {
  if (!masaVar || !MASA_KODLARI.includes(kod)) return;
  aktifMasa = kod;
  gorunum = 'masa';
  wixLocationFrontend.queryParams.remove(['is']);
  wixLocationFrontend.queryParams.add({ masa: kod });
  if (formVar) await $w(FORM).collapse();
  if (panelVar) await $w(PANEL).collapse();
  await $w(MASA).expand();
  $w(MASA).scrollTo();
  await masaVerisiGonder();
}

// Panel görünümüne dön; isId verilirse o iş açılır.
async function paneleGec(isId) {
  gorunum = 'panel';
  wixLocationFrontend.queryParams.remove(['masa']);
  if (masaVar) await $w(MASA).collapse();
  if (!panelVar) return;
  await $w(PANEL).expand();
  $w(PANEL).scrollTo();
  await panelVerisiGonder();
  if (isId) panele({ tip: 'isAc', isId });
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
  // Geri bildirim kutusu (panel): masa sayfalarındakiyle aynı yere yazılır.
  async geriBildirim(m) {
    try {
      const s = await masaIslem('geriBildirim', { metin: m.metin, sayfa: 'kontrolPaneli' });
      panele(s && s.hata ? { tip: 'geriBildirimSonuc', basarili: false, hata: s.hata } : { tip: 'geriBildirimSonuc', basarili: true });
    } catch (hata) {
      console.error('Geri bildirim kaydedilemedi:', hata);
      panele({ tip: 'geriBildirimSonuc', basarili: false, hata: hataMetni(hata) });
    }
  },
  async panelHazir() {
    panele({ tip: 'sayfaAdresi', adres: sayfaAdresi() });
    if (gorunum === 'masa') return;   // masa görünümünde açıldı: veri panele dönünce yüklenir
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
    () => takipYapildi(m.isId, { cozumNotu: m.cozumNotu || '', kapanisNotu: m.kapanisNotu || '' }),
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
      else if ((m.islem === 'evet' || m.islem === 'hayir' || m.islem === 'iade') && s.durakAdi) parcalar.push(`İş şimdi: ${s.durakAdi}.`);
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

  masaAc: (m) => masayaGec(String(m.masa || '')),

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

// Masa sayfasının mesajları.
const MASA_ISLEYICILERI = {
  async masaHazir() {
    if (gorunum === 'masa') await masaVerisiGonder();
  },
  masaAc: (m) => masayaGec(String(m.masa || '')),
  kontrolPaneli: () => paneleGec(null),
  isAc: (m) => paneleGec(m.isId ? String(m.isId) : null),
  async yeniIs(m) {
    await paneleGec(null);
    await ISLEYICILER.yeniIs();
    if (m.taslak) forma({ tip: 'taslak', ...m.taslak });
  },
  // Masa sayfasının istekleri: her biri { tip: 'yanit', id } ile cevaplanır.
  async istek(m) {
    const cevap = (govde) => masaya({ tip: 'yanit', id: m.id, ...govde });
    const v = m.veri || {};
    try {
      if (m.islem === 'yzSor') {
        const s = await masaYzSor(v.sayfa, v.soru, v.gecmis || [], v.hazir || null);
        cevap(s && s.hata ? { hata: s.hata } : { sonuc: s });
      } else if (m.islem === 'yzSonuc') {
        cevap({ sonuc: await masaYzSonucu(v.istekId) });
      } else if (m.islem === 'hafta') {
        aktifHafta = v.hafta || null;
        await masaVerisiGonder();
        cevap({ sonuc: true });
      } else {
        const s = await masaIslem(m.islem, v);
        cevap(s && s.hata ? { hata: s.hata } : { sonuc: s ? s.sonuc : null });
        if (s && !s.hata) await masaVerisiGonder();
      }
    } catch (hata) {
      console.error(`Masa sayfası: ${m.islem} yapılamadı:`, hata);
      cevap({ hata: hataMetni(hata) });
    }
  },
  async yapildi(m) {
    try {
      const s = await takipYapildi(m.isId, { kapanisNotu: m.kapanisNotu || '' });
      const metin = s.degisti === false
        ? `${m.isId} zaten yapıldı olarak işaretliydi.`
        : [`${m.isId}: yapıldı, arşive geçti.`, ...(s.uyarilar || [])].join(' ');
      masaya({ tip: 'islemSonuc', basarili: true, mesaj: metin });
      await masaVerisiGonder();
    } catch (hata) {
      console.error('Masa sayfası: Yapıldı işaretlenemedi:', hata);
      masaya({ tip: 'islemSonuc', basarili: false, hata: hataMetni(hata) });
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

  // Masa sayfası: ?masa=… ile gelindiyse panel ve form kapalı, masa açık başlar.
  masaVar = varMi(MASA);
  const istenenMasa = String((wixLocationFrontend.query || {}).masa || '').trim();
  if (masaVar && MASA_KODLARI.includes(istenenMasa)) {
    gorunum = 'masa';
    aktifMasa = istenenMasa;
    if (panelVar) $w(PANEL).collapse();
    if (formVar) $w(FORM).collapse();
    $w(MASA).expand();
  } else if (masaVar) {
    $w(MASA).collapse();
  }
  if (masaVar) {
    $w(MASA).onMessage(async (olay) => {
      const mesaj = olay.data || {};
      const isleyici = MASA_ISLEYICILERI[mesaj.tip];
      if (isleyici) await isleyici(mesaj);
    });
  }

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
