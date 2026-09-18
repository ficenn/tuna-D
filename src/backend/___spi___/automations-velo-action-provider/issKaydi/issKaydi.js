import wixData from 'wix-data';
import { isKaydiEkleYenidenDenemeli } from '../../../isIdCounter';

export const invoke = async ({ payload }) => {

    // *** GEÇİCİ TANI SATIRI ***
    // Bu otomasyonun issKaydi.js'i gerçekten çalıştırıp çalıştırmadığını
    // kesin olarak kanıtlamak için eklendi. Aşağıdaki hiçbir mantığa
    // bağlı değil — çalışırsa IsKayitlari'nde source:"TANI" ile bir
    // kayıt görünür. Sorun çözülünce bu blok kaldırılacak.
    try {
      await wixData.insert(
        'IsKayitlari',
        { title: 'TANI - issKaydi tetiklendi', source: 'TANI', startedAt: new Date() },
        { suppressAuth: true }
      );
    } catch (taniHata) {
      // Bu bile başarısız olursa en azından neden başarısız olduğunu görürüz
      console.error('TANI insert başarısız:', taniHata);
    }
    // *** TANI SATIRI SONU ***

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