// Masa sayfaları v1 — okuma katmanı (2026-11-10).
//
// Tek şablon: ?masa=yonetim | pazarlama | icerik | gorunurluk. Hem tuna:D'de
// hem psikolog HAP'ında aynısı. Hiçbir şeyi DEĞİŞTİRMEZ; "Yapıldı" Kontrol
// Paneli'nin kullandığı Süleyman fonksiyonundan geçer (iş nerede kapanırsa
// kapansın aynı kayıt güncellenir, panelde de kapanır).
//
// Hangi iş hangi sayfada:
//   yonetim     Y – Yönetim işleri. Yönetim bir masa değil, ileride "Yönetim
//               katı" olarak tasarlanacak (Fatoş, 2026-11-10); sayfa şimdilik
//               Y işlerini gösterir ("gecekondu").
//   pazarlama   B işlerinden modülsüz olanlar (masa yönetimi) + Pazarlama
//               durağındaki ticari işler (salt okunur, panelden yürür).
//   icerik      B · İçerik modülü
//   gorunurluk  B · Görünürlük modülü
// Modülde biten iş masanın hanesine yazılır: Pazarlama sayfasındaki sayılar
// modüllerin işlerini de içerir.
//
// İş ekleme yok: tek kapı Kontrol Paneli (backlog, 2026-10-31).
//
// Metinler: amaç (Masalar.isi), masa kartı (Masalar.kart), tanıtım videosu
// (Masalar.tanitimVideo) — sayfada "Masayı tanı" bölümü. İngilizce sonra (21 Kasım sonrası): alanların
// _en ikizleri eklenir; bu dosyada dil yalnızca METIN_ALANLARI'ndan okunur.

import wixData from 'wix-data';
import { satir, musteriAdlari, bugunTR } from './kontrolPaneli';
import { DURAKLAR } from './rota';
import { gunEkle } from './suleyman';
import {
  tempoHesapla, kararlariGetir, igneleriGetir, icerikleriGetir, istatistikleriGetir, kanallariGetir,
  rehberDurumu, yzDurumu, yeniGelenMi, isOzeti, haftaBasi, HANE, KARAR_MASASI
} from './masaVeri';
import { YZ_SAYFALARI, sabahNotu } from './yzMasa';

const IS = 'IsKayitlari';
const MASA = 'Masalar';

// Sayfalar ve sırası (sol menü bu sırayla çizilir).
// tur: 'kat' (Yönetim) | 'masa' | 'modul'
export const MASA_SAYFALARI = {
  yonetim: { ad: 'Yönetim', tur: 'kat', ust: null },
  pazarlama: { ad: 'Pazarlama', tur: 'masa', ust: null, moduller: ['icerik', 'gorunurluk'] },
  icerik: { ad: 'İçerik', tur: 'modul', ust: 'pazarlama' },
  gorunurluk: { ad: 'Görünürlük', tur: 'modul', ust: 'pazarlama' }
};

// Boş masa: "iş yok" demekle kalmaz, ilk adımları gösterir (taslaktaki
// "İlk gün" rehberi, backlog 2026-10-31).
export const ILK_ADIMLAR = {
  yonetim: ['Neden varız?', 'Eşik ve Hedef', 'İlk karar', 'Toplantı günü'],
  pazarlama: ['Kime sesleniyoruz?', 'Farkımız ne?', 'Hangi kanallar?', 'İlk ayın temposu'],
  icerik: ['Sesini bul', 'Havuza ilk 5 fikir', 'İlk haftanın 3 içeriği'],
  gorunurluk: ['Vitrinini düzenle', 'Yayın günlerini seç', 'Ölçmeye başla']
};

// Dil hazırlığı: şimdilik yalnızca 'tr'. EN gelince { tr: 'isi', en: 'isi_en' } gibi.
const METIN_ALANLARI = {
  tr: { amac: 'isi', kart: 'kart', video: 'tanitimVideo' }
};

const SON_GUN = 30; // "son 30 günde kapanan" sayısı

// Hangi açık iş bu sayfaya ait? (r = kontrolPaneli.satir çıktısı)
export function sayfayaAit(kod, r) {
  if (kod === 'yonetim') return r.kategoriKod === 'Y';
  if (kod === 'pazarlama') return r.kategoriKod === 'B' && !r.modulKod;
  if (kod === 'icerik' || kod === 'gorunurluk') return r.kategoriKod === 'B' && r.modulKod === kod;
  return false;
}

// Pazarlama durağındaki ticari işler (A / KN): yalnızca Pazarlama sayfasında.
function pazarlamaDuragindaMi(r) {
  return (r.kategoriKod === 'A' || r.kategoriKod === 'KN') && DURAKLAR[r.asama] && DURAKLAR[r.asama].masa === 'pazarlama';
}

// Masanın hanesi: masa yönetimi + modüller (Pazarlama), ya da sayfanın kendisi.
function haneyeAit(kod, r) {
  if (kod === 'pazarlama') return r.kategoriKod === 'B';
  return sayfayaAit(kod, r);
}

function siralaTermin(a, b) {
  if (a.termin && b.termin) return a.termin.localeCompare(b.termin) || String(a.isId).localeCompare(String(b.isId));
  if (a.termin) return -1;
  if (b.termin) return 1;
  return String(b.isId).localeCompare(String(a.isId)); // tarihsizler: yeniden eskiye
}

// Video bağlantısı: yalnızca https; YouTube bağlantısı gizlilik dostu
// oynatıcıya (youtube-nocookie) çevrilir. Başka adres olduğu gibi kalır.
export function videoAdresi(ham) {
  const s = String(ham || '').trim();
  if (!/^https:\/\//i.test(s)) return null;
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  return s;
}

// İşin tamamlandığı an: geçmişteki son "tamamlandı" kaydı. Tamamlanmamışsa null.
export function kapanisZamani(k) {
  if (k.status !== 'tamamlandi') return null;
  const gecmis = Array.isArray(k.gecmis) ? k.gecmis : [];
  for (let i = gecmis.length - 1; i >= 0; i--) {
    const g = gecmis[i];
    if (g && g.yeni && g.yeni.durum === 'tamamlandi' && g.tarih) {
      const t = new Date(g.tarih).getTime();
      if (!isNaN(t)) return t;
    }
  }
  const u = k._updatedDate && (k._updatedDate.$date || k._updatedDate);
  const t = u ? new Date(u).getTime() : NaN;
  return isNaN(t) ? null : t;
}

async function masaSatirlari() {
  const kodlar = Object.keys(MASA_SAYFALARI);
  const sonuc = await wixData.query(MASA).hasSome('_id', kodlar).limit(50).find({ suppressAuth: true });
  const harita = {};
  for (const m of sonuc.items) harita[m._id] = m;
  return harita;
}

// Hafta seçimi ('YYYY-MM-DD', herhangi bir gün) → o haftanın Pazartesi'si.
function haftaSec(istenen, bugun) {
  const s = String(istenen || '').trim();
  return haftaBasi(/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : bugun);
}

export async function masaSayfasiHazirla(kod, dil = 'tr', simdi = new Date(), secenek = {}) {
  const tanim = MASA_SAYFALARI[kod];
  if (!tanim) throw new Error(`Bilinmeyen masa: ${kod}`);
  const alan = METIN_ALANLARI[dil] || METIN_ALANLARI.tr;
  const bugun = bugunTR(simdi);
  const hafta = haftaSec(secenek.hafta, bugun);
  const pazarlamaAilesi = kod === 'pazarlama' || tanim.ust === 'pazarlama';

  const [kayitlar, masalar] = await Promise.all([
    wixData.query(IS).isNotEmpty('asama').descending('isId').limit(1000).find({ suppressAuth: true }),
    masaSatirlari()
  ]);
  const musteriler = await musteriAdlari(kayitlar.items.map((k) => k.musteri));
  const satirlar = kayitlar.items.map((k) => satir(k, musteriler, simdi));

  const isler = satirlar.filter((r) => r.acik && sayfayaAit(kod, r)).sort(siralaTermin);
  const ticari = kod === 'pazarlama' ? satirlar.filter((r) => r.acik && pazarlamaDuragindaMi(r)).sort(siralaTermin) : [];

  // Son 30 günde kapanan (hanenin işi: Pazarlama'da modüller dahil).
  const sinir = simdi.getTime() - SON_GUN * 86400000;
  const kapananlar = kayitlar.items.filter((k) => {
    const t = kapanisZamani(k);
    return t !== null && t >= sinir;
  }).map((k) => satir(k, musteriler, simdi)).filter((r) => haneyeAit(kod, r));
  // Sayfada "bitti" görünen son kapananlar (sayfanın kendi işleri, en yeni 3).
  const sonBitenler = kayitlar.items
    .map((k) => ({ k, t: kapanisZamani(k) }))
    .filter(({ k, t }) => t !== null && t >= sinir && sayfayaAit(kod, satir(k, musteriler, simdi)))
    .sort((a, b) => b.t - a.t).slice(0, 3)
    .map(({ k }) => satir(k, musteriler, simdi));

  const m = masalar[kod] || {};
  const moduller = (tanim.moduller || []).map((mk) => {
    const acik = satirlar.filter((r) => r.acik && sayfayaAit(mk, r)).sort(siralaTermin);
    return {
      kod: mk,
      ad: MASA_SAYFALARI[mk].ad,
      acikIs: acik.length,
      siradaki: acik[0] ? { isId: acik[0].isId, baslik: acik[0].baslik, termin: acik[0].termin } : null
    };
  });

  const haneSatirlari = satirlar.filter((r) => haneyeAit(kod, r));
  const kararMasasi = KARAR_MASASI[kod] || null;

  // Sayfaya göre ek veri (paralel).
  const [tempo, kararlar, igneler, icerik, istatistik, kanallar, rehber, yz, sabah] = await Promise.all([
    pazarlamaAilesi || kod === 'yonetim' ? tempoHesapla(simdi, kayitlar.items) : null,
    kararMasasi ? kararlariGetir(kararMasasi) : null,
    HANE[kod] ? igneleriGetir(kod) : [],
    pazarlamaAilesi ? icerikleriGetir(hafta) : null,
    pazarlamaAilesi ? istatistikleriGetir(6) : [],
    kod === 'gorunurluk' ? kanallariGetir() : [],
    rehberDurumu(kod),
    yzDurumu(simdi),
    sabahNotu(kod, simdi)
  ]);

  // Masaya yeni gelen, yönlendirilmemiş B işleri (Masa YZ'sinin kartı).
  const yeniGelenler = kod === 'pazarlama'
    ? kayitlar.items.filter((k) => yeniGelenMi(k, simdi)).map((k) => satir(k, musteriler, simdi))
    : [];

  // Bu haftaya düşen modül işleri (yayın planındaki saha satırı için).
  const haftaSonu = gunEkle(hafta, 6);
  const haftaIsleri = pazarlamaAilesi
    ? satirlar.filter((r) => r.acik && r.kategoriKod === 'B' && r.termin && r.termin >= hafta && r.termin <= haftaSonu)
      .map((r) => ({ isId: r.isId, baslik: r.baslik, termin: r.termin, modulKod: r.modulKod }))
    : [];

  return {
    olusturulma: simdi.toISOString(),
    bugun,
    hafta,
    masa: {
      kod,
      ad: m.masaAdi || tanim.ad,
      tur: tanim.tur,
      amac: m[alan.amac] || null,
      kart: m[alan.kart] || null,
      tanitimVideo: videoAdresi(m[alan.video]),
      ust: tanim.ust ? { kod: tanim.ust, ad: MASA_SAYFALARI[tanim.ust].ad } : null,
      moduller
    },
    isler,
    ticari,
    sonBitenler,
    kapanan30: kapananlar.length,
    ozet: isOzeti(haneSatirlari, kayitlar.items, simdi),
    tempo,
    kararlar,
    igneler,
    icerik,
    istatistik,
    kanallar,
    haftaIsleri,
    yeniGelenler,
    rehber,
    yz,
    sabahNotu: sabah,
    yzVar: !!YZ_SAYFALARI[kod],
    ilkAdimlar: ILK_ADIMLAR[kod] || [],
    menu: Object.entries(MASA_SAYFALARI).map(([k, t]) => ({ kod: k, ad: t.ad, tur: t.tur, ust: t.ust }))
  };
}
