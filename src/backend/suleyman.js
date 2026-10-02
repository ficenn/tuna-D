// Süleyman — İş yaşam döngüsü koordinasyon katmanı (MVP).
//
// Görevi: bir İş Kaydı'nın Aşama (Stage) ve Durum (Status) geçişlerini
// tek bir yerden yönetmek:
//   - geçişin izinli olup olmadığını kontrol eder,
//   - gerekli veriyi (ör. gerekçe) kontrol eder,
//   - AYNI İş Kaydı'nı günceller (yeni kayıt açmaz),
//   - her geçişi `gecmis` alanına ekler (kim, ne zaman, neden),
//   - insan kararlarını YZ/sistem eylemlerinden `aktor.tur` ile ayırır.
//
// Bu sürüm yalnızca Aşama 1 → Aşama 2 geçişlerini içerir. Sonraki geçişler
// (Karar, Yönlendirme, ...) bilinçli olarak henüz eklenmedi.

import wixData from 'wix-data';

const KOLEKSIYON = 'IsKayitlari';

// --- Sabit sözlükler (MVP'de bunların dışında değer yok) ---

export const ASAMALAR = {
  '1_giris': 'Giriş / İş Kaydı',
  '2_degerlendirme': 'Değerlendirme',
  '3_karar': 'Karar',
  '4_yonlendirme': 'Yönlendirme / Çalışma Hazırlığı',
  '5_yurutme': 'Uygulama',
  '6_sonuc': 'Sonuç',
  '7_guncelleme': 'Güncelleme / Döngü'
};

export const DURUMLAR = {
  sirada: 'Sırada',
  devam_ediyor: 'Devam ediyor',
  beklemede: 'Beklemede',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal'
};

export const AKTOR_TURLERI = ['insan', 'sistem', 'yz'];

// --- Bu aşamada uygulanan geçişler ---
//
// Her geçiş: hangi Aşama/Durum'dan çıkılabilir (kaynak), nereye gidilir
// (hedef), kim yapabilir (aktorTurleri), gerekçe zorunlu mu (notZorunlu).
const GECISLER = {
  // KN: YZ analizi başarıyla geldi → Aşama 1 tamamlandı.
  yz_hazirlik_tamamlandi: {
    kaynak: [['1_giris', 'devam_ediyor']],
    hedef: ['2_degerlendirme', 'sirada'],
    aktorTurleri: ['yz'],
    notZorunlu: false
  },
  // YZ analizi başarısız/gelmedi → insan Aşama 1'i YZ'siz tamamlar.
  hazirlik_yz_olmadan_tamamlandi: {
    kaynak: [['1_giris', 'devam_ediyor']],
    hedef: ['2_degerlendirme', 'sirada'],
    aktorTurleri: ['insan'],
    notZorunlu: true
  },
  // İnsanın girdiği iş: girişin kendisi hazırlıktır → Aşama 1 tamamlandı.
  giris_tamamlandi: {
    kaynak: [['1_giris', 'devam_ediyor']],
    hedef: ['2_degerlendirme', 'sirada'],
    aktorTurleri: ['insan'],
    notZorunlu: false
  }
};

// --- Yardımcılar ---

function aktorKontrol(aktor) {
  if (!aktor || !AKTOR_TURLERI.includes(aktor.tur)) {
    throw new Error(`Süleyman: geçersiz aktör: ${JSON.stringify(aktor)}`);
  }
  return { tur: aktor.tur, kim: String(aktor.kim || aktor.tur) };
}

export function gecmisKaydi({ islem, onceki, yeni, aktor, not }) {
  return {
    tarih: new Date().toISOString(),
    islem,
    onceki,
    yeni,
    aktor,
    not: not || null
  };
}

// Eski kayıtlar (asama alanı yok, durum "İlk kayıt" gibi eski bir değer)
// Aşama 1 / devam ediyor olarak okunur. Kayıtlar taşınmaz, sadece böyle
// yorumlanır.
export function mevcutDurum(kayit) {
  const asama = ASAMALAR[kayit.asama] ? kayit.asama : '1_giris';
  let durum = DURUMLAR[kayit.status] ? kayit.status : null;
  if (!durum) durum = asama === '1_giris' ? 'devam_ediyor' : 'sirada';
  return { asama, durum, masa: kayit.atananMasa || null };
}

// Yeni İş Kaydı'nın yaşam döngüsü alanları: Aşama 1 başlar.
// isKaydiEkleYenidenDenemeli'ye verilen kayıt verisine eklenir.
export function ilkKayitAlanlari(aktor) {
  const a = aktorKontrol(aktor);
  const yeni = { asama: '1_giris', durum: 'devam_ediyor', masa: null };
  return {
    asama: yeni.asama,
    status: yeni.durum,
    gecmis: [gecmisKaydi({ islem: 'kayit_olusturuldu', onceki: null, yeni, aktor: a })]
  };
}

// --- Ana fonksiyon ---
//
// Sonuç nesnesi döner, izinsiz geçişte hata FIRLATMAZ (çağıran karar verir):
//   { basarili: true,  degisti: true }               geçiş yapıldı
//   { basarili: true,  degisti: false, sebep }       zaten hedefte (tekrar)
//   { basarili: false, degisti: false, sebep, mesaj } izinsiz geçiş
// Kayıt bulunamazsa, aktör/gerekçe eksikse veya veritabanı hatası olursa
// hata fırlatır.
export async function gecisYap(isId, islem, aktor, not) {
  const tanim = GECISLER[islem];
  if (!tanim) throw new Error(`Süleyman: bilinmeyen geçiş: ${islem}`);

  const a = aktorKontrol(aktor);
  if (!tanim.aktorTurleri.includes(a.tur)) {
    throw new Error(`Süleyman: '${islem}' geçişini '${a.tur}' yapamaz.`);
  }

  const temizNot = String(not || '').trim();
  if (tanim.notZorunlu && !temizNot) {
    throw new Error(`Süleyman: '${islem}' için gerekçe zorunlu.`);
  }

  const sonuc = await wixData
    .query(KOLEKSIYON)
    .eq('isId', String(isId))
    .limit(1)
    .find({ suppressAuth: true });
  if (!sonuc.items.length) throw new Error(`Süleyman: İş Kaydı bulunamadı: ${isId}`);

  const kayit = sonuc.items[0];
  const onceki = mevcutDurum(kayit);
  const [hedefAsama, hedefDurum] = tanim.hedef;

  if (onceki.asama === hedefAsama && onceki.durum === hedefDurum) {
    return { basarili: true, degisti: false, sebep: 'zaten_hedefte', asama: onceki.asama, durum: onceki.durum };
  }

  const izinli = tanim.kaynak.some(([as, du]) => as === onceki.asama && du === onceki.durum);
  if (!izinli) {
    return {
      basarili: false,
      degisti: false,
      sebep: 'izinsiz_gecis',
      mesaj: `${isId}: '${ASAMALAR[onceki.asama]} / ${DURUMLAR[onceki.durum]}' durumundan '${islem}' yapılamaz.`,
      asama: onceki.asama,
      durum: onceki.durum
    };
  }

  const yeni = { asama: hedefAsama, durum: hedefDurum, masa: onceki.masa };
  const giris = gecmisKaydi({ islem, onceki, yeni, aktor: a, not: temizNot });

  await wixData.update(
    KOLEKSIYON,
    {
      ...kayit,
      asama: hedefAsama,
      status: hedefDurum,
      gecmis: [...(Array.isArray(kayit.gecmis) ? kayit.gecmis : []), giris]
    },
    { suppressAuth: true }
  );

  console.log(`Süleyman: ${isId} ${onceki.asama}/${onceki.durum} → ${hedefAsama}/${hedefDurum} (${islem}, ${a.tur})`);
  return { basarili: true, degisti: true, asama: hedefAsama, durum: hedefDurum };
}
