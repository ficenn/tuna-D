// HAP'a kim girebilir? — "HAP Ekibi" rolündeki site üyeleri.
//
// 2026-10-29 kararı: Permissions.Admin canlı sitede yalnızca site sahibini ve
// siteye doğrudan eklenen ortak çalışanları tanıyor; Wix Studio çalışma alanı
// ekibinden gelen erişimi (ör. Tuna, "Hesap Admini") tanımıyor. Bu yüzden HAP,
// Wix yöneticiliğine değil, sitenin üye sistemindeki bir role bakar:
//   1. Kişi sitede "Giriş" ile üye olarak oturum açar.
//   2. Panelde Kişiler → Site Üyeleri → Roller'de bu üyeye "HAP Ekibi" rolü verilir.
// Rolü olmayan üye ve oturum açmamış ziyaretçi hiçbir veri göremez.
// (İleride bir müşterinin kendi çalışanını eklemesi de aynı yoldan olur.)

import { currentMember } from 'wix-members-backend';

export const HAP_ROLU = 'HAP Ekibi';

const kucuk = (m) => String(m || '').trim().toLocaleLowerCase('tr-TR');

// Oturum açmış üyenin "HAP Ekibi" rolü var mı? Hata fırlatmaz.
export async function hapYetkisiVar() {
  try {
    const roller = await currentMember.getRoles();
    return (roller || []).some((r) => kucuk(r && r.title) === kucuk(HAP_ROLU));
  } catch (hata) {
    return false;
  }
}

// Rolü yoksa durdurur. Mesajdaki "NotAuthorized" sayfada "Yetki yok" olarak gösterilir.
export async function hapYetkisiGerekli() {
  if (!(await hapYetkisiVar())) {
    throw new Error(`NotAuthorized: HAP için "${HAP_ROLU}" rolüyle üye girişi gerekli.`);
  }
}

// Kullanım (.web.js içinde) — Wix web modülleri webMethod(İzin, async (...) => {...})
// kalıbını doğrudan görmek ister; sarmalayıcı fonksiyon tanınmaz. Bu yüzden kontrol
// her fonksiyonun ilk satırındadır:
//   webMethod(Permissions.SiteMember, async (...) => { await hapYetkisiGerekli(); ... })
//   İlk yükleme (panelVerisi, isGirisiSecenekleri): if (!(await hapYetkisiVar())) return { yetkiYok: true };
