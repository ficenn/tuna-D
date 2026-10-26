// Süleyman — İş yolculuğu koordinasyon katmanı (MVP).
//
// Görevi: bir İş Kaydı'nın nerede olduğunu (Aşama alanı: Giriş, duraklar,
// kısa yol) ve durumunu (Sırada, Devam ediyor, ...) tek bir yerden yönetmek:
//   - geçişin izinli olup olmadığını kontrol eder,
//   - gerekli veriyi (ör. gerekçe) kontrol eder,
//   - AYNI İş Kaydı'nı günceller (yeni kayıt açmaz),
//   - her geçişi `gecmis` alanına ekler (kim, ne zaman, neden),
//   - insan kararlarını YZ/sistem eylemlerinden `aktor.tur` ile ayırır.
//
// Ticari (A) işlerde "nerede" bilgisi bir DURAKTIR (masa + orada yapılan
// iş). Hangi durakların olduğu ve kararların nereye gittiği işletmeye
// özgüdür ve rota.js'te durur; Süleyman o tabloyu uygular.
// (2026-10-21: eski 7 aşama masa içi çalışma ritmine indi, bkz. mimari §14.)
//
// Kısa yol (B Pazarlama, C Yapılacaklar, D Ar-Ge): Yapılacak → Yapıldı.
//
// 2026-10-24: "rota bir kafes değil". Elle girilen iş istenen durakta
// başlayabilir; açık iş "İleri atla" ile sonraki bir durağa geçebilir (not
// zorunlu, geçmişe yazılır). KN işleri "Talep bekleniyor"da başlar; kişi
// TALEP_BEKLEME_GUN içinde yazmazsa iş kendiliğinden kapanır (sistem).

import wixData from 'wix-data';
import {
  DURAKLAR, GIRIS_DURAGI, SONUC_DURAGI, ILK_DURAK, KN_ILK_DURAK, CIKISLAR, SONUCLAR,
  TAKIP_DURAGI, TAKIP_PLANI_GUN, TALEP_DURAGI, TALEP_BEKLEME_GUN, BASLANGIC_DURAKLARI
} from './rota';

const KOLEKSIYON = 'IsKayitlari';

// --- Sabit sözlükler ---

export const DURUMLAR = {
  sirada: 'Sırada',
  devam_ediyor: 'Devam ediyor',
  beklemede: 'Beklemede',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal'
};

export const AKTOR_TURLERI = ['insan', 'sistem', 'yz'];

// Kısa yol işleri ayrı bir Aşama değeri (takip) taşır; durak kuralları
// onlara uygulanmaz.
export const KISA_YOL_ASAMASI = 'takip';
export const KISA_YOL_ETIKETLERI = {
  asama: 'Takip',
  sirada: 'Yapılacak',
  tamamlandi: 'Yapıldı',
  iptal: 'İptal'
};

// 2026-10-21 öncesindeki 7 aşamalı kayıtlar (000035+ test kayıtları):
// Aşama 2–7'deki bir iş, rotanın ilk durağında okunur. Kayıtlar yerinde
// değiştirilmez; bir sonraki geçişte yeni değer yazılır.
const ESKI_ASAMALAR = ['2_degerlendirme', '3_karar', '4_yonlendirme', '5_yurutme', '6_sonuc', '7_guncelleme'];

// Yaşam döngüsünü taşıyan alanlar: yalnızca Süleyman yazar.
export const YASAM_DONGUSU_ALANLARI = [
  'asama', 'status', 'gecmis', 'atananMasa', 'sonuc',
  'sonrakiTakip', 'takipSayisi', 'takipBaslangic', 'duzeltmeTuru'
];

// --- Etiketler (panel ve diğer modüller kullanır) ---

export function asamaEtiketi(asama) {
  if (asama === KISA_YOL_ASAMASI) return KISA_YOL_ETIKETLERI.asama;
  if (ESKI_ASAMALAR.includes(asama)) return DURAKLAR[ILK_DURAK].ad;
  return DURAKLAR[asama] ? DURAKLAR[asama].ad : asama;
}

export function durumEtiketi(asama, durum) {
  if (asama === KISA_YOL_ASAMASI) return KISA_YOL_ETIKETLERI[durum] || DURUMLAR[durum];
  return DURUMLAR[durum];
}

export function sonucEtiketi(kod) {
  return kod ? SONUCLAR[kod] || kod : null;
}

// --- Tarih yardımcıları (İstanbul günü, 'YYYY-MM-DD') ---

export function gunTR(simdi = new Date()) {
  return simdi.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

export function gunEkle(ymd, gun) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + gun)).toISOString().slice(0, 10);
}

// İki 'YYYY-MM-DD' arasındaki gün farkı (b - a).
export function gunArasi(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

function tarihKontrol(deger) {
  const s = String(deger ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Tarih geçersiz (YYYY-AA-GG olmalı).');
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new Error('Tarih geçersiz.');
  return s;
}

// Wix "Date" alanı metin ya da Date nesnesi olarak gelebilir.
function gunMetni(t) {
  if (!t) return null;
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = t instanceof Date ? t : new Date(t.$date || t);
  return isNaN(d) ? null : gunTR(d);
}

// --- Geçişler (giriş ve kısa yol) ---
//
// Her geçiş: hangi Aşama/Durum'dan çıkılabilir (kaynak), nereye gidilir
// (hedef), kim yapabilir (aktorTurleri), gerekçe zorunlu mu (notZorunlu).
// Duraklar arası geçişler aşağıda durakIslemi()'ndedir.
const GECISLER = {
  // KN: YZ analizi başarıyla geldi → Giriş tamamlandı, iş "Talep bekleniyor"da
  // (kişi rumuzuyla yazana kadar).
  yz_hazirlik_tamamlandi: {
    kaynak: [[GIRIS_DURAGI, 'devam_ediyor']],
    hedef: [KN_ILK_DURAK, 'sirada'],
    aktorTurleri: ['yz'],
    notZorunlu: false
  },
  // YZ analizi başarısız/gelmedi → insan Girişi YZ'siz tamamlar.
  hazirlik_yz_olmadan_tamamlandi: {
    kaynak: [[GIRIS_DURAGI, 'devam_ediyor']],
    hedef: [KN_ILK_DURAK, 'sirada'],
    aktorTurleri: ['insan'],
    notZorunlu: true
  },
  // KN (2026-10-26): form gelince YZ beklenmez; iş doğrudan "Talep
  // bekleniyor"a geçer. YZ taslağı kişi rumuzuyla yazınca istenir (KVKK:
  // cevaplar yalnızca gerçek talepte YZ'ye gider).
  kn_giris_tamamlandi: {
    kaynak: [[GIRIS_DURAGI, 'devam_ediyor']],
    hedef: [KN_ILK_DURAK, 'sirada'],
    aktorTurleri: ['sistem'],
    notZorunlu: false
  },
  // İnsanın girdiği iş: girişin kendisi hazırlıktır → seçilen başlangıç
  // durağı (varsayılan Durum Fotoğrafı).
  giris_tamamlandi: {
    kaynak: [[GIRIS_DURAGI, 'devam_ediyor']],
    hedef: [ILK_DURAK, 'sirada'],
    hedefSecenekleri: BASLANGIC_DURAKLARI,
    aktorTurleri: ['insan'],
    notZorunlu: false
  },
  // Kısa yol: Yapılacak → Yapıldı (B, C, D).
  takip_tamamlandi: {
    kaynak: [[KISA_YOL_ASAMASI, 'sirada']],
    hedef: [KISA_YOL_ASAMASI, 'tamamlandi'],
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

export function gecmisKaydi({ islem, onceki, yeni, aktor, not, etiket }) {
  const g = {
    tarih: new Date().toISOString(),
    islem,
    onceki,
    yeni,
    aktor,
    not: not || null
  };
  if (etiket) g.etiket = etiket;
  return g;
}

// Kaydın şu anki yeri. Eski kayıtlar (asama alanı yok ya da eski 7 aşama)
// burada yorumlanır; kayıtların kendisi taşınmaz.
export function mevcutDurum(kayit) {
  if (kayit.asama === KISA_YOL_ASAMASI) {
    const durum = DURUMLAR[kayit.status] ? kayit.status : 'sirada';
    return { asama: KISA_YOL_ASAMASI, durum, masa: kayit.atananMasa || null };
  }
  let asama = kayit.asama;
  if (ESKI_ASAMALAR.includes(asama)) asama = ILK_DURAK;
  if (!DURAKLAR[asama]) asama = GIRIS_DURAGI;
  let durum = DURUMLAR[kayit.status] ? kayit.status : null;
  if (!durum) durum = asama === GIRIS_DURAGI ? 'devam_ediyor' : 'sirada';
  let masa = kayit.atananMasa || null;
  if (!masa && DURAKLAR[asama].masa) masa = DURAKLAR[asama].masa;
  return { asama, durum, masa };
}

async function kayitBul(isId) {
  const sonuc = await wixData
    .query(KOLEKSIYON)
    .eq('isId', String(isId))
    .limit(1)
    .find({ suppressAuth: true });
  if (!sonuc.items.length) throw new Error(`Süleyman: İş Kaydı bulunamadı: ${isId}`);
  return sonuc.items[0];
}

// Yeni İş Kaydı'nın yaşam döngüsü alanları: Giriş başlar.
// isKaydiEkleYenidenDenemeli'ye verilen kayıt verisine eklenir.
// `not` isteğe bağlıdır (ör. İş Girişi'nde kaynak ve müşteri değişiklikleri).
export function ilkKayitAlanlari(aktor, not) {
  const a = aktorKontrol(aktor);
  const yeni = { asama: GIRIS_DURAGI, durum: 'devam_ediyor', masa: null };
  return {
    asama: yeni.asama,
    status: yeni.durum,
    gecmis: [gecmisKaydi({ islem: 'kayit_olusturuldu', onceki: null, yeni, aktor: a, not })]
  };
}

// Kısa yol işinin ilk alanları: doğrudan "Yapılacak" olarak açılır.
export function kisaYolIlkKayitAlanlari(aktor, not, masa) {
  const a = aktorKontrol(aktor);
  const yeni = { asama: KISA_YOL_ASAMASI, durum: 'sirada', masa: masa || null };
  return {
    asama: yeni.asama,
    status: yeni.durum,
    gecmis: [gecmisKaydi({ islem: 'kayit_olusturuldu', onceki: null, yeni, aktor: a, not })]
  };
}

// Bir durağa girerken o durağa özgü alanlar.
function duragaGirisAlanlari(durak, simdi) {
  if (durak === TAKIP_DURAGI) {
    const bugun = gunTR(simdi);
    return { takipBaslangic: bugun, takipSayisi: 0, sonrakiTakip: gunEkle(bugun, TAKIP_PLANI_GUN[0]) };
  }
  return {};
}

function duraktanCikisAlanlari(durak) {
  if (durak === TAKIP_DURAGI) return { sonrakiTakip: null };
  return {};
}

// --- Giriş ve kısa yol geçişleri ---
//
// Sonuç nesnesi döner, izinsiz geçişte hata FIRLATMAZ (çağıran karar verir):
//   { basarili: true,  degisti: true }               geçiş yapıldı
//   { basarili: true,  degisti: false, sebep }       zaten hedefte (tekrar)
//   { basarili: false, degisti: false, sebep, mesaj } izinsiz geçiş
// Kayıt bulunamazsa, aktör/gerekçe eksikse veya veritabanı hatası olursa
// hata fırlatır.
// secenek.hedefDurak: yalnızca hedefSecenekleri olan geçişte (giris_tamamlandi).
export async function gecisYap(isId, islem, aktor, not, simdi = new Date(), secenek = {}) {
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

  let [hedefAsama, hedefDurum] = tanim.hedef;
  let etiket = null;
  if (secenek && secenek.hedefDurak && secenek.hedefDurak !== hedefAsama) {
    if (!(tanim.hedefSecenekleri || []).includes(secenek.hedefDurak)) {
      throw new Error(`Süleyman: '${islem}' geçişi '${secenek.hedefDurak}' durağına gidemez.`);
    }
    hedefAsama = secenek.hedefDurak;
    etiket = `Giriş tamamlandı · başlangıç: ${DURAKLAR[hedefAsama].ad}`;
  }

  const kayit = await kayitBul(isId);
  const onceki = mevcutDurum(kayit);

  if (onceki.asama === hedefAsama && onceki.durum === hedefDurum) {
    return { basarili: true, degisti: false, sebep: 'zaten_hedefte', asama: onceki.asama, durum: onceki.durum };
  }

  const izinli = tanim.kaynak.some(([as, du]) => as === onceki.asama && du === onceki.durum);
  if (!izinli) {
    return {
      basarili: false,
      degisti: false,
      sebep: 'izinsiz_gecis',
      mesaj: `${isId}: '${asamaEtiketi(onceki.asama)} / ${durumEtiketi(onceki.asama, onceki.durum)}' durumundan '${islem}' yapılamaz.`,
      asama: onceki.asama,
      durum: onceki.durum
    };
  }

  // Durağa girildiğinde iş o durağın masasına geçer; kısa yolda masa değişmez.
  const hedefMasa = DURAKLAR[hedefAsama] ? DURAKLAR[hedefAsama].masa || onceki.masa : onceki.masa;
  const yeni = { asama: hedefAsama, durum: hedefDurum, masa: hedefMasa };
  const giris = gecmisKaydi({ islem, onceki, yeni, aktor: a, not: temizNot, etiket });

  await wixData.update(
    KOLEKSIYON,
    {
      ...kayit,
      ...duragaGirisAlanlari(hedefAsama, simdi),
      asama: hedefAsama,
      status: hedefDurum,
      atananMasa: hedefMasa,
      gecmis: [...(Array.isArray(kayit.gecmis) ? kayit.gecmis : []), giris]
    },
    { suppressAuth: true }
  );

  console.log(`Süleyman: ${isId} ${onceki.asama}/${onceki.durum} → ${hedefAsama}/${hedefDurum} (${islem}, ${a.tur})`);
  return { basarili: true, degisti: true, asama: hedefAsama, durum: hedefDurum };
}

// --- Durak işlemleri (A işleri, yalnızca insan) ---
//
// islem:
//   basla        Sırada → Devam ediyor
//   beklet       Sırada / Devam ediyor → Beklemede (gerekçe zorunlu)
//   devamEt      Beklemede → Devam ediyor
//   iptal        açık iş → İptal (gerekçe zorunlu; yalnızca anlamsızlaşan işler)
//   takipYapildi Aday Takibi'nde bir yoklama yapıldı (not, isteğe bağlı sonraki tarih)
//   evet / hayir durağın çıkış kararı (rota.js'teki CIKISLAR)
//   ileriAtla    sonraki bir durağa doğrudan geç (not zorunlu; secenek.hedef)
// secenek: { not, tarih, hedef }
//
// İzinsiz işlemde hata fırlatmaz: { basarili: false, sebep, mesaj } döner.
export const DURAK_ISLEMLERI = ['basla', 'beklet', 'devamEt', 'iptal', 'takipYapildi', 'evet', 'hayir', 'ileriAtla'];
const ISLEM_GECMIS_ADLARI = {
  basla: 'durak_basladi', beklet: 'durak_bekletildi', devamEt: 'durak_devam',
  iptal: 'is_iptal', takipYapildi: 'takip_yapildi', evet: 'durak_cikisi', hayir: 'durak_cikisi',
  ileriAtla: 'durak_atlandi'
};

// Bir duraktan "İleri atla" ile gidilebilecek duraklar (sırasıyla).
// Giriş ve Sonuç hariç; yalnızca ileri.
export function ileriDuraklar(asama) {
  const su = DURAKLAR[asama];
  if (!su) return [];
  return Object.keys(DURAKLAR)
    .filter((k) => k !== GIRIS_DURAGI && k !== SONUC_DURAGI && DURAKLAR[k].sira > su.sira)
    .sort((x, y) => DURAKLAR[x].sira - DURAKLAR[y].sira);
}

// Durağın şu an izin verdiği işlemler (panel düğmeleri için).
export function izinliDurakIslemleri(durum) {
  const { asama, durum: d } = durum;
  if (asama === KISA_YOL_ASAMASI || asama === GIRIS_DURAGI || asama === SONUC_DURAGI) return [];
  if (d === 'tamamlandi' || d === 'iptal') return [];
  // Talep bekleniyor: kişi yazınca evet; olgunlaşmış gelirse ileri atla.
  // Başla / Beklet yok; 14 gün dolunca sistem kapatır.
  if (asama === TALEP_DURAGI) return ['evet', 'ileriAtla', 'iptal'];
  const liste = [];
  if (d === 'sirada') liste.push('basla');
  if (d === 'sirada' || d === 'devam_ediyor') liste.push('beklet');
  if (d === 'beklemede') liste.push('devamEt');
  if (asama === TAKIP_DURAGI && d !== 'beklemede') liste.push('takipYapildi');
  const cikis = CIKISLAR[asama] || {};
  if (d !== 'beklemede') {
    if (cikis.evet) liste.push('evet');
    if (cikis.hayir) liste.push('hayir');
    if (ileriDuraklar(asama).length > 1) liste.push('ileriAtla');
  }
  liste.push('iptal');
  return liste;
}

function izinsiz(isId, onceki, islem) {
  return {
    basarili: false,
    degisti: false,
    sebep: 'izinsiz_gecis',
    mesaj: `${isId}: '${asamaEtiketi(onceki.asama)} / ${durumEtiketi(onceki.asama, onceki.durum)}' durumunda '${islem}' yapılamaz.`,
    asama: onceki.asama,
    durum: onceki.durum
  };
}

export async function durakIslemi(isId, islem, aktor, secenek = {}, simdi = new Date()) {
  if (!DURAK_ISLEMLERI.includes(islem)) throw new Error(`Süleyman: bilinmeyen durak işlemi: ${islem}`);
  const a = aktorKontrol(aktor);
  if (a.tur !== 'insan') throw new Error('Süleyman: durak kararlarını yalnızca insan verir.');

  const temizNot = String(secenek.not || '').trim();
  if (temizNot.length > 2000) throw new Error('Not çok uzun (en fazla 2000 karakter).');

  const kayit = await kayitBul(isId);
  const onceki = mevcutDurum(kayit);
  if (!izinliDurakIslemleri(onceki).includes(islem)) return izinsiz(isId, onceki, islem);

  const bugun = gunTR(simdi);
  let yeni = { ...onceki };
  let ek = {};
  let etiket = null;
  let sonuc = null;

  if (islem === 'basla') {
    yeni.durum = 'devam_ediyor';
  } else if (islem === 'beklet') {
    if (!temizNot) throw new Error('Gerekçe zorunlu: iş neden bekliyor?');
    yeni.durum = 'beklemede';
  } else if (islem === 'devamEt') {
    yeni.durum = 'devam_ediyor';
  } else if (islem === 'iptal') {
    if (!temizNot) throw new Error('Gerekçe zorunlu: iş neden iptal ediliyor?');
    yeni.durum = 'iptal';
    ek = duraktanCikisAlanlari(onceki.asama);
  } else if (islem === 'takipYapildi') {
    const elleTarih = tarihKontrol(secenek.tarih);
    if (elleTarih && elleTarih < bugun) throw new Error('Sonraki takip tarihi geçmişte olamaz.');
    const sayi = (Number(kayit.takipSayisi) || 0) + 1;
    let sonraki = elleTarih;
    if (!sonraki && sayi < TAKIP_PLANI_GUN.length) {
      const baslangic = gunMetni(kayit.takipBaslangic) || bugun;
      const plan = gunEkle(baslangic, TAKIP_PLANI_GUN[sayi]);
      const yarin = gunEkle(bugun, 1);
      sonraki = plan < yarin ? yarin : plan;
    }
    yeni.durum = 'devam_ediyor';
    ek = { takipSayisi: sayi, sonrakiTakip: sonraki || null };
    etiket = `${sayi}. takip yapıldı` + (sonraki ? ` · sonraki: ${sonraki.split('-').reverse().join('.')}` : ' · sonraki tarih yok, karar sizde');
  } else if (islem === 'ileriAtla') {
    const hedef = String(secenek.hedef || '').trim();
    if (!ileriDuraklar(onceki.asama).includes(hedef)) throw new Error('İleri atla: geçerli bir sonraki durak seçin.');
    if (!temizNot) throw new Error('Not zorunlu: neden atlanıyor? (ör. satış HAP dışında bitti)');
    yeni = { asama: hedef, durum: 'sirada', masa: DURAKLAR[hedef].masa || onceki.masa };
    ek = { ...duraktanCikisAlanlari(onceki.asama), ...duragaGirisAlanlari(hedef, simdi) };
    etiket = `İleri atlandı: ${DURAKLAR[onceki.asama].ad} → ${DURAKLAR[hedef].ad}`;
  } else {
    const cikis = CIKISLAR[onceki.asama][islem];
    if (cikis.notZorunlu && !temizNot) throw new Error(`Not zorunlu: ${cikis.notIpucu || cikis.etiket}`);
    etiket = cikis.etiket;
    if (cikis.sonuc) {
      sonuc = cikis.sonuc;
      yeni = { asama: SONUC_DURAGI, durum: 'tamamlandi', masa: onceki.masa };
      ek = { ...duraktanCikisAlanlari(onceki.asama), sonuc };
    } else if (cikis.hedef === onceki.asama) {
      // Aynı durakta yeni tur (ör. Kurulum: düzeltme gerekiyor).
      yeni.durum = 'sirada';
      ek = { duzeltmeTuru: (Number(kayit.duzeltmeTuru) || 0) + 1 };
      etiket = `${cikis.etiket} (${ek.duzeltmeTuru}. tur)`;
    } else {
      const hedef = cikis.hedef;
      yeni = { asama: hedef, durum: 'sirada', masa: DURAKLAR[hedef].masa || onceki.masa };
      ek = { ...duraktanCikisAlanlari(onceki.asama), ...duragaGirisAlanlari(hedef, simdi) };
    }
  }

  const giris = gecmisKaydi({ islem: ISLEM_GECMIS_ADLARI[islem], onceki, yeni, aktor: a, not: temizNot, etiket });
  await wixData.update(
    KOLEKSIYON,
    {
      ...kayit,
      ...ek,
      asama: yeni.asama,
      status: yeni.durum,
      atananMasa: yeni.masa,
      gecmis: [...(Array.isArray(kayit.gecmis) ? kayit.gecmis : []), giris]
    },
    { suppressAuth: true }
  );

  console.log(`Süleyman: ${isId} ${onceki.asama}/${onceki.durum} → ${yeni.asama}/${yeni.durum} (${islem})`);
  return {
    basarili: true,
    degisti: true,
    asama: yeni.asama,
    durum: yeni.durum,
    sonuc,
    etiket,
    bagliIsAcilabilir: islem === 'evet' && Boolean(CIKISLAR[onceki.asama]?.evet?.bagliIsler),
    sonrakiTakip: ek.sonrakiTakip
  };
}

// --- Kayıt düzenleme ---
//
// Aşama/Durum'u DEĞİŞTİRMEZ; yalnızca izin verilen bilgi alanlarını
// (açıklama, bitiş tarihi, ...) günceller ve geçmişe "kayit_guncellendi"
// olarak ekler. Hangi alanların düzenlenebileceğine çağıran (İş Girişi)
// karar verir; Süleyman yalnızca yaşam döngüsü alanlarına dokunulmadığını
// ve işin açık olduğunu kontrol eder.
const KORUNAN_ALANLAR = ['_id', 'isId', 'kategori', 'source', 'tarih', 'bagliIs', ...YASAM_DONGUSU_ALANLARI];

export async function kayitDuzenle(isId, alanlar, aktor, not) {
  const a = aktorKontrol(aktor);
  if (a.tur !== 'insan') throw new Error('Süleyman: kaydı yalnızca insan düzenleyebilir.');
  const yasak = Object.keys(alanlar || {}).filter((k) => KORUNAN_ALANLAR.includes(k));
  if (yasak.length) throw new Error(`Süleyman: bu alanlar düzenlenemez: ${yasak.join(', ')}`);

  const kayit = await kayitBul(isId);
  const durum = mevcutDurum(kayit);
  if (durum.durum === 'tamamlandi' || durum.durum === 'iptal') {
    throw new Error(`${isId} kapanmış bir iş; düzenlenemez.`);
  }

  const giris = gecmisKaydi({ islem: 'kayit_guncellendi', onceki: durum, yeni: durum, aktor: a, not });
  await wixData.update(
    KOLEKSIYON,
    { ...kayit, ...alanlar, gecmis: [...(Array.isArray(kayit.gecmis) ? kayit.gecmis : []), giris] },
    { suppressAuth: true }
  );
  console.log(`Süleyman: ${isId} düzenlendi (${Object.keys(alanlar || {}).join(', ') || 'yalnızca bağlam'})`);
  return { basarili: true, degisti: true };
}

// --- Talep bekleniyor: zaman aşımı (sistem) ---
//
// KN işi "Talep bekleniyor"a girdiği günden itibaren TALEP_BEKLEME_GUN gün
// içinde kişi rumuzuyla yazmazsa iş Sonuç'ta "talep gelmedi" koduyla kapanır.
// Rotadaki tek otomatik karar (2026-10-23 kararı). jobs.config günde bir
// kez çağırır; elle de çağrılabilir. Tekrar çağrılması güvenlidir.

// İşin "Talep bekleniyor"a girdiği gün ('YYYY-MM-DD'): geçmişteki son giriş.
export function talepBaslangici(kayit) {
  const gecmis = Array.isArray(kayit.gecmis) ? kayit.gecmis : [];
  for (let i = gecmis.length - 1; i >= 0; i--) {
    const g = gecmis[i];
    if (g && g.yeni && g.yeni.asama === TALEP_DURAGI && (!g.onceki || g.onceki.asama !== TALEP_DURAGI)) {
      const d = new Date(g.tarih);
      if (!isNaN(d)) return gunTR(d);
    }
  }
  return gunMetni(kayit.tarih || kayit._createdDate);
}

// Kalan gün (0 = bugün kapanacak). Başlangıç bilinmiyorsa null.
export function talepKalanGun(kayit, simdi = new Date()) {
  const bas = talepBaslangici(kayit);
  if (!bas) return null;
  return TALEP_BEKLEME_GUN - gunArasi(bas, gunTR(simdi));
}

export async function talepSuresiDolanlariKapat(simdi = new Date()) {
  const sonuc = await wixData
    .query(KOLEKSIYON)
    .eq('asama', TALEP_DURAGI)
    .eq('status', 'sirada')
    .limit(1000)
    .find({ suppressAuth: true });

  const aktor = { tur: 'sistem', kim: 'Süleyman (zaman aşımı)' };
  const kapatilan = [];
  for (const kayit of sonuc.items) {
    const kalan = talepKalanGun(kayit, simdi);
    if (kalan === null || kalan > 0) continue;
    const onceki = mevcutDurum(kayit);
    const yeni = { asama: SONUC_DURAGI, durum: 'tamamlandi', masa: onceki.masa };
    const giris = gecmisKaydi({
      islem: 'talep_zaman_asimi', onceki, yeni, aktor,
      not: `${TALEP_BEKLEME_GUN} gün içinde kişi rumuzuyla yazmadı.`,
      etiket: `${SONUCLAR.talep_gelmedi} (${TALEP_BEKLEME_GUN} gün)`
    });
    try {
      await wixData.update(
        KOLEKSIYON,
        {
          ...kayit,
          asama: yeni.asama,
          status: yeni.durum,
          atananMasa: yeni.masa,
          sonuc: 'talep_gelmedi',
          gecmis: [...(Array.isArray(kayit.gecmis) ? kayit.gecmis : []), giris]
        },
        { suppressAuth: true }
      );
      kapatilan.push(kayit.isId);
    } catch (hata) {
      console.error(`Süleyman: ${kayit.isId} zaman aşımıyla kapatılamadı:`, hata);
    }
  }
  if (kapatilan.length) console.log(`Süleyman: talep gelmedi, kapatılan işler: ${kapatilan.join(', ')}`);
  return { kapatilan };
}

// --- KVKK: "Talep gelmedi" işlerinin form cevaplarını silme ---
//
// Kişi bize hiç yazmadıysa form cevaplarına ihtiyaç kalmaz (2026-10-24
// kararı). Kapanıştan CEVAP_SAKLAMA_GUN gün sonra İş Bağlamı (form
// cevapları + YZ analizi) silinir; İş Kaydı (rumuz, geçmiş) sayım için kalır
// (avukata sorulacak). Geçmişe "form_cevaplari_silindi" yazılır.
export const CEVAP_SAKLAMA_GUN = 30;

function kapanisGunu(kayit) {
  const gecmis = Array.isArray(kayit.gecmis) ? kayit.gecmis : [];
  const g = [...gecmis].reverse().find((x) => x && x.islem === 'talep_zaman_asimi');
  if (!g) return null;
  const d = new Date(g.tarih);
  return isNaN(d) ? null : gunTR(d);
}

export async function talepGelmeyenCevaplariSil(simdi = new Date()) {
  const sonuc = await wixData
    .query(KOLEKSIYON)
    .eq('asama', SONUC_DURAGI)
    .eq('sonuc', 'talep_gelmedi')
    .limit(1000)
    .find({ suppressAuth: true });

  const bugun = gunTR(simdi);
  const silinen = [];
  for (const kayit of sonuc.items) {
    const gecmis = Array.isArray(kayit.gecmis) ? kayit.gecmis : [];
    if (gecmis.some((x) => x && x.islem === 'form_cevaplari_silindi')) continue;
    const kapanis = kapanisGunu(kayit);
    if (!kapanis || gunArasi(kapanis, bugun) < CEVAP_SAKLAMA_GUN) continue;
    try {
      const b = await wixData.query('IsBaglamlari').eq('isId', kayit.isId).limit(10).find({ suppressAuth: true });
      for (const x of b.items) await wixData.remove('IsBaglamlari', x._id, { suppressAuth: true });
      const durum = mevcutDurum(kayit);
      const giris = gecmisKaydi({
        islem: 'form_cevaplari_silindi', onceki: durum, yeni: durum,
        aktor: { tur: 'sistem', kim: 'Süleyman (KVKK)' },
        not: `Talep gelmedi; form cevapları ve YZ analizi kapanıştan ${CEVAP_SAKLAMA_GUN} gün sonra silindi.`
      });
      await wixData.update(KOLEKSIYON, { ...kayit, gecmis: [...gecmis, giris] }, { suppressAuth: true });
      silinen.push(kayit.isId);
    } catch (hata) {
      console.error(`Süleyman: ${kayit.isId} form cevapları silinemedi:`, hata);
    }
  }
  if (silinen.length) console.log(`Süleyman: form cevapları silindi: ${silinen.join(', ')}`);
  return { silinen };
}

// Günlük bakım (jobs.config her gün çağırır): önce zaman aşımı, sonra silme.
export async function gunlukBakim() {
  const simdi = new Date();
  const a = await talepSuresiDolanlariKapat(simdi);
  const b = await talepGelmeyenCevaplariSil(simdi);
  return { ...a, ...b };
}

// --- YZ taslağı olayları (istendi / geldi / başarısız) ---
//
// KN işinde YZ, Durum Fotoğrafı taslağını kişi rumuzuyla yazınca hazırlar
// (2026-10-26). Eski / yolda kalan kayıtlar için Giriş'te de geçerlidir.
// Olaylar işin durumunu DEĞİŞTİRMEZ; yalnızca geçmişe yazılır:
//   yz_istendi    taslak Netlify'dan istendi
//   yz_geldi      taslak geldi (Giriş dışında; Giriş'te geçiş zaten yazılır)
//   yz_basarisiz  YZ tekrar denemelerden sonra da başarısız (neden ile)
const YZ_DURAKLARI = [GIRIS_DURAGI, ILK_DURAK];
const YZ_OLAYLARI = {
  yz_istendi: 'YZ taslağı istendi',
  yz_geldi: 'YZ taslağı geldi',
  yz_basarisiz: 'YZ analizi başarısız'
};

export async function yzOlayiKaydet(isId, islem, not, aktor = { tur: 'yz', kim: 'Memur YZ' }) {
  if (!YZ_OLAYLARI[islem]) throw new Error(`Süleyman: bilinmeyen YZ olayı: ${islem}`);
  const a = aktorKontrol(aktor);
  const kayit = await kayitBul(isId);
  const durum = mevcutDurum(kayit);
  if (!YZ_DURAKLARI.includes(durum.asama)) {
    return { basarili: false, degisti: false, sebep: 'yz_duragi_degil', mesaj: `${isId} YZ taslağı beklenen bir durakta değil.` };
  }
  const temiz = not ? String(not).replace(/\s+/g, ' ').trim().slice(0, 240) : null;
  const gecmis = Array.isArray(kayit.gecmis) ? kayit.gecmis : [];
  const son = gecmis[gecmis.length - 1];
  if (son && son.islem === islem && (son.not || null) === temiz) {
    return { basarili: true, degisti: false, sebep: 'zaten_kayitli' };
  }
  const giris = gecmisKaydi({ islem, onceki: durum, yeni: durum, aktor: a, not: temiz, etiket: YZ_OLAYLARI[islem] });
  await wixData.update(KOLEKSIYON, { ...kayit, gecmis: [...gecmis, giris] }, { suppressAuth: true });
  console.log(`Süleyman: ${isId} ${YZ_OLAYLARI[islem]}${temiz ? ': ' + temiz : ''}`);
  return { basarili: true, degisti: true };
}

export function yzHatasiKaydet(isId, neden) {
  return yzOlayiKaydet(isId, 'yz_basarisiz', neden || 'bilinmiyor');
}

// YZ'nin son durumu (Giriş ya da Durum Fotoğrafı'nda): son olay hata ise
// nedeni döner; sonrasında yeni istek ya da taslak geldiyse null.
export function sonYzHatasi(kayit) {
  if (!YZ_DURAKLARI.includes(mevcutDurum(kayit).asama)) return null;
  const gecmis = Array.isArray(kayit.gecmis) ? kayit.gecmis : [];
  for (let i = gecmis.length - 1; i >= 0; i--) {
    const g = gecmis[i];
    if (!g) continue;
    if (g.islem === 'yz_basarisiz') return g.not || 'bilinmiyor';
    if (['yz_istendi', 'yz_geldi', 'yz_hazirlik_tamamlandi'].includes(g.islem)) return null;
  }
  return null;
}
