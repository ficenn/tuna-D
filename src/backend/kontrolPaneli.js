// Kontrol Paneli — okuma katmanı (MVP).
//
// Görevi: Kontrol Paneli'nin göstereceği veriyi hazırlamak. Hiçbir şeyi
// DEĞİŞTİRMEZ; işi ilerleten tek yer Süleyman'dır (suleyman.js).
//
// Panelde yalnızca yaşam döngüsü dönemindeki işler görünür (asama alanı
// olanlar, 000035 ve sonrası). Daha eski test kayıtlarının asama'sı yok;
// onlar panele girmez ve "takıldı" uyarısı üretmez.

import wixData from 'wix-data';
import { ASAMALAR, DURUMLAR } from './suleyman';
import { KAYNAKLAR, ACILIYETLER, KATEGORILER } from './isGirisi';

const IS = 'IsKayitlari';
const BAGLAM = 'IsBaglamlari';
const MUSTERI = 'Musteriler';

// Uyarı eşikleri (dakika / gün). Pilotta ayarlanabilir.
export const ESIKLER = {
  yzBeklemeDakika: 15,      // KN işi Aşama 1'de bu kadar kalırsa: YZ gelmedi
  terminYakinGun: 3,        // Bitiş tarihine bu kadar gün (veya az) kaldıysa uyar
  siradaBeklemeGun: 3       // Aşama 2 / sırada bu kadar gündür bekliyorsa uyar
};

const KAPALI_DURUMLAR = ['tamamlandi', 'iptal'];

const ISLEM_ETIKETLERI = {
  kayit_olusturuldu: 'Kayıt oluşturuldu',
  yz_hazirlik_tamamlandi: 'YZ analizi geldi, Aşama 1 tamamlandı',
  hazirlik_yz_olmadan_tamamlandi: 'Aşama 1 YZ analizi olmadan tamamlandı',
  giris_tamamlandi: 'Giriş tamamlandı'
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

// 'YYYY-MM-DD' → 'GG.AA.YYYY' (uyarı metinleri için)
function tarihTR(t) {
  const [y, m, d] = String(t).split('-');
  return `${d}.${m}.${y}`;
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
  const asama = ASAMALAR[k.asama] ? k.asama : '1_giris';
  const durum = DURUMLAR[k.status] ? k.status : 'devam_ediyor';
  const musteriAdi = k.musteri ? musteriler[k.musteri] || '(müşteri bulunamadı)' : null;
  return {
    isId: k.isId,
    baslik: baslik(k),
    musteri: musteriAdi || (k.source === 'Webhook' ? (k.isletmeAdi || k.isim || '—') : '—'),
    kaynak: kaynakEtiketi(k.source),
    kategori: k.kategori ? (KATEGORILER[k.kategori] || k.kategori) : null,
    asama,
    asamaEtiketi: ASAMALAR[asama],
    asamaNo: Number(asama.split('_')[0]),
    durum,
    durumEtiketi: DURUMLAR[durum],
    aciliyet: k.aciliyet || null,
    aciliyetEtiketi: k.aciliyet ? (ACILIYETLER[k.aciliyet] || k.aciliyet) : null,
    termin: terminMetni(k.termin),
    olusturma: tarihDegeri(k.tarih || k._createdDate)?.toISOString() || null,
    acik: !KAPALI_DURUMLAR.includes(durum)
  };
}

// --- Uyarılar ("Buraya Dikkat") ---

export function uyarilariHesapla(isler, simdi = new Date()) {
  const bugun = bugunTR(simdi);
  const uyarilar = [];

  for (const i of isler) {
    if (!i.acik) continue;

    if (i.asama === '1_giris' && i.durum === 'devam_ediyor' && i.olusturma) {
      const dakika = (simdi - new Date(i.olusturma)) / 60000;
      if (dakika >= ESIKLER.yzBeklemeDakika) {
        uyarilar.push({
          tur: 'hata', isId: i.isId, sira: 1,
          baslik: `${i.isId}: YZ analizi gelmedi`,
          aciklama: `${Math.floor(dakika)} dakikadır Aşama 1'de. Detaydan YZ'siz tamamlayabilirsiniz.`
        });
      }
    }

    if (i.termin) {
      const kalan = gunFarki(i.termin, bugun);
      if (kalan < 0) {
        uyarilar.push({ tur: 'hata', isId: i.isId, sira: 2,
          baslik: `${i.isId}: bitiş tarihi geçti`, aciklama: `${i.baslik} — bitiş tarihi ${tarihTR(i.termin)} (${-kalan} gün önce).` });
      } else if (kalan <= ESIKLER.terminYakinGun) {
        uyarilar.push({ tur: 'uyari', isId: i.isId, sira: 3,
          baslik: `${i.isId}: ${kalan === 0 ? 'bitiş tarihi bugün' : 'bitiş tarihine ' + kalan + ' gün var'}`, aciklama: `${i.baslik} — bitiş tarihi ${tarihTR(i.termin)}.` });
      }
    }

    if (i.aciliyet === 'acil' && i.durum === 'sirada') {
      uyarilar.push({ tur: 'uyari', isId: i.isId, sira: 4,
        baslik: `${i.isId}: acil iş sırada bekliyor`, aciklama: `${i.baslik} — ${i.asamaEtiketi}.` });
    }

    if (i.asama === '2_degerlendirme' && i.durum === 'sirada' && i.olusturma) {
      const gun = (simdi - new Date(i.olusturma)) / 86400000;
      if (gun >= ESIKLER.siradaBeklemeGun) {
        uyarilar.push({ tur: 'bilgi', isId: i.isId, sira: 5,
          baslik: `${i.isId}: ${Math.floor(gun)} gündür değerlendirme bekliyor`, aciklama: i.baslik });
      }
    }
  }

  return uyarilar.sort((a, b) => a.sira - b.sira || String(a.isId).localeCompare(String(b.isId)));
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

  const sayilar = { toplam: isler.length, acik: 0 };
  for (const d of Object.keys(DURUMLAR)) sayilar[d] = 0;
  for (const i of isler) {
    sayilar[i.durum] = (sayilar[i.durum] || 0) + 1;
    if (i.acik) sayilar.acik += 1;
  }

  return {
    olusturulma: simdi.toISOString(),
    bugun: bugunTR(simdi),
    durumlar: DURUMLAR,
    asamalar: ASAMALAR,
    sayilar,
    uyarilar: uyarilariHesapla(isler, simdi),
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
    onceki: g.onceki ? `${ASAMALAR[g.onceki.asama] || g.onceki.asama} / ${DURUMLAR[g.onceki.durum] || g.onceki.durum}` : null,
    yeni: g.yeni ? `${ASAMALAR[g.yeni.asama] || g.yeni.asama} / ${DURUMLAR[g.yeni.durum] || g.yeni.durum}` : null,
    kim: g.aktor ? `${g.aktor.kim}${g.aktor.tur ? ' (' + g.aktor.tur + ')' : ''}` : '',
    not: g.not || null
  }));

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
    // Şu an mümkün olan insan işlemleri (Süleyman'ın izin verdiği):
    islemler: ozet.asama === '1_giris' && ozet.durum === 'devam_ediyor' ? ['yzsizTamamla'] : []
  };
}
