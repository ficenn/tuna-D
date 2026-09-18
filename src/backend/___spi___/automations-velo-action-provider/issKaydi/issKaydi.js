import { isKaydiEkleYenidenDenemeli } from '../../../isIdCounter';

export const invoke = async ({ payload }) => {

    // NOT: payload burada hâlâ kullanılmıyor — bu, ayrı bir bilinen
    // sorun (bkz. denetim raporu, "issKaydi.js payload kullanmıyor").
    // Kapsam dışı tutuldu, sadece sayaç/çakışma sorunu burada çözüldü.
    try {
      const { isId } = await isKaydiEkleYenidenDenemeli({
        title: "Yeni İş",
        startedAt: new Date(),
        source: "Webhook"
      });
      console.log('issKaydi: İş kaydı oluşturuldu:', isId);
    } catch (hata) {
      console.error('issKaydi: İş kaydı oluşturulamadı:', hata);
      throw hata;
    }

return {};
};