// Kontrol Paneli — okuma katmanı (MVP).
//
// Görevi: Kontrol Paneli'nin göstereceği veriyi hazırlamak. Hiçbir şeyi
// DEĞİŞTİRMEZ; işi ilerleten tek yer Süleyman'dır (suleyman.js).
//
// Panelde yalnızca yaşam döngüsü dönemindeki işler görünür (asama alanı
// olanlar, 000035 ve sonrası). Daha eski test kayıtlarının asama'sı yok;
// onlar panele girmez.
//
// Üç kategori aynı listede görünür:
//   A Ticari (7 aşamalı akış), B Pazarlama ve C Rutin (kısa yol:
//   Yapılacak → Yapıldı).

import wixData from 'wix-data';
import { ASAMALAR, DURUMLAR, KISA_YOL_ASAMASI, KISA_YOL_ETIKETLERI } from './suleyman';
import { KAYNAKLAR, ACILIYETLER, KATEGORILER, MODULLER } from './isGirisi';

const IS = 'IsKayitlari';
const BAGLAM = 'IsBaglamlari';
const MUSTERI = 'Musteriler';

// Eşikler. Pilotta ayarlanabilir.
export const ESIKLER = {
  yzBeklemeDakika: 15,   // KN işi Aşama 1'de bu kadar kalırsa: YZ gelmedi (Bugün kartına düşer)
  yaklasiyorGun: 7       // Bitiş tarihine 1..N gün kalan işler "Yaklaşıyor" kartında
};

const KAPALI_DURUMLAR = ['tamamlandi', 'iptal'];

const KATEGORI_KISA = { A: 'Ticari', B: 'Pazarlama', C: 'Rutin' };

const ISLEM_ETIKETLERI = {
  kayit_olusturuldu: 'Kayıt oluşturuldu',
  yz_hazirlik_tamamlandi: 'YZ analizi geldi, Aşama 1 tamamlandı',
  hazirlik_yz_olmadan_tamamlandi: 'Aşama 1 YZ analizi olmadan tamamlandı',
  giris_tamamlandi: 'Giriş tamamlandı',
  takip_tamamlandi: 'Yapıldı olarak işaretlendi'
};

const ESKI_KAYNAKLAR = { Webhook: 'KN (form)', Panel: 'Panel' };

// --- Yardımcılar ---

function kaynakEtiketi(kod) {
  return KAYNAKLAR[kod] || ESKI_KAYNAKLAR[kod] || kod || '—';
}

// İstanbul saatine göre bugünün tarihi: 'YYYY-MM-DD'
export function bugunTR(simdi = new Date()) {
  return simdi.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

function gunFarki(tarihMetni, bugun) {
  const a = Date.UTC(...tarihMetni.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...bugun.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((a - b) / 86400000);
}

function tarihDegeri(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'object' && d.$date) return new Date(d.$date);
  return new Date(d);
}

// Wix "Date" alanı normalde 'YYYY-MM-DD' metnidir; Date nesnesi gelirse de çevir.
function terminMetni(t) {
  if (!t) return null;
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = tarihDegeri(t);
  return d && !isNaN(d) ? d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) : null;
}

function baslik(k) {
  if (k.description) return k.description;
  if (k.source === 'Webhook') {
    const kim = k.isletmeAdi || k.isim;
    return kim ? `Kontrol Noktası – ${kim}` : 'Kontrol Noktası başvurusu';
  }
  return '(açıklama yok)';
}

function asamaEtiketi(asama) {
  return asama === KISA_YOL_ASAMASI ? KISA_YOL_ETIKETLERI.asama : ASAMALAR[asama];
}

function durumEtiketi(asama, durum) {
  if (asama === KISA_YOL_ASAMASI) return KISA_YOL_ETIKETLERI[durum] || DURUMLAR[durum];
  return DURUMLAR[durum];
}

async function musteriAdlari(idler) {
  const benzersiz = [...new Set(idler.filter(Boolean))];
  if (!benzersiz.length) return {};
  const sonuc = await wixData
    .query(MUSTERI)
    .hasSome('_id', benzersiz)
    .limit(1000)
    .find({ suppressAuth: true });
  const harita = {};
  for (const m of sonuc.items) harita[m._id] = m.name || '(adsız müşteri)';
  return harita;
}

function satir(k, musteriler) {
  const kisaYol = k.asama === KISA_YOL_ASAMASI;
  const asama = kisaYol ? KISA_YOL_ASAMASI : (ASAMALAR[k.asama] ? k.asama : '1_giris');
  const durum = DURUMLAR[k.status] ? k.status : (kisaYol ? 'sirada' : 'devam_ediyor');
  const kategoriKod = k.kategori || (k.source === 'Webhook' ? 'KN' : null);
  const musteriAdi = k.musteri ? musteriler[k.musteri] || '(müşteri bulunamadı)' : null;

  let musteri = musteriAdi;
  if (!musteri && k.source === 'Webhook') musteri = k.isletmeAdi || k.isim || '—';
  if (!musteri && k.kategori === 'B') musteri = 'Pazarlama masası';
  if (!musteri && k.kategori === 'C') musteri = 'İşletme';

  return {
    isId: k.isId,
    baslik: baslik(k),
    musteri: musteri || '—',
    kaynak: kaynakEtiketi(k.source),
    kategoriKod,
    kategori: k.kategori ? (KATEGORILER[k.kategori] || k.kategori) : (kategoriKod === 'KN' ? 'Kontrol Noktası' : null),
    kategoriKisa: KATEGORI_KISA[k.kategori] || (kategoriKod === 'KN' ? 'KN' : '—'),
    modul: k.modul ? (MODULLER[k.modul] || k.modul) : null,
    kisaYol,
    asama,
    asamaEtiketi: asamaEtiketi(asama),
    asamaNo: kisaYol ? null : Number(asama.split('_')[0]),
    durum,
    durumEtiketi: durumEtiketi(asama, durum),
    aciliyet: k.aciliyet || null,
    aciliyetEtiketi: k.aciliyet ? (ACILIYETLER[k.aciliyet] || k.aciliyet) : null,
    termin: terminMetni(k.termin),
    olusturma: tarihDegeri(k.tarih || k._createdDate)?.toISOString() || null,
    acik: !KAPALI_DURUMLAR.includes(durum)
  };
}

// --- Gündem: "Bugün" ve "Yaklaşıyor" kartları ---
//
// Bugün: bitiş tarihi geçmiş veya bugün olan açık işler + YZ analizi
//   gelmeyen (Aşama 1'de takılan) KN işleri.
// Yaklaşıyor: bitiş tarihine 1..7 gün kalan açık işler.
export function gundemHesapla(isler, simdi = new Date()) {
  const bugun = bugunTR(simdi);
  const bugunListe = [];
  const yaklasiyor = [];

  for (const i of isler) {
    if (!i.acik) continue;

    if (i.asama === '1_giris' && i.durum === 'devam_ediyor' && i.olusturma) {
      const dakika = (simdi - new Date(i.olusturma)) / 60000;
      if (dakika >= ESIKLER.yzBeklemeDakika) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 0,
          neden: 'YZ analizi gelmedi — detaydan YZ\'siz tamamlayabilirsiniz.', etiket: 'Takıldı', tur: 'hata' });
      }
    }

    if (i.termin) {
      const kalan = gunFarki(i.termin, bugun);
      if (kalan < 0) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 1, termin: i.termin,
          neden: `Bitiş tarihi ${-kalan} gün önceydi.`, etiket: 'Gecikti', tur: 'hata' });
      } else if (kalan === 0) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 2, termin: i.termin,
          neden: i.musteri && i.musteri !== '—' ? i.musteri : i.kategoriKisa, etiket: 'Bugün', tur: 'bugun' });
      } else if (kalan <= ESIKLER.yaklasiyorGun) {
        yaklasiyor.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, termin: i.termin, kalan,
          neden: i.musteri && i.musteri !== '—' ? i.musteri : i.kategoriKisa });
      }
    }
  }

  bugunListe.sort((a, b) => a.sira - b.sira || String(a.termin || '').localeCompare(String(b.termin || '')));
  yaklasiyor.sort((a, b) => a.kalan - b.kalan || String(a.isId).localeCompare(String(b.isId)));
  return { bugun: bugunListe, yaklasiyor };
}

// --- Panel verisi ---

export async function panelVerisiHazirla(simdi = new Date()) {
  const sonuc = await wixData
    .query(IS)
    .isNotEmpty('asama')
    .descending('isId')
    .limit(1000)
    .find({ suppressAuth: true });

  const musteriler = await musteriAdlari(sonuc.items.map((k) => k.musteri));
  const isler = sonuc.items.map((k) => satir(k, musteriler));
  const gundem = gundemHesapla(isler, simdi);

  return {
    olusturulma: simdi.toISOString(),
    bugun: bugunTR(simdi),
    kategoriler: KATEGORI_KISA,
    gundem,
    isler
  };
}

// --- İş detayı ---

export async function isDetayiHazirla(isId) {
  const id = String(isId || '').trim();
  if (!id) throw new Error('İş ID eksik.');

  const kayitSonuc = await wixData.query(IS).eq('isId', id).limit(1).find({ suppressAuth: true });
  if (!kayitSonuc.items.length) throw new Error(`İş bulunamadı: ${id}`);
  const k = kayitSonuc.items[0];

  const baglamSonuc = await wixData.query(BAGLAM).eq('isId', id).limit(1).find({ suppressAuth: true });
  const b = baglamSonuc.items[0] || null;

  let musteri = null;
  if (k.musteri) {
    const m = await wixData.get(MUSTERI, k.musteri, { suppressAuth: true });
    if (m) {
      musteri = { ad: m.name || '', irtibat: m.contactName || '', telefon: m.phone || '',
        eposta: m.email || '', adres: m.address || '' };
    }
  }
  // KN işlerinde müşteri kaydı yok; başvurandaki kimlik bilgileri gösterilir.
  if (!musteri && (k.isim || k.isletmeAdi || k.email || k.konum)) {
    musteri = { ad: k.isletmeAdi || '', irtibat: k.isim || '', telefon: '', eposta: k.email || '',
      adres: k.konum || '', knBasvurusu: true };
  }

  const ozet = satir(k, k.musteri && musteri ? { [k.musteri]: musteri.ad } : {});

  const cevaplar = b && b.answers && typeof b.answers === 'object'
    ? Object.entries(b.answers)
        .filter(([soru]) => soru !== 'Zaman damgası')
        .map(([soru, cevap]) => ({ soru: String(soru).trim(), cevap: Array.isArray(cevap) ? cevap.join(', ') : String(cevap ?? '') }))
    : [];

  const gecmis = (Array.isArray(k.gecmis) ? k.gecmis : []).map((g) => ({
    tarih: g.tarih || null,
    islem: ISLEM_ETIKETLERI[g.islem] || g.islem,
    onceki: g.onceki ? `${asamaEtiketi(g.onceki.asama) || g.onceki.asama} / ${durumEtiketi(g.onceki.asama, g.onceki.durum) || g.onceki.durum}` : null,
    yeni: g.yeni ? `${asamaEtiketi(g.yeni.asama) || g.yeni.asama} / ${durumEtiketi(g.yeni.asama, g.yeni.durum) || g.yeni.durum}` : null,
    kim: g.aktor ? `${g.aktor.kim}${g.aktor.tur ? ' (' + g.aktor.tur + ')' : ''}` : '',
    not: g.not || null
  }));

  // Şu an mümkün olan insan işlemleri (Süleyman'ın izin verdiği):
  const islemler = [];
  if (ozet.asama === '1_giris' && ozet.durum === 'devam_ediyor') islemler.push('yzsizTamamla');
  if (ozet.asama === KISA_YOL_ASAMASI && ozet.durum === 'sirada') islemler.push('yapildi');

  return {
    ...ozet,
    musteriBilgisi: musteri,
    kapsam: b?.kapsam || null,
    girisNotu: b?.girisNotu || null,
    yz: b && (b.context || b.summary || (Array.isArray(b.checklist) && b.checklist.length))
      ? { baglam: b.context || null, ozet: b.summary || null, yapilacaklar: Array.isArray(b.checklist) ? b.checklist : [] }
      : null,
    cevaplar,
    gecmis,
    islemler
  };
}
