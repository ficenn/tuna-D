// Masa sayfalarının kendi verisi (2026-11-10) — kararlar, iğneler, içerik
// takvimi, haftalık istatistik, kanallar, tempo, YZ ayarı, ilk gün rehberi.
//
// İş kayıtları (IsKayitlari) burada DEĞİŞMEZ; işin durumu Süleyman'dadır.
// Tek istisna masa YZ'sinin "yeni iş geldi" kartı: işi modüle vermek ya da
// iade etmek Süleyman'ın kayitDuzenle'siyle yapılır (geçmişe yazılır).
//
// Koleksiyonlar (hepsi yalnızca backend'den, suppressAuth):
//   MasaKararlari       masa | katman | baslik | aciklama | durum (oneri, gecerli,
//                       reddedildi, arsiv) | kaynakIs | oneren | onaylayanlar[] |
//                       gerekenOnay | tarih | kararTarihi | oncekiKarar | redNotu
//   Igneler             sayfa | metin | kaynak | hedef (karar, fikir, pano) | kimEkledi | bagliKayit | tarih
//   Icerikler           baslik | tarih (YYYY-MM-DD, fikirde boş) | saat | kanal | durum (fikir,
//                       planlandi, yayinda) | not | etiket | sorumlu
//   HaftalikIstatistik  hafta (Pazartesi) | yayin | yayinPlan | kaydetme | dm | anket | kn | giren
//   Kanallar            kanal | rol | durum (guncel, bekliyor, kontrol) | not | sira | sinif
//   HapAyarlari         _id 'yz' (etkin, aylikSinirTL), 'tempo' (esik, hedef, birim, kaynak,
//                       elleDeger), 'rehber-<sayfa>' (tamam[])
//   YzKullanim          ay | istek | girdiToken | ciktiToken | tahminiTL
//
// Kurallar (taslak ve kararlardan):
//   - Kararlar silinmez; değişen karar yeni sürümle arşive geçer, reddedilen
//     gerekçesiyle kalır (anayasa 1).
//   - Masa kararı için 1 onay (masa yönetimi), Yönetim kararı için 2 (Fatoş ve
//     Tuna, Ruh ve Bellek → onay işleyişi).
//   - Yayını insan yapar: "Yayında" işaretini insan koyar.

import wixData from 'wix-data';
import { gunTR, gunEkle, gunArasi, kayitDuzenle, mevcutDurum } from './suleyman';
import { kapanisZamani } from './masaSayfasi';

const SA = { suppressAuth: true };
const KARAR = 'MasaKararlari';
const IGNE = 'Igneler';
const ICERIK = 'Icerikler';
const ISTAT = 'HaftalikIstatistik';
const KANAL = 'Kanallar';
const AYAR = 'HapAyarlari';
const KULLANIM = 'YzKullanim';
const IS = 'IsKayitlari';

export const KARAR_DURUMLARI = { oneri: 'Onay bekliyor', gecerli: 'Geçerli', reddedildi: 'Reddedildi', arsiv: 'Arşivde' };
export const GEREKEN_ONAY = { masa: 1, yonetim: 2 };
export const IGNE_HEDEFLERI = { karar: 'Karar önerisi', fikir: 'Fikir havuzu', pano: 'Pano' };
export const ICERIK_DURUMLARI = { fikir: 'Fikir', planlandi: 'Planlandı', yayinda: 'Yayında' };
export const KANAL_ADLARI = ['Instagram', 'LinkedIn', 'Facebook', 'Diğer'];
export const KANAL_DURUMLARI = { guncel: 'Güncel', bekliyor: 'Düzeltme bekliyor', kontrol: 'Kontrol edilmedi' };
// Pazarlama hanesi: masa + modülleri (iğneler ve kararlar burada toplanır).
export const HANE = { pazarlama: ['pazarlama', 'icerik', 'gorunurluk'], icerik: ['icerik'], gorunurluk: ['gorunurluk'], yonetim: ['yonetim'] };
export const KARAR_MASASI = { pazarlama: 'pazarlama', icerik: 'pazarlama', gorunurluk: 'pazarlama', yonetim: 'yonetim' };

const UZUN = 4000;
const KISA = 300;

// --- yardımcılar ---

export function metin(deger, enFazla, ad, zorunlu = false) {
  const s = String(deger ?? '').trim();
  if (!s && zorunlu) throw new Error(`${ad} boş olamaz.`);
  if (s.length > enFazla) throw new Error(`${ad} en fazla ${enFazla} karakter olabilir.`);
  return s;
}

function sayi(deger, ad) {
  if (deger === '' || deger === null || deger === undefined) return null;
  const n = Number(deger);
  if (!Number.isFinite(n) || n < 0 || n > 100000 || Math.floor(n) !== n) throw new Error(`${ad}: 0 ya da pozitif tam sayı girin.`);
  return n;
}

function ymdKontrol(deger, ad) {
  const s = String(deger ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new Error(`${ad} geçersiz (YYYY-AA-GG).`);
  return s;
}

function saatKontrol(deger) {
  const s = String(deger ?? '').trim();
  if (!s) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error('Saat SS:DD biçiminde olmalı (ör. 12:30).');
  return s;
}

function tarihISO(d) {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d.$date || d);
  return isNaN(t) ? null : t.toISOString();
}

// Pazartesi ('YYYY-MM-DD') — haftalar Pazartesi başlar.
export function haftaBasi(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const gun = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Pazar
  return gunEkle(ymd, gun === 0 ? -6 : 1 - gun);
}

function kim(aktor) {
  return String((aktor && aktor.kim) || 'HAP Ekibi').slice(0, 120);
}

async function ayarGetir(id) {
  try { return await wixData.get(AYAR, id, SA); } catch (e) { return null; }
}

async function ayarYaz(id, alanlar, aktor) {
  const eski = await ayarGetir(id);
  const yeni = { ...(eski || { _id: id, title: id }), ...alanlar, degistiren: kim(aktor), degisimTarihi: new Date() };
  return eski ? wixData.update(AYAR, yeni, SA) : wixData.insert(AYAR, yeni, SA);
}

// --- YZ ayarı ve kullanım ---

export const YZ_VARSAYILAN_SINIR_TL = 100;

export function ayKodu(simdi = new Date()) {
  return gunTR(simdi).slice(0, 7);
}

export async function yzKullanimi(simdi = new Date()) {
  const ay = ayKodu(simdi);
  const s = await wixData.query(KULLANIM).eq('ay', ay).limit(1).find(SA);
  const k = s.items[0];
  return { ay, istek: k ? Number(k.istek) || 0 : 0, tahminiTL: k ? Number(k.tahminiTL) || 0 : 0, kayit: k || null };
}

export async function yzDurumu(simdi = new Date()) {
  const a = await ayarGetir('yz');
  const k = await yzKullanimi(simdi);
  const sinir = a && Number(a.aylikSinirTL) > 0 ? Number(a.aylikSinirTL) : YZ_VARSAYILAN_SINIR_TL;
  return {
    etkin: !!(a && a.etkin),
    aylikSinirTL: sinir,
    buAyTL: Math.round(k.tahminiTL * 100) / 100,
    buAyIstek: k.istek,
    sinirDoldu: k.tahminiTL >= sinir,
    etkinlestiren: a && a.etkin ? a.degistiren || null : null
  };
}

export async function yzEtkinlestir(etkin, aktor) {
  await ayarYaz('yz', { etkin: !!etkin }, aktor);
  return yzDurumu();
}

export async function yzSiniriAyarla(tl, aktor) {
  const n = Number(tl);
  if (!Number.isFinite(n) || n < 10 || n > 500) throw new Error('Aylık sınır 10 ile 500 TL arasında olmalı.');
  await ayarYaz('yz', { aylikSinirTL: Math.round(n) }, aktor);
  return yzDurumu();
}

// Kullanım kaydı: istek sayısı istek anında, token ve TL yanıt gelince.
export async function yzKullanimEkle({ istek = 0, girdiToken = 0, ciktiToken = 0, tl = 0 }, simdi = new Date()) {
  const k = await yzKullanimi(simdi);
  const satir = k.kayit || { ay: k.ay, istek: 0, girdiToken: 0, ciktiToken: 0, tahminiTL: 0 };
  satir.istek = (Number(satir.istek) || 0) + istek;
  satir.girdiToken = (Number(satir.girdiToken) || 0) + girdiToken;
  satir.ciktiToken = (Number(satir.ciktiToken) || 0) + ciktiToken;
  satir.tahminiTL = Math.round(((Number(satir.tahminiTL) || 0) + tl) * 10000) / 10000;
  return k.kayit ? wixData.update(KULLANIM, satir, SA) : wixData.insert(KULLANIM, satir, SA);
}

// --- Tempo ---
//
// tuna:D: bu ay Kurulum durağına giren A işi sayısı (satış oldu). Eşik / Hedef
// Yönetim'in kararı (HapAyarlari 'tempo'; varsayılan 4 / 7 kurulum ≈ 100.000 /
// 200.000 TL). Psikolog HAP'ında kaynak 'elle' olur (uydu yok; değer elle girilir).
//   Sakin   : bu ay Eşik'e ulaşıldı ya da ayın geçen kısmına göre yolunda
//   Uyarı   : yolunun yarısından fazlası
//   Kırmızı : daha azı (müşterisiz işletme kırmızı alarmdadır)

export const TEMPO_ETIKETLERI = { sakin: 'Sakin', uyari: 'Uyarı', kirmizi: 'Kırmızı Alarm' };

function ayGunSayisi(ay) {
  const [y, m] = ay.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function oncekiAy(ay) {
  const [y, m] = ay.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// İşin Kurulum'a girdiği gün ('YYYY-MM-DD') ya da null.
export function kurulumaGirisGunu(k) {
  const gecmis = Array.isArray(k.gecmis) ? k.gecmis : [];
  for (const g of gecmis) {
    if (g && g.yeni && g.yeni.asama === 'kurulum' && !(g.onceki && g.onceki.asama === 'kurulum') && g.tarih) {
      return gunTR(new Date(g.tarih));
    }
  }
  return null;
}

export function tempoDurumu(sayi, esik, gecenOran) {
  if (sayi >= esik) return 'sakin';
  const beklenen = esik * gecenOran;
  if (sayi > 0 && sayi >= beklenen) return 'sakin';
  if (sayi > 0 && sayi >= beklenen / 2) return 'uyari';
  return 'kirmizi';
}

export async function tempoHesapla(simdi = new Date(), kayitlar = null) {
  const a = (await ayarGetir('tempo')) || {};
  const esik = Number(a.esik) > 0 ? Number(a.esik) : 4;
  const hedef = Number(a.hedef) > 0 ? Number(a.hedef) : 7;
  const birim = a.birim || 'kurulum';
  const kaynak = a.kaynak || 'kurulum';
  const ay = ayKodu(simdi);
  const gecen = oncekiAy(ay);
  let buAy = 0;
  let gecenAy = 0;
  if (kaynak === 'elle') {
    buAy = Number(a.elleDeger) || 0;
  } else {
    const isler = kayitlar || (await wixData.query(IS).isNotEmpty('asama').limit(1000).find(SA)).items;
    for (const k of isler) {
      const g = kurulumaGirisGunu(k);
      if (!g) continue;
      if (g.startsWith(ay)) buAy++;
      else if (g.startsWith(gecen)) gecenAy++;
    }
  }
  const gun = Number(gunTR(simdi).slice(8, 10));
  const oran = gun / ayGunSayisi(ay);
  const durum = tempoDurumu(buAy, esik, oran);
  return {
    durum, etiket: TEMPO_ETIKETLERI[durum], buAy, gecenAy, esik, hedef, birim, kaynak,
    yon: buAy > gecenAy ? '↑' : buAy < gecenAy ? '↓' : '→'
  };
}

export async function tempoAyarla(alanlar, aktor) {
  const esik = sayi(alanlar.esik, 'Eşik');
  const hedef = sayi(alanlar.hedef, 'Hedef');
  if (!esik || !hedef || hedef < esik) throw new Error('Eşik ve Hedef pozitif olmalı; Hedef Eşik\'ten küçük olamaz.');
  const yeni = { esik, hedef };
  if (alanlar.elleDeger !== undefined) yeni.elleDeger = sayi(alanlar.elleDeger, 'Bu ayın değeri') || 0;
  await ayarYaz('tempo', yeni, aktor);
  return tempoHesapla();
}

// --- Kararlar ---

function kararSatiri(k) {
  return {
    id: k._id,
    baslik: k.baslik,
    aciklama: k.aciklama || '',
    masa: k.masa,
    durum: k.durum,
    durumEtiketi: KARAR_DURUMLARI[k.durum] || k.durum,
    kaynakIs: k.kaynakIs || null,
    oneren: k.oneren || null,
    onaylayanlar: Array.isArray(k.onaylayanlar) ? k.onaylayanlar : [],
    gerekenOnay: Number(k.gerekenOnay) || 1,
    tarih: tarihISO(k.tarih || k._createdDate),
    kararTarihi: tarihISO(k.kararTarihi),
    oncekiKarar: k.oncekiKarar || null,
    redNotu: k.redNotu || null
  };
}

export async function kararlariGetir(masa) {
  const s = await wixData.query(KARAR).eq('masa', masa).limit(500).find(SA);
  const hepsi = s.items.map(kararSatiri);
  const sirala = (alan) => (a, b) => String(b[alan] || b.tarih || '').localeCompare(String(a[alan] || a.tarih || ''));
  return {
    gecerli: hepsi.filter((k) => k.durum === 'gecerli').sort(sirala('kararTarihi')),
    oneriler: hepsi.filter((k) => k.durum === 'oneri').sort(sirala('tarih')),
    arsiv: hepsi.filter((k) => k.durum === 'arsiv' || k.durum === 'reddedildi').sort(sirala('tarih'))
  };
}

async function kararBul(id) {
  const k = await wixData.get(KARAR, String(id || ''), SA);
  if (!k) throw new Error('Karar bulunamadı.');
  return k;
}

export async function kararOner(veri, aktor) {
  const masa = String(veri.masa || '').trim();
  if (!GEREKEN_ONAY[masa === 'yonetim' ? 'yonetim' : 'masa'] || !['pazarlama', 'yonetim'].includes(masa)) throw new Error('Masa geçersiz.');
  const baslik = metin(veri.baslik, KISA, 'Karar', true);
  const aciklama = metin(veri.aciklama, UZUN, 'Açıklama');
  const kaynakIs = metin(veri.kaynakIs, 20, 'Kaynak iş') || null;
  const oncekiKarar = veri.oncekiKarar ? (await kararBul(veri.oncekiKarar))._id : null;
  const katman = masa === 'yonetim' ? 'yonetim' : 'masa';
  const kayit = await wixData.insert(KARAR, {
    masa, katman, baslik, aciklama, kaynakIs, oncekiKarar,
    durum: 'oneri',
    oneren: metin(veri.oneren, 120, 'Öneren') || kim(aktor),
    onaylayanlar: [],
    gerekenOnay: GEREKEN_ONAY[katman],
    tarih: new Date()
  }, SA);
  return kararSatiri(kayit);
}

export async function kararOnayla(id, aktor) {
  const k = await kararBul(id);
  if (k.durum !== 'oneri') throw new Error('Bu öneri zaten sonuçlanmış.');
  const ad = kim(aktor);
  const onaylayanlar = Array.isArray(k.onaylayanlar) ? [...k.onaylayanlar] : [];
  if (onaylayanlar.includes(ad)) throw new Error('Bu öneriyi zaten onayladınız; diğer onay bekleniyor.');
  onaylayanlar.push(ad);
  const tamam = onaylayanlar.length >= (Number(k.gerekenOnay) || 1);
  const yeni = { ...k, onaylayanlar };
  if (tamam) { yeni.durum = 'gecerli'; yeni.kararTarihi = new Date(); }
  await wixData.update(KARAR, yeni, SA);
  if (tamam && k.oncekiKarar) {
    try {
      const eski = await wixData.get(KARAR, k.oncekiKarar, SA);
      if (eski && eski.durum === 'gecerli') await wixData.update(KARAR, { ...eski, durum: 'arsiv' }, SA);
    } catch (e) { console.error('Önceki karar arşive alınamadı:', e); }
  }
  return kararSatiri(yeni);
}

export async function kararReddet(id, not, aktor) {
  const k = await kararBul(id);
  if (k.durum !== 'oneri') throw new Error('Bu öneri zaten sonuçlanmış.');
  const redNotu = metin(not, 1000, 'Ret gerekçesi', true);
  const yeni = { ...k, durum: 'reddedildi', redNotu: `${redNotu} (${kim(aktor)})` };
  await wixData.update(KARAR, yeni, SA);
  return kararSatiri(yeni);
}

// --- İğneler ---

function igneSatiri(i) {
  return {
    id: i._id, metin: i.metin, sayfa: i.sayfa, kaynak: i.kaynak || null,
    hedef: i.hedef, hedefEtiketi: IGNE_HEDEFLERI[i.hedef] || i.hedef,
    kimEkledi: i.kimEkledi || null, tarih: tarihISO(i.tarih || i._createdDate)
  };
}

export async function igneleriGetir(sayfa) {
  const hane = HANE[sayfa] || [sayfa];
  const s = await wixData.query(IGNE).hasSome('sayfa', hane).limit(200).find(SA);
  return s.items.map(igneSatiri).sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
}

// İğne nereye düşerse düşsün panoda da görünür (taslak: "Panoda da görünüyor").
export async function igneEkle(veri, aktor) {
  const sayfa = String(veri.sayfa || '').trim();
  if (!HANE[sayfa]) throw new Error('Sayfa geçersiz.');
  const icerik = metin(veri.metin, UZUN, 'İğnelenecek metin', true);
  const hedef = IGNE_HEDEFLERI[veri.hedef] ? veri.hedef : 'pano';
  const kaynak = metin(veri.kaynak, 120, 'Kaynak') || kim(aktor);
  let bagliKayit = null;
  if (hedef === 'karar') {
    const ozet = icerik.length > KISA ? icerik.slice(0, KISA - 1) + '…' : icerik;
    const k = await kararOner({ masa: KARAR_MASASI[sayfa], baslik: ozet, aciklama: icerik.length > KISA ? icerik : '', oneren: kaynak }, aktor);
    bagliKayit = `karar:${k.id}`;
  } else if (hedef === 'fikir') {
    const ozet = icerik.split('\n')[0].slice(0, 120);
    const f = await icerikKaydet({ baslik: ozet, not: icerik, durum: 'fikir', kanal: 'Diğer' }, aktor);
    bagliKayit = `icerik:${f.id}`;
  }
  const i = await wixData.insert(IGNE, { sayfa, metin: icerik, kaynak, hedef, kimEkledi: kim(aktor), bagliKayit, tarih: new Date() }, SA);
  return igneSatiri(i);
}

export async function igneKaldir(id) {
  await wixData.remove(IGNE, String(id || ''), SA);
  return { kaldirildi: true };
}

// --- İçerikler ---

function icerikSatiri(c) {
  return {
    id: c._id, baslik: c.baslik, tarih: c.tarih || null, saat: c.saat || null, kanal: c.kanal || 'Diğer',
    durum: c.durum || 'fikir', durumEtiketi: ICERIK_DURUMLARI[c.durum] || c.durum,
    not: c.not || '', etiket: c.etiket || null, sorumlu: c.sorumlu || null
  };
}

export async function icerikleriGetir(hafta) {
  const bas = hafta;
  const son = gunEkle(hafta, 6);
  const [haftaS, fikirS] = await Promise.all([
    wixData.query(ICERIK).ge('tarih', bas).le('tarih', son).limit(200).find(SA),
    wixData.query(ICERIK).eq('durum', 'fikir').limit(200).find(SA)
  ]);
  const haftaninlar = haftaS.items.map(icerikSatiri).sort((a, b) => `${a.tarih} ${a.saat || ''}`.localeCompare(`${b.tarih} ${b.saat || ''}`));
  const fikirler = fikirS.items.filter((c) => !c.tarih).map(icerikSatiri);
  return { hafta: bas, gunler: Array.from({ length: 7 }, (_, i) => gunEkle(bas, i)), icerikler: haftaninlar, fikirler };
}

export async function icerikKaydet(veri, aktor) {
  const durum = ICERIK_DURUMLARI[veri.durum] ? veri.durum : 'fikir';
  const tarih = ymdKontrol(veri.tarih, 'Tarih');
  if (durum !== 'fikir' && !tarih) throw new Error('Planlanan içeriğin tarihi olmalı.');
  const kanal = KANAL_ADLARI.includes(veri.kanal) ? veri.kanal : 'Diğer';
  const alanlar = {
    baslik: metin(veri.baslik, KISA, 'Başlık', true),
    tarih, saat: saatKontrol(veri.saat), kanal, durum,
    not: metin(veri.not, 8000, 'Not'),
    etiket: metin(veri.etiket, 60, 'Etiket') || null,
    sorumlu: metin(veri.sorumlu, 120, 'Sorumlu') || kim(aktor)
  };
  if (veri.id) {
    const eski = await wixData.get(ICERIK, String(veri.id), SA);
    if (!eski) throw new Error('İçerik bulunamadı.');
    return icerikSatiri(await wixData.update(ICERIK, { ...eski, ...alanlar }, SA));
  }
  return icerikSatiri(await wixData.insert(ICERIK, alanlar, SA));
}

export async function icerikDurumu(id, durum) {
  if (!ICERIK_DURUMLARI[durum]) throw new Error('Durum geçersiz.');
  const eski = await wixData.get(ICERIK, String(id || ''), SA);
  if (!eski) throw new Error('İçerik bulunamadı.');
  if (durum !== 'fikir' && !eski.tarih) throw new Error('Önce bir tarih verin (Düzenle).');
  return icerikSatiri(await wixData.update(ICERIK, { ...eski, durum }, SA));
}

export async function icerikSil(id) {
  await wixData.remove(ICERIK, String(id || ''), SA);
  return { silindi: true };
}

// --- Haftalık istatistik ---

function istatSatiri(s) {
  return {
    id: s._id, hafta: s.hafta, yayin: s.yayin ?? null, yayinPlan: s.yayinPlan ?? null,
    kaydetme: s.kaydetme ?? null, dm: s.dm ?? null, anket: s.anket ?? null, kn: s.kn ?? null, giren: s.giren || null
  };
}

export async function istatistikleriGetir(adet = 6) {
  const s = await wixData.query(ISTAT).descending('hafta').limit(adet).find(SA);
  return s.items.map(istatSatiri);
}

export async function istatistikKaydet(veri, aktor) {
  const hafta = haftaBasi(ymdKontrol(veri.hafta, 'Hafta') || haftaBasi(gunTR()));
  const alanlar = {
    hafta,
    yayin: sayi(veri.yayin, 'Yayın'),
    yayinPlan: sayi(veri.yayinPlan, 'Planlanan yayın'),
    kaydetme: sayi(veri.kaydetme, 'Kaydetme + paylaşma'),
    dm: sayi(veri.dm, 'DM / soru'),
    anket: sayi(veri.anket, 'Anket cevabı'),
    kn: sayi(veri.kn, 'KN formu'),
    giren: kim(aktor)
  };
  const var_ = await wixData.query(ISTAT).eq('hafta', hafta).limit(1).find(SA);
  const k = var_.items[0];
  return istatSatiri(k ? await wixData.update(ISTAT, { ...k, ...alanlar }, SA) : await wixData.insert(ISTAT, alanlar, SA));
}

// --- Kanallar ---

function kanalSatiri(k) {
  return {
    id: k._id, kanal: k.kanal, rol: k.rol || '', durum: k.durum || 'kontrol',
    durumEtiketi: KANAL_DURUMLARI[k.durum] || KANAL_DURUMLARI.kontrol, not: k.not || '', sinif: k.sinif || '',
    kontrolTarihi: k.kontrolTarihi || null, sira: Number(k.sira) || 99
  };
}

export async function kanallariGetir() {
  const s = await wixData.query(KANAL).limit(50).find(SA);
  return s.items.map(kanalSatiri).sort((a, b) => a.sira - b.sira);
}

export async function kanalGuncelle(veri) {
  const k = await wixData.get(KANAL, String(veri.id || ''), SA);
  if (!k) throw new Error('Kanal bulunamadı.');
  const durum = KANAL_DURUMLARI[veri.durum] ? veri.durum : k.durum;
  const yeni = { ...k, durum, rol: metin(veri.rol ?? k.rol, KISA, 'Rol'), not: metin(veri.not ?? k.not, 1000, 'Not'), kontrolTarihi: gunTR() };
  return kanalSatiri(await wixData.update(KANAL, yeni, SA));
}

// --- İlk gün rehberi ---

export async function rehberDurumu(sayfa) {
  const a = await ayarGetir(`rehber-${sayfa}`);
  return Array.isArray(a && a.tamam) ? a.tamam.map(String) : [];
}

export async function rehberAdimi(sayfa, adim, tamam, aktor) {
  if (!HANE[sayfa]) throw new Error('Sayfa geçersiz.');
  const no = String(Number(adim));
  const liste = new Set(await rehberDurumu(sayfa));
  if (tamam) liste.add(no); else liste.delete(no);
  await ayarYaz(`rehber-${sayfa}`, { title: `İlk gün rehberi: ${sayfa}`, tamam: [...liste] }, aktor);
  return [...liste];
}

// --- Masaya yeni gelen iş (Masa YZ'sinin yönlendirme kartı) ---
//
// Modülü seçilmemiş, henüz yönlendirilmemiş açık B işi masaya "yeni geldi".
// Masa YZ'si (ya da insan) işi modüle verir, masada tutar ya da iade eder.

export const YENI_IS_GUN = 14;

export function yeniGelenMi(k, simdi = new Date()) {
  if (k.kategori !== 'B' || k.modul || k.masaYonlendirme) return false;
  const yer = mevcutDurum(k);
  if (yer.durum === 'tamamlandi' || yer.durum === 'iptal') return false;
  const t = k.tarih || k._createdDate;
  const gun = t ? gunArasi(gunTR(new Date(t.$date || t)), gunTR(simdi)) : 0;
  return gun <= YENI_IS_GUN;
}

export const YONLENDIRMELER = {
  icerik: 'İçerik\'e verildi',
  gorunurluk: 'Görünürlük\'e verildi',
  masa: 'Masa yönetiminde kaldı',
  iade: 'Masa iade etti: bu iş Pazarlama\'nın değil'
};

export async function isYonlendir(isId, hedef, aktor) {
  if (!YONLENDIRMELER[hedef]) throw new Error('Yönlendirme geçersiz.');
  const alanlar = { masaYonlendirme: hedef };
  if (hedef === 'icerik' || hedef === 'gorunurluk') alanlar.modul = hedef;
  // İade: iş Bugün'e düşer, Kontrol Paneli'nde kategorisi düzeltilir.
  if (hedef === 'iade') alanlar.termin = gunTR();
  await kayitDuzenle(String(isId), alanlar, aktor, `Pazarlama masası: ${YONLENDIRMELER[hedef]}`);
  return { isId: String(isId), hedef, mesaj: YONLENDIRMELER[hedef] };
}

// --- İş özeti (şeritteki yığın ve 6 haftalık mini çubuk) ---
//
// r: kontrolPaneli.satir çıktıları (hanenin işleri, açık + kapalı); kayitlar: ham kayıtlar.
export function isOzeti(satirlar, kayitlar, simdi = new Date()) {
  const bugun = gunTR(simdi);
  const ay = bugun.slice(0, 7);
  const ozet = { bitti: 0, zamaninda: 0, yaklasiyor: 0, gecikti: 0 };
  const kayitHarita = new Map(kayitlar.map((k) => [String(k.isId), k]));
  for (const r of satirlar) {
    if (r.acik) {
      if (r.termin && r.termin < bugun) ozet.gecikti++;
      else if (r.termin && gunArasi(bugun, r.termin) <= 7) ozet.yaklasiyor++;
      else ozet.zamaninda++;
    } else if (r.durum === 'tamamlandi') {
      const k = kayitHarita.get(String(r.isId));
      const t = k ? kapanisZamani(k) : null;
      if (t && gunTR(new Date(t)).startsWith(ay)) ozet.bitti++;
    }
  }
  // Son 6 hafta (Pazartesi başlangıçlı), en eski önce.
  const buHafta = haftaBasi(bugun);
  const haftalar = Array.from({ length: 6 }, (_, i) => gunEkle(buHafta, -7 * (5 - i)));
  const kapanan = haftalar.map(() => 0);
  for (const r of satirlar) {
    if (r.durum !== 'tamamlandi') continue;
    const k = kayitHarita.get(String(r.isId));
    const t = k ? kapanisZamani(k) : null;
    if (!t) continue;
    const hb = haftaBasi(gunTR(new Date(t)));
    const i = haftalar.indexOf(hb);
    if (i >= 0) kapanan[i]++;
  }
  return { ay, ...ozet, haftalar, kapanan };
}
