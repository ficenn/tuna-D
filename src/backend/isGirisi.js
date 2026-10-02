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
// Şimdilik yalnızca kategori A (Ticari / Ücretli İş) var. Yeni kategori
// eklemek için KATEGORILER'e ekleyin; yaşam döngüsü kategoriden bağımsızdır.

import wixData from 'wix-data';
import { isKaydiEkleYenidenDenemeli } from './isIdCounter';
import { ilkKayitAlanlari, gecisYap } from './suleyman';

const MUSTERI_KOLEKSIYONU = 'Musteriler';
const BAGLAM_KOLEKSIYONU = 'IsBaglamlari';

// --- Sabit listeler (MVP: kodda tutulur) ---

export const KATEGORILER = {
  A: 'A – Ticari / Ücretli İş'
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
  taxOffice: 'Vergi Dairesi',
  invoiceInfo: 'Fatura Bilgileri'
};

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Termin tarihi geçersiz (YYYY-AA-GG olmalı).');
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) {
    throw new Error('Termin tarihi geçersiz.');
  }
  return s; // Wix "Date" alanı: 'YYYY-MM-DD' metni
}

// Formdan gelen müşteri bilgisini temizler; boş alanları atar.
function musteriBilgisi(ham) {
  const sonuc = {};
  for (const alan of Object.keys(MUSTERI_ALANLARI)) {
    const sinir = alan === 'address' || alan === 'invoiceInfo' ? 1000 : UZUNLUK.kisa;
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
//   musteriBilgileri: { name, contactName, email, phone, address, taxNumber, taxOffice, invoiceInfo },
//   aciklama, kapsam, notlar,
//   termin: 'YYYY-MM-DD' | '',
//   aciliyet: 'normal' | 'acil',
//   kaynak: 'telefon' | ...
// }
export function girdiyiDogrula(girdi) {
  const g = girdi || {};

  const kategori = String(g.kategori || '').trim();
  if (!KATEGORILER[kategori]) throw new Error('Geçerli bir iş kategorisi seçin.');

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

// --- Ana fonksiyon ---
//
// Döner: { isId, kayitId, musteriId, yeniMusteri, asama, durum, uyarilar: [] }
// Doğrulama hatası veya İş Kaydı oluşturulamazsa hata fırlatır. İş Kaydı
// oluştuktan sonraki adımlar (bağlam, Aşama 2) başarısız olursa iş kaybolmaz;
// uyarı olarak döner.
export async function isGirisiKaydet(girdi, aktor) {
  const v = girdiyiDogrula(girdi);
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
