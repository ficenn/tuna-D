import wixData from 'wix-data';
import { getNextIsId } from '../../../isIdCounter';

export const invoke = async ({ payload }) => {

    // İş ID'sini atomik olarak al (bkz. isIdCounter.js — hapBackend.web.js
    // ile aynı, paylaşılan uygulama; artık iki ayrı sayaç mantığı yok)
    const isId = await getNextIsId();

    // NOT: payload burada hâlâ kullanılmıyor — bu, ayrı bir bilinen
    // sorun (bkz. denetim raporu, "issKaydi.js payload kullanmıyor").
    // Kapsam dışı tutuldu, sadece sayaç sorunu burada çözüldü.

    // İş kaydını oluştur
  const kayit = await wixData.insert(
    "IsKayitlari",
    {
        isId: isId,
        title: "Yeni İş",
        startedAt: new Date(),
        source: "Webhook"
    },
    { suppressAuth: true }
);

return {};
};