// YZ çağrısı — Durum Fotoğrafı taslağını Netlify (hap-intake) üzerinden ister.
//
// 2026-10-26 kararı: KN cevapları YZ'ye form gelince DEĞİL, kişi rumuzuyla
// yazınca (Talep bekleniyor → Durum Fotoğrafı) gider. Böylece hiç yazmayan
// kişinin cevapları Google'a gitmez (KVKK: gerektiği kadar veri). Sonuç
// /_functions/boltSonucu'ya döner ve yalnızca bağlama yazılır; iş durak
// değiştirmez. Başarısız olursa Netlify { hata, neden } gönderir.

import wixData from 'wix-data';
import { fetch } from 'wix-fetch';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { yzOlayiKaydet } from './suleyman';

const elevatedGetSecretValue = elevate(secrets.getSecretValue);
const SECRET_ADI = 'BOLT_WEBHOOK_SECRET';
const BOLT_URL = 'https://quiet-fudge-87d5ac.netlify.app/.netlify/functions/hap-intake';

async function baglamBul(isId) {
  const b = await wixData.query('IsBaglamlari').eq('isId', String(isId)).limit(1).find({ suppressAuth: true });
  return b.items[0] || null;
}

// Taslak gerekir mi: KN işi, form cevapları var, henüz YZ analizi yok.
export async function yzTaslagiGerekli(isId) {
  const k = await wixData.query('IsKayitlari').eq('isId', String(isId)).limit(1).find({ suppressAuth: true });
  const kayit = k.items[0];
  if (!kayit || kayit.source !== 'Webhook') return { gerekli: false, sebep: 'kn_degil' };
  const b = await baglamBul(isId);
  const cevapVar = b && b.answers && typeof b.answers === 'object' && Object.keys(b.answers).length > 0;
  if (!cevapVar) return { gerekli: false, sebep: 'cevap_yok' };
  if (b.context || b.summary) return { gerekli: false, sebep: 'zaten_var' };
  return { gerekli: true, baglam: b };
}

// İsteği gönderir. Döner: { basarili, mesaj }. Hata fırlatmaz.
// zorla: zaten analiz varsa da yeniden iste (panelde "YZ taslağını yeniden iste").
export async function yzTaslagiIste(isId, aktor, zorla = false) {
  try {
    const durum = await yzTaslagiGerekli(isId);
    let baglam = durum.baglam;
    if (!durum.gerekli) {
      if (!(zorla && durum.sebep === 'zaten_var')) {
        return { basarili: false, mesaj: durum.sebep === 'cevap_yok' ? 'Bu işte form cevabı yok; YZ taslağı istenemez.' : null };
      }
      baglam = await baglamBul(isId);
    }
    const secretSonuc = await elevatedGetSecretValue(SECRET_ADI);
    const secret = typeof secretSonuc === 'string' ? secretSonuc : secretSonuc?.value;
    if (!secret) throw new Error('BOLT_WEBHOOK_SECRET boş veya okunamadı.');
    const yanit = await fetch(BOLT_URL, {
      method: 'post',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ isId: String(isId), answers: baglam.answers })
    });
    if (!yanit.ok) throw new Error(`hap-intake ${yanit.status}`);
    await yzOlayiKaydet(String(isId), 'yz_istendi', null, aktor);
    return { basarili: true, mesaj: 'Durum Fotoğrafı için YZ taslağı istendi; birkaç dakika içinde detayda görünür.' };
  } catch (hata) {
    console.error(`yzCagir: ${isId} YZ taslağı istenemedi:`, hata);
    try { await yzOlayiKaydet(String(isId), 'yz_basarisiz', `İstek gönderilemedi: ${hata.message}`, { tur: 'sistem', kim: 'HAP' }); } catch (e) { /* kayıt da olmazsa yalnızca log */ }
    return { basarili: false, mesaj: 'YZ taslağı istenemedi; detaydan yeniden isteyebilirsiniz.' };
  }
}
