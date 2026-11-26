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
  // Tempo kutusunun başlığı (27 Kas): psikologda "müşteri akışı" yok; ölçü seans sayısı.
  etiketler: { sakin: 'Yolunda', uyari: 'Dikkat', kirmizi: 'Öncelik: seans sayısı', hazirlik: 'Açılış hazırlığı' },
  aciklama: '<b>Açılış hazırlığı:</b> işletmeni açmaya hazırlanırken; alarm yok, seans sayısı Eşik\'le karşılaştırılmaz. <b>Ölçüm:</b> önce Eşik izlenir; 3 ay üst üste her ay Eşik aşılırsa Hedef\'e geçilir. Evre, Eşik ve Hedef senin kararın.'
};

// Ekran metinleri (T paketi A4/A5, 26 Kas; Fatoş'un "Ekran metinleri — psikolog
// sürümü" taslağı). Sayfadaki varsayılan metinler tuna:D'nindir; burada yalnızca
// psikologda değişenler durur. "Masayı tanı" ve başlık altı Masalar koleksiyonundan
// gelir (isi / kart), burada değil.
const METIN_PSIKOLOG = {
  sayfa: {
    icerik: { yzAlt: 'Pazarlama masasının kararlarıyla çalışır. Senin sesinle taslak yazar; yayımlamaz.' }
  },
  fikirAlt: 'Tarihi olmayan fikirler. Haftalık içerik çalışmanda takvime yerleştirilir.',
  yolculuk: 'görmek → fark etmek → durmak → okumak → anlamlandırmak → etkilenmek → davranmak',
  planNotu: 'Hangi kanalda, hangi gün, hangi saatte. Yayını insan yapar; buradaki her satır kendi kanalında zamanlanmış olmalı.',
  planCumartesi: false
};

// İlk gün rehberi adımları: psikologda değişen sayfalar. Olmayan sayfa tuna:D
// adımlarını kullanır (masaSayfasi.js ILK_ADIMLAR).
const ILK_ADIMLAR_PSIKOLOG = {
  pazarlama: [
    { ad: 'Kime sesleniyoruz?', aciklama: 'Herkese seslenen kimseye ulaşmaz. Tek bir kişiyi tarif ederek başla.' },
    { ad: 'Farkımız ne?', aciklama: 'Seni sen yapan şey. Vitrinin ilk cümlesi buradan çıkar.' },
    { ad: 'Hangi kanallar?', aciklama: 'Her yerde olmak zorunda değilsin; iyi bakılan iki kanal ve meslektaş ağın yeter.' },
    { ad: 'İlk ayın temposu', aciklama: 'Haftada kaç içerik, kaç meslektaş ya da kurum görüşmesi? Sayıyla yaz ki ölçebilelim.' }
  ],
  icerik: [
    { ad: 'Sesini bul', aciklama: 'Nasıl konuşursun, kime nasıl hitap edersin? Üç cümle yeter.' },
    { ad: 'Havuza ilk 5 fikir', aciklama: 'Yarım fikir de fikirdir. Buraya at, kaybolmasın.' },
    { ad: 'Haftalık ritmini seç', aciklama: 'Haftada kaç içerik, hangi günler? Sen belirle: sana uygun olanı söyle.' }
  ],
  gorunurluk: [
    { ad: 'Vitrinini düzenle', aciklama: 'Biri seni bugün bulsa ne görür? Unvanın, fotoğrafın, bion, iletişim yolun.' },
    { ad: 'Yayın günlerini seç', aciklama: 'Kaç gün olacağını sen seç; hep aynı günler olsun: alışkanlık güven verir.' },
    { ad: 'Ölçmeye başla', aciklama: 'Her hafta üç sayı: yayın, gelen soru ya da mesaj, ilk görüşme.' }
  ]
};

// Haftalık içerik ritmi (0/3 sayacı): HapAyarlari 'ritim'.haftalik (1–7). Kayıt
// yoksa tuna:D'de 3 (eski kural), psikologda belirlenmemiş (null).
export const PROFILLER = {
  tunad: { kategoriler: ['A', 'B', 'C', 'D', 'Y'], sayfalar: ['yonetim', 'pazarlama', 'icerik', 'gorunurluk'], musteri: true, kn: true, istatistik: ISTAT_TUNAD, tempo: TEMPO_TUNAD, metinler: {}, ilkAdimlar: {}, ritim: 3 },
  psikolog: { kategoriler: ['B', 'C'], sayfalar: ['pazarlama', 'icerik', 'gorunurluk'], musteri: false, kn: false, istatistik: ISTAT_PSIKOLOG, tempo: TEMPO_PSIKOLOG, metinler: METIN_PSIKOLOG, ilkAdimlar: ILK_ADIMLAR_PSIKOLOG, ritim: null }
};

export async function kurulumProfili() {
  try {
    const k = await wixData.get('HapAyarlari', 'kurulum', { suppressAuth: true });
    return k && k.profil === 'tunad' ? 'tunad' : 'psikolog';
  } catch (hata) {
    return 'psikolog';
  }
}

// İşletme kimliği (000044): kurulum kaydındaki ad ve logo, masa sayfasının sol üstünde
// HAP logosunun altında görünür. Ad girilmemişse psikolog sitesinde boş kalır; tuna:D'nin
// adı yalnızca kendi sitemizde çıkar. Logo HapAyarlari 'kurulum'.logo alanındadır (CMS'te
// Görsel alanı ya da https adresi); Wix görseli tarayıcının açabileceği adrese çevrilir.
export function logoAdresi(deger) {
  const s = typeof deger === 'string' ? deger.trim() : (deger && typeof deger.src === 'string' ? deger.src.trim() : '');
  const wix = /^wix:image:\/\/v1\/([^/#?]+)/.exec(s);
  if (wix) return `https://static.wixstatic.com/media/${wix[1]}`;
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s.slice(0, 500) : '';
}

export async function isletmeKimligi() {
  try {
    const k = await wixData.get('HapAyarlari', 'kurulum', { suppressAuth: true });
    const ad = k && typeof k.isletmeAdi === 'string' ? k.isletmeAdi.trim().slice(0, 40) : '';
    return { ad: ad || (k && k.profil === 'tunad' ? 'tuna:D' : ''), logo: logoAdresi(k && k.logo) };
  } catch (hata) {
    return { ad: '', logo: '' };
  }
}

export async function isletmeAdi() {
  return (await isletmeKimligi()).ad;
}

export async function profilKurallari() {
  return PROFILLER[await kurulumProfili()];
}

// { A: '…', B: '…' } gibi bir sözlükten yalnızca izinli anahtarlar.
export function izinliler(sozluk, anahtarlar) {
  return Object.fromEntries(Object.entries(sozluk || {}).filter(([k]) => anahtarlar.includes(k)));
}

export const KAPALI_TUR_MESAJI = "Bu iş türü senin HAP'ında açık değil.";
