// Kontrol Paneli — okuma katmanı (MVP).
//
// Görevi: Kontrol Paneli'nin göstereceği veriyi hazırlamak. Hiçbir şeyi
// DEĞİŞTİRMEZ; işi ilerleten tek yer Süleyman'dır (suleyman.js).
//
// Panelde yalnızca yaşam döngüsü dönemindeki işler görünür (asama alanı
// olanlar, 000035 ve sonrası). Daha eski test kayıtlarının asama'sı yok;
// onlar panele girmez.
//
// Kategoriler aynı listede görünür:
//   A Ticari (duraklı yolculuk, rota.js), B Pazarlama, C Yapılacaklar ve
//   D Ar-Ge (kısa yol: Yapılacak → Yapıldı).

import wixData from 'wix-data';
import {
  DURUMLAR, KISA_YOL_ASAMASI, mevcutDurum, asamaEtiketi, durumEtiketi, sonucEtiketi,
  izinliDurakIslemleri, gunTR, ileriDuraklar, talepKalanGun, sonYzHatasi
} from './suleyman';
import {
  DURAKLAR, CIKISLAR, GIRIS_DURAGI, SONUC_DURAGI, TAKIP_DURAGI, TAKIP_PLANI_GUN,
  TALEP_DURAGI, TALEP_BEKLEME_GUN
} from './rota';
import { KAYNAKLAR, ACILIYETLER, KATEGORILER, MODULLER } from './isGirisi';

const IS = 'IsKayitlari';
const BAGLAM = 'IsBaglamlari';
const MUSTERI = 'Musteriler';
const MASA = 'Masalar';

// Eşikler. Pilotta ayarlanabilir.
export const ESIKLER = {
  yzBeklemeDakika: 15,   // KN işi Giriş'te bu kadar kalırsa: YZ gelmedi (Bugün kartına düşer)
  yaklasiyorGun: 7       // Bitiş tarihine 1..N gün kalan işler "Yaklaşıyor" kartında
};

const KAPALI_DURUMLAR = ['tamamlandi', 'iptal'];

const KATEGORI_KISA = { A: 'Ticari', B: 'Pazarlama', C: 'Yapılacaklar', D: 'Ar-Ge' };

const ISLEM_ETIKETLERI = {
  kayit_olusturuldu: 'Kayıt oluşturuldu',
  yz_hazirlik_tamamlandi: 'YZ analizi geldi, Giriş tamamlandı',
  hazirlik_yz_olmadan_tamamlandi: 'Giriş YZ analizi olmadan tamamlandı',
  giris_tamamlandi: 'Giriş tamamlandı',
  takip_tamamlandi: 'Yapıldı olarak işaretlendi',
  kayit_guncellendi: 'Kayıt düzenlendi',
  durak_basladi: 'Çalışmaya başlandı',
  durak_bekletildi: 'Beklemeye alındı',
  durak_devam: 'Beklemeden çıktı',
  is_iptal: 'İptal edildi',
  takip_yapildi: 'Takip yapıldı',
  durak_cikisi: 'Durak kararı',
  durak_atlandi: 'Durak atlandı',
  talep_zaman_asimi: 'Talep gelmedi (zaman aşımı)',
  form_cevaplari_silindi: 'Form cevapları silindi (KVKK)',
  yz_basarisiz: 'YZ analizi başarısız'
};

// Masalar koleksiyonunda satırı henüz olmayan masalar için ad.
const MASA_YEDEK_ADLARI = { pazarlama: 'Pazarlama', satis: 'Satış', hizmet: 'Hizmet', urun: 'Ürün' };

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

// KN işlerinde kişi yalnızca rumuzuyla bilinir (formda kişisel bilgi yok).
// Eski kayıtlarda kimlik alanları varsa onlar kullanılır.
function baslik(k) {
  if (k.description) return k.description;
  if (k.source === 'Webhook') {
    const kim = k.rumuz || k.isletmeAdi || k.isim;
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

function satir(k, musteriler, simdi = new Date()) {
  const yer = mevcutDurum(k);
  const kisaYol = yer.asama === KISA_YOL_ASAMASI;
  const asama = yer.asama;
  const durum = yer.durum;
  const sonuc = asama === SONUC_DURAGI ? k.sonuc || null : null;
  const kategoriKod = k.kategori || (k.source === 'Webhook' ? 'KN' : null);
  const musteriAdi = k.musteri ? musteriler[k.musteri] || '(müşteri bulunamadı)' : null;

  let musteri = musteriAdi;
  if (!musteri && k.source === 'Webhook') musteri = k.rumuz ? `Rumuz: ${k.rumuz}` : (k.isletmeAdi || k.isim || '—');
  if (!musteri && k.kategori === 'B') musteri = 'Pazarlama masası';
  if (!musteri && k.kategori === 'C') musteri = 'İşletme';
  if (!musteri && k.kategori === 'D') musteri = 'Ürün masası';

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
    asamaEtiketi: sonuc ? sonucEtiketi(sonuc) : asamaEtiketi(asama),
    asamaNo: kisaYol ? null : DURAKLAR[asama].sira,
    durum,
    durumEtiketi: durumEtiketi(asama, durum),
    sonuc,
    sonucEtiketi: sonucEtiketi(sonuc),
    sonrakiTakip: asama === TAKIP_DURAGI ? terminMetni(k.sonrakiTakip) : null,
    takipSayisi: asama === TAKIP_DURAGI ? Number(k.takipSayisi) || 0 : null,
    rumuz: k.rumuz || null,
    sorumlu: k.sorumlu || null,
    yzHata: sonYzHatasi(k),
    talepKalan: asama === TALEP_DURAGI && durum === 'sirada' ? talepKalanGun(k, simdi) : null,
    bagliIs: k.bagliIs || null,
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
//   gelmeyen (Giriş'te takılan) KN işleri + takip günü gelmiş / geçmiş
//   adaylar.
// Yaklaşıyor: bitiş tarihine ya da takip gününe 1..7 gün kalan açık işler.
export function gundemHesapla(isler, simdi = new Date()) {
  const bugun = bugunTR(simdi);
  const bugunListe = [];
  const yaklasiyor = [];

  for (const i of isler) {
    if (!i.acik) continue;

    if (i.yzHata && i.acik && (i.asama === GIRIS_DURAGI || i.asama === 'durum_fotografi')) {
      bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 0,
        neden: `YZ analizi başarısız (${i.yzHata}) — detaydan YZ'siz tamamlayabilirsiniz.`, etiket: 'YZ hatası', tur: 'hata' });
    } else if (i.asama === GIRIS_DURAGI && i.durum === 'devam_ediyor' && i.olusturma) {
      const dakika = (simdi - new Date(i.olusturma)) / 60000;
      if (dakika >= ESIKLER.yzBeklemeDakika) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 0,
          neden: 'Giriş tamamlanmadı — detaydan YZ\'siz tamamlayabilirsiniz.', etiket: 'Bekliyor', tur: 'hata' });
      }
    }

    if (i.sonrakiTakip && i.durum !== 'beklemede') {
      const kalan = gunFarki(i.sonrakiTakip, bugun);
      const sira = `${(i.takipSayisi || 0) + 1}. takip`;
      if (kalan < 0) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 1, termin: i.sonrakiTakip,
          neden: `${sira} ${-kalan} gün gecikti · ${i.musteri}`, etiket: 'Takip gecikti', tur: 'hata' });
      } else if (kalan === 0) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 2, termin: i.sonrakiTakip,
          neden: `${sira} · ${i.musteri}`, etiket: 'Takip günü', tur: 'bugun' });
      } else if (kalan <= ESIKLER.yaklasiyorGun) {
        yaklasiyor.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, termin: i.sonrakiTakip, kalan,
          neden: `${sira} · ${i.musteri}` });
      }
    }

    if (i.termin) {
      const kalan = gunFarki(i.termin, bugun);
      if (kalan < 0) {
        bugunListe.push({ isId: i.isId, baslik: i.baslik, kategoriKod: i.kategoriKod, sira: 1, termin: i.termin,
          neden: `Bitiş tarihi ${-kalan} gün önceydi.`, etiket: 'Süresi geçti', tur: 'hata' });
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
  const isler = sonuc.items.map((k) => satir(k, musteriler, simdi));
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
  // KN işlerinde müşteri kaydı yok; kişi rumuzuyla bilinir. (Eski kayıtlarda
  // kimlik alanları varsa onlar gösterilir.)
  if (!musteri && k.rumuz) {
    musteri = { ad: k.rumuz, irtibat: '', telefon: '', eposta: '', adres: '', knBasvurusu: true, rumuz: true };
  } else if (!musteri && (k.isim || k.isletmeAdi || k.email || k.konum)) {
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
    islem: g.etiket || ISLEM_ETIKETLERI[g.islem] || g.islem,
    onceki: ['kayit_guncellendi', 'form_cevaplari_silindi', 'yz_basarisiz'].includes(g.islem) ? null : g.onceki ? `${asamaEtiketi(g.onceki.asama) || g.onceki.asama} / ${durumEtiketi(g.onceki.asama, g.onceki.durum) || g.onceki.durum}` : null,
    yeni: ['kayit_guncellendi', 'form_cevaplari_silindi', 'yz_basarisiz'].includes(g.islem) ? null : g.yeni ? `${asamaEtiketi(g.yeni.asama) || g.yeni.asama} / ${durumEtiketi(g.yeni.asama, g.yeni.durum) || g.yeni.durum}` : null,
    kim: g.aktor ? `${g.aktor.kim}${g.aktor.tur ? ' (' + g.aktor.tur + ')' : ''}` : '',
    not: g.not || null
  }));

  // Şu an mümkün olan insan işlemleri (Süleyman'ın izin verdiği):
  const islemler = [];
  if (ozet.asama === GIRIS_DURAGI && ozet.durum === 'devam_ediyor') islemler.push('yzsizTamamla');
  if (ozet.asama === KISA_YOL_ASAMASI && ozet.durum === 'sirada') islemler.push('yapildi');
  // Ar-Ge işi kapanırken çözüm Pazarlama'ya not olarak gönderilebilir.
  if (islemler.includes('yapildi') && k.kategori === 'D') islemler.push('cozumNotu');

  // KN işi Durum Fotoğrafı'nda: YZ taslağının durumu (taslak kişi rumuzuyla
  // yazınca istenir). Gelmediyse ya da başarısızsa yeniden istenebilir.
  let yzDurumu = null;
  if (k.source === 'Webhook' && ozet.asama === 'durum_fotografi' && ozet.acik) {
    const hazir = Boolean(b && (b.context || b.summary));
    const istendi = (Array.isArray(k.gecmis) ? k.gecmis : []).some((g) => g && g.islem === 'yz_istendi');
    yzDurumu = { hazir, istendi, hata: ozet.yzHata || null };
    if (!hazir) islemler.push('yzTekrar');
  }

  // Ticari işin durağı: düğmeler ve etiketleri (rota.js'ten).
  let durak = null;
  if (!ozet.kisaYol && DURAKLAR[ozet.asama]) {
    const cikislar = {};
    for (const [yon, c] of Object.entries(CIKISLAR[ozet.asama] || {})) {
      cikislar[yon] = { etiket: c.etiket, notIpucu: c.notIpucu || '', notZorunlu: Boolean(c.notZorunlu), bagliIsler: Boolean(c.bagliIsler) };
    }
    durak = {
      kod: ozet.asama,
      ad: DURAKLAR[ozet.asama].ad,
      no: DURAKLAR[ozet.asama].sira,
      toplam: Object.values(DURAKLAR).filter((x) => x.sira > 0 && x.sira < DURAKLAR[SONUC_DURAGI].sira).length,
      islemler: izinliDurakIslemleri(mevcutDurum(k)),
      cikislar,
      sonuc: ozet.sonuc,
      sonucEtiketi: ozet.sonucEtiketi,
      takip: ozet.asama === TAKIP_DURAGI
        ? { sayi: ozet.takipSayisi || 0, plan: TAKIP_PLANI_GUN.length, sonraki: ozet.sonrakiTakip, bugun: gunTR() }
        : null,
      duzeltmeTuru: ozet.asama === 'kurulum' ? Number(k.duzeltmeTuru) || 0 : null,
      talep: ozet.asama === TALEP_DURAGI
        ? { rumuz: k.rumuz || null, kalan: ozet.talepKalan, bekleme: TALEP_BEKLEME_GUN }
        : null,
      ileriDuraklar: ileriDuraklar(ozet.asama).map((kod) => ({ kod, ad: DURAKLAR[kod].ad }))
    };
  }

  // Bağlı işler: bu işten açılanlar ve (varsa) bu işin bağlı olduğu ana iş.
  const bagliIsler = [];
  try {
    const altlar = await wixData.query(IS).eq('bagliIs', id).limit(50).find({ suppressAuth: true });
    for (const a of altlar.items) bagliIsler.push({ isId: a.isId, baslik: baslik(a), kategoriKisa: KATEGORI_KISA[a.kategori] || '—', yon: 'alt' });
    if (k.bagliIs) {
      const ana = await wixData.query(IS).eq('isId', String(k.bagliIs)).limit(1).find({ suppressAuth: true });
      if (ana.items.length) bagliIsler.push({ isId: ana.items[0].isId, baslik: baslik(ana.items[0]), kategoriKisa: 'Ana iş', yon: 'ana' });
    }
  } catch (hata) {
    console.warn('Kontrol Paneli: bağlı işler okunamadı:', id, hata);
  }

  // Düzenle: açık A/B/C işleri (KN başvuruları hariç). Formu doldurmak için
  // ham değerler de gönderilir.
  let duzenleme = null;
  if (ozet.acik && KATEGORILER[k.kategori]) {
    islemler.push('duzenle');
    duzenleme = {
      kategori: k.kategori,
      aciklama: k.description || '',
      termin: ozet.termin || '',
      aciliyet: k.aciliyet || 'normal',
      modul: k.modul || '',
      musteriId: k.musteri || '',
      kapsam: b?.kapsam || '',
      notlar: b?.girisNotu || '',
      sorumlu: k.sorumlu || ''
    };
  }

  // Masa: işin atandığı masa (masa sayfaları gelince bağlantı olacak).
  let masa = null;
  if (k.atananMasa) {
    let ad = null;
    try {
      const m = await wixData.get(MASA, k.atananMasa, { suppressAuth: true });
      ad = m && m.masaAdi;
    } catch (hata) {
      console.warn('Kontrol Paneli: masa okunamadı:', k.atananMasa, hata);
    }
    masa = { kod: k.atananMasa, ad: ad || MASA_YEDEK_ADLARI[k.atananMasa] || k.atananMasa };
  }

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
    islemler,
    duzenleme,
    masa,
    durak,
    bagliIsler,
    yzDurumu
  };
}
