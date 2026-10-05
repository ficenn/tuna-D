// İş Girişi (Work Entry) — insanın işi HAP'e soktuğu tek yol.
//
// Görevi: kaynağı ne olursa olsun (telefon, WhatsApp, yüz yüze, ...) bir işi
// yeterli bağlamla İş Kaydı olarak sisteme almak. İşi DEĞERLENDİRMEZ ve
// YÖNLENDİRMEZ; o iş Aşama 2'den sonra başlar.
//
// Tek akışta yapılanlar:
//   1. Müşteri: mevcut müşteri seçilir (yeni bilgi varsa güncellenir) veya
//      yeni müşteri kaydı açılır. Ayrı bir "müşteri oluştur" adımı yok.
//   2. İş Kaydı (IsKayitlari): kategori, açıklama, müşteri bağlantısı,
//      termin, aciliyet, kaynak + Aşama 1 / devam_ediyor + geçmiş.
//   3. İş Bağlamı (IsBaglamlari): kapsam ve giriş notu (aynı isId).
//   4. Süleyman: insanın girdiği işte girişin kendisi hazırlıktır →
//      Aşama 1 tamamlanır → Aşama 2 / sırada.
//
// Kategoriler:
//   A Ticari / Ücretli İş: müşteri + 7 aşamalı yaşam döngüsü (yukarıdaki akış).
//   B Pazarlama: Pazarlama masasının kendi işi (İçerik / Görünürlük). Müşteri
//     yok. Kısa yol: Yapılacak → Yapıldı.
//   C Yapılacaklar: işletmenin kendi hatırlatmaları. Müşteri yok.
//     Kısa yol: Yapılacak → Yapıldı. Tekrar etmez.
// B ve C'de kaynak her zaman "İç ihtiyaç"tır; formda sorulmaz.

import wixData from 'wix-data';
import { isKaydiEkleYenidenDenemeli } from './isIdCounter';
import { ilkKayitAlanlari, kisaYolIlkKayitAlanlari, gecisYap, kayitDuzenle } from './suleyman';

const MUSTERI_KOLEKSIYONU = 'Musteriler';
const BAGLAM_KOLEKSIYONU = 'IsBaglamlari';

// --- Sabit listeler (MVP: kodda tutulur) ---

export const KATEGORILER = {
  A: 'A – Ticari / Ücretli İş',
  B: 'B – Pazarlama',
  C: 'C – Yapılacaklar'
};

// Kısa yoldan (Yapılacak → Yapıldı) giden kategoriler.
export const KISA_YOL_KATEGORILERI = ['B', 'C'];

// B işleri Pazarlama masasının kendi işidir.
const KATEGORI_MASASI = { B: 'pazarlama' };

export const MODULLER = {
  icerik: 'İçerik',
  gorunurluk: 'Görünürlük'
};

// İşin geldiği kanal. Otomatik kanallar (KN) kendi değerini yazar;
// eski "Webhook" / "Panel" değerleri olduğu gibi bırakılır.
export const KAYNAKLAR = {
  telefon: 'Telefon',
  whatsapp: 'WhatsApp',
  eposta: 'E-posta',
  yuz_yuze: 'Yüz yüze',
  web_form: 'Web / form',
  ic_ihtiyac: 'İç ihtiyaç',
  diger: 'Diğer'
};

export const ACILIYETLER = {
  normal: 'Normal',
  acil: 'Acil'
};

// Formdan gelebilecek müşteri alanları ve etiketleri (notes hariç).
export const MUSTERI_ALANLARI = {
  name: 'Ad / Unvan',
  contactName: 'İrtibat Kişisi',
  email: 'E-posta',
  phone: 'Telefon',
  address: 'Adres',
  taxNumber: 'Vergi No',
  taxOffice: 'Vergi Dairesi'
};
// Not: Musteriler'deki invoiceInfo (Fatura Bilgileri) alanı formdan
// kaldırıldı (gereksiz bulundu); koleksiyonda duruyor, kod ona dokunmuyor.

const UZUNLUK = { kisa: 300, uzun: 5000 };

// --- Yardımcılar ---

function metin(deger, sinir, alanAdi) {
  const s = String(deger ?? '').trim();
  if (s.length > sinir) throw new Error(`${alanAdi} çok uzun (en fazla ${sinir} karakter).`);
  return s;
}

function adAnahtari(ad) {
  return String(ad || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function terminKontrol(deger) {
  const s = String(deger ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Bitiş tarihi geçersiz (YYYY-AA-GG olmalı).');
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw new Error('Bitiş tarihi geçersiz.');
  }
  return s; // Wix "Date" alanı: 'YYYY-MM-DD' metni
}

// Formdan gelen müşteri bilgisini temizler; boş alanları atar.
function musteriBilgisi(ham) {
  const sonuc = {};
  for (const alan of Object.keys(MUSTERI_ALANLARI)) {
    const sinir = alan === 'address' ? 1000 : UZUNLUK.kisa;
    const s = metin(ham?.[alan], sinir, MUSTERI_ALANLARI[alan]);
    if (s) sonuc[alan] = s;
  }
  if (sonuc.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sonuc.email)) {
    throw new Error('Müşteri e-posta adresi geçersiz.');
  }
  return sonuc;
}

// --- Girdi doğrulama (veritabanına dokunmaz) ---
//
// Beklenen girdi:
// {
//   kategori: 'A',
//   musteri: { id: '<Musteriler _id>' }  veya  { id: null }   (yeni müşteri)
//   musteriBilgileri: { name, contactName, email, phone, address, taxNumber, taxOffice },
//   aciklama, kapsam, notlar,
//   termin: 'YYYY-MM-DD' | '',
//   aciliyet: 'normal' | 'acil',
//   kaynak: 'telefon' | ...
// }
export function girdiyiDogrula(girdi) {
  const g = girdi || {};

  const kategori = String(g.kategori || '').trim();
  if (!KATEGORILER[kategori]) throw new Error('Geçerli bir iş kategorisi seçin.');

  if (KISA_YOL_KATEGORILERI.includes(kategori)) return kisaYolGirdisi(kategori, g);

  const kaynak = String(g.kaynak || '').trim();
  if (!KAYNAKLAR[kaynak]) throw new Error('İşin nereden geldiğini (kaynak) seçin.');

  const aciliyet = String(g.aciliyet || 'normal').trim();
  if (!ACILIYETLER[aciliyet]) throw new Error('Aciliyet geçersiz.');

  const aciklama = metin(g.aciklama, UZUNLUK.uzun, 'Açıklama');
  if (!aciklama) throw new Error('Açıklama zorunlu: iş ne?');

  const musteriId = g.musteri?.id ? String(g.musteri.id).trim() : null;
  const musteriBilgileri = musteriBilgisi(g.musteriBilgileri);
  if (!musteriId && !musteriBilgileri.name) {
    throw new Error('Müşteri seçin ya da yeni müşterinin adını / unvanını yazın.');
  }

  return {
    kategori,
    kaynak,
    aciliyet,
    aciklama,
    kapsam: metin(g.kapsam, UZUNLUK.uzun, 'Kapsam'),
    notlar: metin(g.notlar, UZUNLUK.uzun, 'Notlar'),
    termin: terminKontrol(g.termin),
    musteriId,
    musteriBilgileri
  };
}

// B ve C: müşteri yok, kaynak her zaman iç ihtiyaç.
function kisaYolGirdisi(kategori, g) {
  const aciklama = metin(g.aciklama, UZUNLUK.uzun, 'Açıklama');
  if (!aciklama) throw new Error(kategori === 'C' ? 'Ne yapılacak? Açıklama zorunlu.' : 'Açıklama zorunlu: iş ne?');

  let modul = null;
  if (kategori === 'B') {
    modul = String(g.modul || '').trim();
    if (!MODULLER[modul]) throw new Error('Pazarlama işinin modülünü seçin (İçerik / Görünürlük).');
  }

  const aciliyet = kategori === 'B' ? String(g.aciliyet || 'normal').trim() : 'normal';
  if (!ACILIYETLER[aciliyet]) throw new Error('Aciliyet geçersiz.');

  return {
    kategori,
    kaynak: 'ic_ihtiyac',
    aciliyet,
    aciklama,
    modul,
    kapsam: kategori === 'B' ? metin(g.kapsam, UZUNLUK.uzun, 'Kapsam') : '',
    notlar: metin(g.notlar, UZUNLUK.uzun, 'Notlar'),
    termin: terminKontrol(g.termin),
    kisaYol: true
  };
}

// --- Müşteri ---

export async function musterileriListele() {
  const sonuc = await wixData
    .query(MUSTERI_KOLEKSIYONU)
    .ascending('name')
    .limit(1000)
    .find({ suppressAuth: true });
  return sonuc.items.map((m) => {
    const o = { id: m._id };
    for (const alan of Object.keys(MUSTERI_ALANLARI)) o[alan] = m[alan] || '';
    return o;
  });
}

// Mevcut müşteri: formdaki dolu ve farklı alanlar yazılır. Bir değer asla
// boşaltılmaz. Döner: { musteri, degisiklikler: [{alan, onceki, yeni}] }
async function mevcutMusteriyiGuncelle(musteriId, bilgiler) {
  const musteri = await wixData.get(MUSTERI_KOLEKSIYONU, musteriId, { suppressAuth: true });
  if (!musteri) throw new Error('Seçilen müşteri bulunamadı. Sayfayı yenileyip tekrar deneyin.');

  const degisiklikler = [];
  const guncel = { ...musteri };
  for (const [alan, yeni] of Object.entries(bilgiler)) {
    const onceki = musteri[alan] || '';
    if (yeni && yeni !== onceki) {
      guncel[alan] = yeni;
      degisiklikler.push({ alan, onceki, yeni });
    }
  }

  if (degisiklikler.length) {
    await wixData.update(MUSTERI_KOLEKSIYONU, guncel, { suppressAuth: true });
  }
  return { musteri: guncel, degisiklikler };
}

async function yeniMusteriOlustur(bilgiler) {
  // Aynı adla ikinci kayıt açılmasın: listeden seçilmesi istenir.
  const mevcut = await musterileriListele();
  const anahtar = adAnahtari(bilgiler.name);
  if (mevcut.some((m) => adAnahtari(m.name) === anahtar)) {
    throw new Error(`"${bilgiler.name}" adında bir müşteri zaten var. Listeden seçin.`);
  }
  return wixData.insert(MUSTERI_KOLEKSIYONU, { ...bilgiler }, { suppressAuth: true });
}

// İş Girişi'ndeki "Yeni müşteri" penceresi: müşteriyi hemen kaydeder ve
// listede kullanılacak biçimde döner. Ad / Unvan zorunlu; aynı adla ikinci
// kayıt açılmaz.
export async function musteriKaydet(ham) {
  const bilgiler = musteriBilgisi(ham);
  if (!bilgiler.name) throw new Error('Müşterinin adı / unvanı zorunlu.');
  const m = await yeniMusteriOlustur(bilgiler);
  const o = { id: m._id };
  for (const alan of Object.keys(MUSTERI_ALANLARI)) o[alan] = m[alan] || '';
  return o;
}

// --- Geçmiş notu ---

function girisNotuOlustur(v, musteriAdi, yeniMusteri, degisiklikler) {
  const parcalar = [`Kaynak: ${KAYNAKLAR[v.kaynak]}`];
  parcalar.push(`Müşteri: ${musteriAdi}${yeniMusteri ? ' (yeni kayıt)' : ''}`);
  if (degisiklikler.length) {
    const d = degisiklikler
      .map((x) => `${MUSTERI_ALANLARI[x.alan]}: "${x.onceki || '—'}" → "${x.yeni}"`)
      .join('; ');
    parcalar.push(`Müşteri bilgisi güncellendi: ${d}`);
  }
  return parcalar.join(' | ');
}

// --- Bağlam kaydı (kapsam + giriş notu), tüm kategoriler ---

async function baglamKaydet(isId, v, uyarilar) {
  try {
    await wixData.insert(
      BAGLAM_KOLEKSIYONU,
      {
        isId,
        title: v.aciklama.slice(0, 120),
        kapsam: v.kapsam || null,
        girisNotu: v.notlar || null,
        context: null,
        summary: null,
        checklist: []
      },
      { suppressAuth: true }
    );
  } catch (hata) {
    console.error(`isGirisi: ${isId} bağlam kaydı oluşturulamadı:`, hata);
    uyarilar.push('İş kaydı oluştu ama kapsam/not kaydedilemedi.');
  }
}

// --- B / C: kısa yol ---

async function kisaYolKaydet(v, aktor) {
  const uyarilar = [];
  const masa = KATEGORI_MASASI[v.kategori] || null;
  const not = [`Kategori: ${KATEGORILER[v.kategori]}`, v.modul ? `Modül: ${MODULLER[v.modul]}` : null]
    .filter(Boolean).join(' | ');

  const { kayit, isId } = await isKaydiEkleYenidenDenemeli({
    tarih: new Date(),
    source: v.kaynak,
    kategori: v.kategori,
    modul: v.modul,
    description: v.aciklama,
    termin: v.termin,
    aciliyet: v.aciliyet,
    atananMasa: masa,
    ...kisaYolIlkKayitAlanlari(aktor, not, masa)
  });
  console.log(`isGirisi: ${v.kategori} işi oluşturuldu: ${isId}`);

  await baglamKaydet(isId, v, uyarilar);

  return {
    isId,
    kayitId: kayit._id,
    musteriId: null,
    yeniMusteri: false,
    asama: 'takip',
    durum: 'sirada',
    uyarilar
  };
}

// --- Ana fonksiyon ---
//
// Döner: { isId, kayitId, musteriId, yeniMusteri, asama, durum, uyarilar: [] }
// Doğrulama hatası veya İş Kaydı oluşturulamazsa hata fırlatır. İş Kaydı
// oluştuktan sonraki adımlar (bağlam, Aşama 2) başarısız olursa iş kaybolmaz;
// uyarı olarak döner.
export async function isGirisiKaydet(girdi, aktor) {
  const v = girdiyiDogrula(girdi);
  if (v.kisaYol) return kisaYolKaydet(v, aktor);
  const uyarilar = [];

  // 1. Müşteri
  let musteri;
  let degisiklikler = [];
  const yeniMusteri = !v.musteriId;
  if (yeniMusteri) {
    musteri = await yeniMusteriOlustur(v.musteriBilgileri);
  } else {
    ({ musteri, degisiklikler } = await mevcutMusteriyiGuncelle(v.musteriId, v.musteriBilgileri));
  }

  // 2. İş Kaydı (Aşama 1 / devam_ediyor)
  let isId;
  let kayit;
  try {
    ({ kayit, isId } = await isKaydiEkleYenidenDenemeli({
      tarih: new Date(),
      source: v.kaynak,
      kategori: v.kategori,
      description: v.aciklama,
      musteri: musteri._id,
      termin: v.termin,
      aciliyet: v.aciliyet,
      ...ilkKayitAlanlari(aktor, girisNotuOlustur(v, musteri.name, yeniMusteri, degisiklikler))
    }));
  } catch (hata) {
    // Yeni açılan müşteri boşta kalmasın.
    if (yeniMusteri) {
      try {
        await wixData.remove(MUSTERI_KOLEKSIYONU, musteri._id, { suppressAuth: true });
      } catch (e) {
        console.error('isGirisi: yeni müşteri geri alınamadı:', musteri._id, e);
      }
    }
    throw hata;
  }
  console.log(`isGirisi: İş Kaydı oluşturuldu: ${isId} (müşteri ${musteri._id})`);

  // 3. İş Bağlamı (kapsam + giriş notu)
  await baglamKaydet(isId, v, uyarilar);

  // 4. Aşama 1 → Aşama 2 / sırada
  let asama = '1_giris';
  let durum = 'devam_ediyor';
  try {
    const sonuc = await gecisYap(isId, 'giris_tamamlandi', aktor);
    if (sonuc.basarili) {
      asama = sonuc.asama;
      durum = sonuc.durum;
    } else {
      uyarilar.push(sonuc.mesaj);
    }
  } catch (hata) {
    console.error(`isGirisi: ${isId} Aşama 1 tamamlanamadı:`, hata);
    uyarilar.push('İş kaydı oluştu ama Aşama 2\'ye geçirilemedi (Aşama 1\'de kaldı).');
  }

  return {
    isId,
    kayitId: kayit._id,
    musteriId: musteri._id,
    yeniMusteri,
    asama,
    durum,
    uyarilar
  };
}

// --- Düzenleme (Kontrol Paneli → İş Detayı → Düzenle) ---
//
// Açık bir A/B/C işinin girişte yazılan bilgileri düzeltilebilir:
//   A: müşteri, açıklama, kapsam, not, bitiş tarihi, aciliyet
//   B: modül, açıklama, kapsam, not, bitiş tarihi, aciliyet
//   C: açıklama, not, tarih
// Kategori, kaynak, İş ID ve aşama/durum değişmez. Her düzenleme geçmişe
// ne değiştiği yazılarak eklenir (Süleyman). KN başvuruları düzenlenmez.
const DUZENLEME_ETIKETLERI = {
  description: 'Açıklama', termin: 'Bitiş tarihi', aciliyet: 'Aciliyet', modul: 'Modül',
  musteri: 'Müşteri', kapsam: 'Kapsam', girisNotu: 'Not'
};

function kisalt(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '—';
  return t.length > 60 ? t.slice(0, 57) + '…' : t;
}

export async function isGuncelle(isId, girdi, aktor) {
  const id = String(isId || '').trim();
  if (!id) throw new Error('İş ID eksik.');
  const g = girdi || {};

  const kayitSonuc = await wixData.query('IsKayitlari').eq('isId', id).limit(1).find({ suppressAuth: true });
  if (!kayitSonuc.items.length) throw new Error(`İş bulunamadı: ${id}`);
  const k = kayitSonuc.items[0];
  const kategori = k.kategori;
  if (!KATEGORILER[kategori]) throw new Error('Bu iş buradan düzenlenemez.');

  const aciklama = metin(g.aciklama, UZUNLUK.uzun, 'Açıklama');
  if (!aciklama) throw new Error('Açıklama boş bırakılamaz.');

  const yeniKayit = { description: aciklama, termin: terminKontrol(g.termin) };
  if (kategori === 'A' || kategori === 'B') {
    const aciliyet = String(g.aciliyet || 'normal').trim();
    if (!ACILIYETLER[aciliyet]) throw new Error('Aciliyet geçersiz.');
    yeniKayit.aciliyet = aciliyet;
  }
  if (kategori === 'B') {
    const modul = String(g.modul || '').trim();
    if (!MODULLER[modul]) throw new Error('Modülü seçin (İçerik / Görünürlük).');
    yeniKayit.modul = modul;
  }
  const musteriAdlari = {};
  if (kategori === 'A') {
    const musteriId = String(g.musteriId || '').trim();
    if (!musteriId) throw new Error('Müşteri seçin.');
    if (musteriId !== k.musteri) {
      const yeni = await wixData.get(MUSTERI_KOLEKSIYONU, musteriId, { suppressAuth: true });
      if (!yeni) throw new Error('Seçilen müşteri bulunamadı.');
      musteriAdlari[musteriId] = yeni.name;
      if (k.musteri) {
        const eski = await wixData.get(MUSTERI_KOLEKSIYONU, k.musteri, { suppressAuth: true });
        if (eski) musteriAdlari[k.musteri] = eski.name;
      }
    }
    yeniKayit.musteri = musteriId;
  }

  const baglamSonuc = await wixData.query(BAGLAM_KOLEKSIYONU).eq('isId', id).limit(1).find({ suppressAuth: true });
  const b = baglamSonuc.items[0] || null;
  const yeniBaglam = { girisNotu: metin(g.notlar, UZUNLUK.uzun, 'Not') || null };
  if (kategori !== 'C') yeniBaglam.kapsam = metin(g.kapsam, UZUNLUK.uzun, 'Kapsam') || null;

  // Değişenleri bul
  const kayitDegisen = {};
  const notlar = [];
  for (const [alan, deger] of Object.entries(yeniKayit)) {
    const onceki = k[alan] ?? null;
    const oncekiMetin = alan === 'termin' && onceki && typeof onceki !== 'string'
      ? new Date(onceki).toISOString().slice(0, 10) : onceki;
    if ((oncekiMetin || null) !== (deger || null)) {
      kayitDegisen[alan] = deger;
      let o = oncekiMetin, y = deger;
      if (alan === 'aciliyet') { o = ACILIYETLER[o] || o; y = ACILIYETLER[y]; }
      if (alan === 'modul') { o = MODULLER[o] || o; y = MODULLER[y]; }
      if (alan === 'musteri') { o = musteriAdlari[o] || o; y = musteriAdlari[y] || y; }
      notlar.push(`${DUZENLEME_ETIKETLERI[alan]}: "${kisalt(o)}" → "${kisalt(y)}"`);
    }
  }
  const baglamDegisen = {};
  for (const [alan, deger] of Object.entries(yeniBaglam)) {
    if (((b && b[alan]) || null) !== (deger || null)) {
      baglamDegisen[alan] = deger;
      notlar.push(`${DUZENLEME_ETIKETLERI[alan]}: "${kisalt(b && b[alan])}" → "${kisalt(deger)}"`);
    }
  }

  if (!notlar.length) return { degisti: false, uyarilar: [] };

  await kayitDuzenle(id, kayitDegisen, aktor, notlar.join(' | '));

  const uyarilar = [];
  if (Object.keys(baglamDegisen).length) {
    try {
      if (b) {
        await wixData.update(BAGLAM_KOLEKSIYONU, { ...b, ...baglamDegisen }, { suppressAuth: true });
      } else {
        await wixData.insert(BAGLAM_KOLEKSIYONU,
          { isId: id, title: aciklama.slice(0, 120), kapsam: null, girisNotu: null, ...baglamDegisen, context: null, summary: null, checklist: [] },
          { suppressAuth: true });
      }
    } catch (hata) {
      console.error(`isGirisi: ${id} kapsam/not güncellenemedi:`, hata);
      uyarilar.push('Kapsam/not kaydedilemedi; diğer değişiklikler kaydedildi.');
    }
  }
  return { degisti: true, uyarilar };
}
