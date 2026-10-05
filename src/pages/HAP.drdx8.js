// HAP sayfası — Kontrol Paneli (içinde Yeni İş Kaydı formu ile).
//
// Sayfada bir "Embed HTML" öğesi var: #kontrolPaneli (kaynak:
// docs/kontrolPaneli.html). Panel bu kodla mesajlaşır; veriye yalnızca
// backend (yalnızca yöneticilere açık) fonksiyonlar erişir.
//
//   panel → sayfa: { tip: 'panelHazir' } / { tip: 'panelYenile' } → panel verisini gönder
//   panel → sayfa: { tip: 'isDetayi', isId }                     → iş detayını gönder
//   panel → sayfa: { tip: 'yzsizTamamla', isId, gerekce }        → Süleyman: Aşama 1'i YZ'siz tamamla
//   panel → sayfa: { tip: 'yapildi', isId }                      → Süleyman: Pazarlama/Yapılacak işi "Yapıldı"
//   panel → sayfa: { tip: 'isiGuncelle', isId, girdi }           → İş Detayı → Düzenle
//   panel → sayfa: { tip: 'panelBasinaKaydir' }                  → panelin başına kaydır
//   Yeni İş Kaydı formu (panelin içinde):
//   panel → sayfa: { tip: 'hazir' }                 → form seçeneklerini gönder
//   panel → sayfa: { tip: 'kaydet', girdi }         → işi kaydet
//   panel → sayfa: { tip: 'musteriEkle', bilgiler } → yeni müşteriyi kaydet
//
//   sayfa → panel: { tip: 'panelVerisi', veri } / { tip: 'panelHata', hata }
//   sayfa → panel: { tip: 'isDetayiSonuc', isId, basarili, veri | hata }
//   sayfa → panel: { tip: 'islemSonuc', basarili, mesaj | hata }
//   sayfa → panel: { tip: 'secenekler', veri } / { tip: 'yuklemeHatasi', hata }
//   sayfa → panel: { tip: 'sonuc', basarili, veri | hata }
//   sayfa → panel: { tip: 'musteriEklendi', basarili, musteri | hata }
//
// Eski ayrı form kutusu (#isGirisiFormu) sayfada kaldıysa: gizlenir.
// Silinmesi önerilir.

import { isGirisiSecenekleri, isGirisiniKaydet, yeniMusteriKaydet, isiGuncelle } from 'backend/isGirisi.web';
import { panelVerisi, isDetayi } from 'backend/kontrolPaneli.web';
import { asama1YzOlmadanTamamla, takipYapildi } from 'backend/suleyman.web';

const PANEL = '#kontrolPaneli';
const ESKI_FORM = '#isGirisiFormu';

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
  $w(PANEL).postMessage(mesaj);
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

  // --- Yeni İş Kaydı formu ---
  async hazir() {
    try {
      panele({ tip: 'secenekler', veri: await isGirisiSecenekleri() });
    } catch (hata) {
      console.error('İş Girişi seçenekleri yüklenemedi:', hata);
      panele({ tip: 'yuklemeHatasi', hata: hataMetni(hata) });
    }
  },

  async musteriEkle(m) {
    try {
      const musteri = await yeniMusteriKaydet(m.bilgiler);
      panele({ tip: 'musteriEklendi', basarili: true, musteri });
    } catch (hata) {
      console.error('Müşteri kaydedilemedi:', hata);
      panele({ tip: 'musteriEklendi', basarili: false, hata: hataMetni(hata) });
    }
  },

  async kaydet(m) {
    try {
      const sonuc = await isGirisiniKaydet(m.girdi);
      panele({ tip: 'sonuc', basarili: true, veri: sonuc });
      await panelVerisiGonder(); // yeni iş panelde hemen görünsün
    } catch (hata) {
      console.error('İş kaydedilemedi:', hata);
      panele({ tip: 'sonuc', basarili: false, hata: hataMetni(hata) });
    }
  }
};

$w.onReady(function () {
  if (varMi(ESKI_FORM)) {
    // Form artık panelin içinde; eski kutu görünmesin.
    $w(ESKI_FORM).collapse();
    console.warn(`HAP: ${ESKI_FORM} artık kullanılmıyor; Editor'den silebilirsiniz.`);
  }
  if (!varMi(PANEL)) {
    console.error(`Kontrol Paneli: sayfada ${PANEL} ID'li bir "Embed HTML" öğesi yok.`);
    return;
  }
  $w(PANEL).onMessage(async (olay) => {
    const mesaj = olay.data || {};
    const isleyici = ISLEYICILER[mesaj.tip];
    if (isleyici) await isleyici(mesaj);
  });
});
