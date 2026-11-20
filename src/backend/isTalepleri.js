// İş talepleri (HAP işi 000064, 20 Kasım): Claude'un HAP'a iş açma kapısı.
//
// Claude (ya da Wix API'ye erişimi olan başka bir araç) HAP'a doğrudan iş yazmaz;
// IsTalepleri koleksiyonuna bir talep bırakır. HAP talebi Kontrol Paneli'nin iş
// girişiyle aynı yoldan (isGirisiKaydet) açar: iş no sayacı, geçmiş satırı, masa ve
// tarih kuralları, kişisel veri kontrolü HAP'ta işler. Talebe sonucu yazılır
// ("acildi" + iş no ya da "reddedildi" + neden); Claude oradan okur.
//
// Kapı yalnızca iş açar: kapatma, değiştirme, silme yok. A (ticari, müşterili) işi
// açılmaz. Koleksiyon yalnızca yöneticiye açık; yazabilmek için siteye erişimi olan
// bir Wix girişi gerekir (Claude'un Wix bağlantısı bu yolla çalışır).
//
// Ne zaman işlenir: Kontrol Paneli ya da bir masa sayfası açılınca ve saatte bir
// (jobs.config). 20 Kas: test kopyasında denendi (kilit dahil), ana siteye alındı.

import wixData from 'wix-data';
import { isGirisiKaydet, kimlikIziVar } from './isGirisi';

export const TALEP = 'IsTalepleri';
// Kilit (20 Kas, test kopyasında görülen hata: iki sayfa aynı anda açılınca tek talep
// iki iş açtı). Talebi işleyen, kimliğini bu koleksiyona _id olarak yazar; aynı _id
// ikinci kez yazılamaz, yani yalnızca ilk gelen işler. Oku-sonra-yaz kontrolü bunu
// sağlayamıyordu.
export const KILIT = 'IsTalepKilitleri';
const YARIM_KALDI_DK = 10;
const SA = { suppressAuth: true };
const IZINLI = ['B', 'C', 'D', 'Y'];
const PARTI = 20;
const KAYNAK_SINIRI = 80;

// Tarih (2026-11-20) ve iş no (000046) kişisel veri değildir; kontrolden önce çıkar.
function kimlikVar(...metinler) {
  const t = metinler.join(' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d{6}\b/g, ' ');
  return kimlikIziVar(t);
}

async function isaretle(talep, alanlar) {
  try {
    await wixData.update(TALEP, { ...talep, ...alanlar }, SA);
  } catch (e) {
    console.error('isTalepleri: talep güncellenemedi', talep._id, e);
  }
}

// Aynı talep iki kez işlenmesin: iş açılınca bağlam notuna "Talep: <id>" yazılır.
async function dahaOnceAcilan(talepId) {
  const s = await wixData.query('IsBaglamlari').contains('girisNotu', `Talep: ${talepId}`).limit(1).find(SA);
  return s.items[0] ? s.items[0].isId : null;
}

export async function talepIsle(talep) {
  // Önce kilit: aynı talebi başka bir tetik aldıysa insert hata verir, dokunmayız.
  try {
    await wixData.insert(KILIT, { _id: talep._id, tarih: new Date() }, SA);
  } catch (e) {
    return { id: talep._id, atlandi: true };
  }
  const guncel = await wixData.get(TALEP, talep._id, SA);
  if (!guncel || guncel.durum !== 'bekliyor') return { id: talep._id, atlandi: true };
  await isaretle(guncel, { durum: 'isleniyor' });

  const onceki = await dahaOnceAcilan(guncel._id);
  if (onceki) {
    await isaretle(guncel, { durum: 'acildi', isId: onceki, islenme: new Date() });
    return { id: guncel._id, isId: onceki };
  }

  const reddet = async (neden) => {
    await isaretle(guncel, { durum: 'reddedildi', hata: neden, islenme: new Date() });
    return { id: guncel._id, hata: neden };
  };

  const kategori = String(guncel.kategori || '').trim().toUpperCase();
  if (!IZINLI.includes(kategori)) {
    return reddet(kategori === 'A'
      ? 'Ticari (A) iş bu kapıdan açılmaz; müşteri bilgisi gerektirir, Kontrol Paneli\'nden girilir.'
      : 'Kategori B, C, D ya da Y olmalı.');
  }
  if (kimlikVar(guncel.aciklama, guncel.not, guncel.kapsam)) {
    return reddet('Metinde e-posta ya da telefon gibi bir kimlik izi var; HAP\'a kişisel veri girmez. Metni düzeltip yeni talep bırak.');
  }

  const kaynak = String(guncel.kaynak || 'Claude').replace(/\s+/g, ' ').trim().slice(0, KAYNAK_SINIRI);
  const notlar = [String(guncel.not || '').trim(), `Talep: ${guncel._id} · ${kaynak}`].filter(Boolean).join('\n');
  try {
    const sonuc = await isGirisiKaydet({
      kategori,
      aciklama: guncel.aciklama,
      kapsam: guncel.kapsam,
      notlar,
      termin: guncel.termin,
      sorumlu: guncel.sorumlu,
      aciliyet: guncel.aciliyet,
      modul: guncel.modul
    }, { tur: 'insan', kim: `Claude (${kaynak})`.slice(0, 120) });
    await isaretle(guncel, { durum: 'acildi', isId: sonuc.isId, uyari: (sonuc.uyarilar || []).join(' ') || null, islenme: new Date() });
    return { id: guncel._id, isId: sonuc.isId };
  } catch (e) {
    return reddet(String((e && e.message) || e).slice(0, 300));
  }
}

// Bekleyen talepleri sırayla açar. Koleksiyon yoksa (ör. talep kapısı kurulmamış
// sitede) sessizce geçer; sayfa açılışını asla bozmaz.
export async function talepleriIsle(simdi = new Date()) {
  // Yarıda kalmış talep (işlenirken hata ya da zaman aşımı) sonsuza dek "işleniyor"
  // kalmasın: 10 dakikadan eskiyse durumu söylenir; iş açıldıysa talep izinden bulunur.
  try {
    const yarim = await wixData.query(TALEP).eq('durum', 'isleniyor').limit(PARTI).find(SA);
    for (const t of yarim.items) {
      const eski = (simdi - new Date(t._updatedDate || t._createdDate || 0)) / 60000 > YARIM_KALDI_DK;
      if (!eski) continue;
      const onceki = await dahaOnceAcilan(t._id);
      await isaretle(t, onceki
        ? { durum: 'acildi', isId: onceki, islenme: simdi }
        : { durum: 'reddedildi', hata: 'İşlenirken yarıda kaldı; iş açılmadı. Talebi yeniden bırak.', islenme: simdi });
    }
  } catch (e) { /* koleksiyon yoksa geç */ }
  let bekleyen;
  try {
    bekleyen = await wixData.query(TALEP).eq('durum', 'bekliyor').ascending('_createdDate').limit(PARTI).find(SA);
  } catch (e) {
    return { islenen: 0 };
  }
  const sonuclar = [];
  for (const t of bekleyen.items) {
    try {
      sonuclar.push(await talepIsle(t));
    } catch (e) {
      console.error('isTalepleri: talep işlenemedi', t._id, e);
    }
  }
  return { islenen: sonuclar.length, sonuclar };
}
