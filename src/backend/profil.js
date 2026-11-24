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

export const PROFILLER = {
  tunad: { kategoriler: ['A', 'B', 'C', 'D', 'Y'], sayfalar: ['yonetim', 'pazarlama', 'icerik', 'gorunurluk'], musteri: true, kn: true },
  psikolog: { kategoriler: ['B', 'C'], sayfalar: ['pazarlama', 'icerik', 'gorunurluk'], musteri: false, kn: false }
};

export async function kurulumProfili() {
  try {
    const k = await wixData.get('HapAyarlari', 'kurulum', { suppressAuth: true });
    return k && k.profil === 'tunad' ? 'tunad' : 'psikolog';
  } catch (hata) {
    return 'psikolog';
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
