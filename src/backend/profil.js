// Kurulum profili (HAP işi 000090, 25 Kas): hangi iş türleri ve sayfalar açık?
//
// Profil HapAyarlari 'kurulum'.profil alanındadır. 'tunad' yalnızca bizim ana
// sitemizdir; ayar yoksa ya da başka bir değerse en kapalı profil (psikolog)
// geçerlidir. Kural kodda durur, arayüz yalnızca gösterir: düğme gizlense de
// arka uç izinsiz türü reddeder.
//
// Psikolog (21 Kas kurulu, pilot kapsamı): yalnızca B (Pazarlama) ve
// C (Yapılacaklar). A (Ticari) ve müşteri kaydı yok: danışana dair hiçbir şey,
// kod ya da rumuz da HAP'a girmez (7 Kas kararı). D ve Y pilotta yok;
// Yönetim masası pilot dışı.

import wixData from 'wix-data';

// Haftalık istatistik alanları (000053, 26 Kas): psikolog yalnızca 2–3 sayı girer
// (yayınlanan içerik, gelen soru/mesaj, yeni ilk görüşme); anket ve KN tuna:D'ye özgü.
// Sıra ekrandaki sıradır. 'yayinPlan' ayrı sütun değil, yayının yanında "3 / 4" diye görünür.
const ISTAT_TUNAD = [
  { alan: 'yayin', etiket: 'Yayın (yapılan)', kisa: 'Yayın' },
  { alan: 'yayinPlan', etiket: 'Planlanan yayın', kisa: 'Plan' },
  { alan: 'kaydetme', etiket: 'Kaydetme + paylaşma', kisa: 'Kaydetme + paylaşma' },
  { alan: 'dm', etiket: 'DM / soru', kisa: 'DM / soru' },
  { alan: 'anket', etiket: 'Anket cevabı', kisa: 'Anket cevabı' },
  { alan: 'kn', etiket: 'KN formu', kisa: 'KN formu' }
];
const ISTAT_PSIKOLOG = [
  { alan: 'yayin', etiket: 'Yayınlanan içerik', kisa: 'Yayın' },
  { alan: 'dm', etiket: 'Gelen soru / mesaj', kisa: 'Soru / mesaj' },
  { alan: 'gorusme', etiket: 'Yeni ilk görüşme', kisa: 'İlk görüşme' }
];

// Tempo ayarları (26 Kas, T): evrelerin adı ve açıklaması profile göre. Değerler aynı
// kalır (hazirlik / olcum); psikologda tempo yalnızca seans sayısıyla (elle) ölçülür.
const TEMPO_TUNAD = {
  evreler: [['hazirlik', 'Hazırlık (HAP bitene kadar)'], ['olcum', 'Ölçüm']],
  kaynaklar: [['kurulum', 'Kurulum sayısı (otomatik)'], ['elle', 'Seans sayısı (elle girilir)']],
  aciklama: '<b>Hazırlık evresi:</b> HAP bitene kadar alarm yok; ölçü strateji hedefleri (anket, KN). <b>Ölçüm evresi:</b> önce Eşik izlenir; 3 ay üst üste her ay Eşik aşılırsa Hedef\'e geçilir. Eşik, Hedef ve evre Yönetim\'in kararıdır.'
};
const TEMPO_PSIKOLOG = {
  evreler: [['hazirlik', '1. Açılış hazırlığı'], ['olcum', '2. Ölçüm']],
  kaynaklar: [['elle', 'Seans sayısı (elle girilir)']],
  aciklama: '<b>Açılış hazırlığı:</b> işletmeni açmaya hazırlanırken; alarm yok, seans sayısı Eşik\'le karşılaştırılmaz. <b>Ölçüm:</b> önce Eşik izlenir; 3 ay üst üste her ay Eşik aşılırsa Hedef\'e geçilir. Evre, Eşik ve Hedef senin kararın.'
};

export const PROFILLER = {
  tunad: { kategoriler: ['A', 'B', 'C', 'D', 'Y'], sayfalar: ['yonetim', 'pazarlama', 'icerik', 'gorunurluk'], musteri: true, kn: true, istatistik: ISTAT_TUNAD, tempo: TEMPO_TUNAD },
  psikolog: { kategoriler: ['B', 'C'], sayfalar: ['pazarlama', 'icerik', 'gorunurluk'], musteri: false, kn: false, istatistik: ISTAT_PSIKOLOG, tempo: TEMPO_PSIKOLOG }
};

export async function kurulumProfili() {
  try {
    const k = await wixData.get('HapAyarlari', 'kurulum', { suppressAuth: true });
    return k && k.profil === 'tunad' ? 'tunad' : 'psikolog';
  } catch (hata) {
    return 'psikolog';
  }
}

// Kurulum kaydındaki işletme adı (000044'ün ilk adımı, 26 Kas): masa sayfasının
// logosunun yanında görünür. Ad girilmemişse psikolog sitesinde boş kalır; tuna:D'nin
// adı yalnızca kendi sitemizde çıkar.
export async function isletmeAdi() {
  try {
    const k = await wixData.get('HapAyarlari', 'kurulum', { suppressAuth: true });
    const ad = k && typeof k.isletmeAdi === 'string' ? k.isletmeAdi.trim().slice(0, 40) : '';
    return ad || (k && k.profil === 'tunad' ? 'tuna:D' : '');
  } catch (hata) {
    return '';
  }
}

export async function profilKurallari() {
  return PROFILLER[await kurulumProfili()];
}

// { A: '…', B: '…' } gibi bir sözlükten yalnızca izinli anahtarlar.
export function izinliler(sozluk, anahtarlar) {
  return Object.fromEntries(Object.entries(sozluk || {}).filter(([k]) => anahtarlar.includes(k)));
}

export const KAPALI_TUR_MESAJI = "Bu iş türü senin HAP'ında açık değil.";
