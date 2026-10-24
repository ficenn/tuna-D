// Rota — tuna:D'nin ticari (A) iş yolculuğu.
//
// Bu dosya İŞLETMEYE ÖZGÜDÜR (HAP şablonunun parçası değildir). Başka bir
// işletmenin HAP'ında duraklar, masalar ve çıkışlar farklı olabilir; o
// işletme için yalnızca bu dosya değişir. Süleyman (suleyman.js) kuralları
// buradan okur ve hiçbir işletme kuralını kendi içinde tutmaz.
//
// Durak = işin rotadaki yeri: masa + orada yapılan iş. Aynı masa rotada
// iki kez geçebilir (Hizmet: başta Durum Fotoğrafı, sonda Kurulum).
// Her durak bir çıkış kararıyla biter (evet / hayır); kararı insan verir.
// Olumsuz karar işi İPTAL ETMEZ: iş "Sonuç" durağında bir sonuç koduyla
// kapanır (dönüşüm oranı böyle ölçülür). İptal yalnızca anlamsızlaşan işler
// içindir (yanlış açılmış, mükerrer, sahte başvuru).
//
// Kararlar: 2026-10-21 (Tuna + Fatoş Hanım), mimari belgesi §14.

// Giriş, her işletmede aynıdır (KN'de YZ analizi / insan girişi); rota
// ondan sonra başlar.
export const GIRIS_DURAGI = '1_giris';
export const SONUC_DURAGI = 'sonuc';

// Sıra numarası panelde "2. Aday Takibi" gibi gösterilir.
export const DURAKLAR = {
  '1_giris': { ad: 'Giriş', masa: null, sira: 0 },
  talep_bekleniyor: { ad: 'Talep bekleniyor', masa: 'pazarlama', sira: 1 },
  durum_fotografi: { ad: 'Durum Fotoğrafı', masa: 'hizmet', sira: 2 },
  aday_takibi: { ad: 'Aday Takibi', masa: 'pazarlama', sira: 3 },
  satis_gorusmesi: { ad: 'Satış Görüşmesi', masa: 'satis', sira: 4 },
  kurulum: { ad: 'Kurulum ve 30 gün', masa: 'hizmet', sira: 5 },
  sonuc: { ad: 'Sonuç', masa: null, sira: 6 }
};

// Elle girilen A işinin varsayılan başlangıç durağı. Eski kayıtlar da
// (2026-10-21 öncesi 7 aşamalı) burada okunur.
export const ILK_DURAK = 'durum_fotografi';

// KN (Kontrol Noktası formu) işleri: formda kişisel bilgi yok; kişi bize
// rumuzuyla WhatsApp'tan yazana kadar iş "Talep bekleniyor"da durur.
// Durum Fotoğrafı ancak kişi yazınca hazırlanır (gerçek istek).
// (Karar: 2026-10-23/24, Fatoş Hanım + Tuna)
export const KN_ILK_DURAK = 'talep_bekleniyor';
export const TALEP_DURAGI = 'talep_bekleniyor';
export const TALEP_BEKLEME_GUN = 14;   // bu kadar gün yazmazsa iş kendiliğinden kapanır

// Elle girişte seçilebilen başlangıç durakları ("rota bir kafes değil":
// iş olgunlaşmış gelebilir; ör. satış HAP dışında bitti, yalnızca kurulum).
export const BASLANGIC_DURAKLARI = ['durum_fotografi', 'aday_takibi', 'satis_gorusmesi', 'kurulum'];

// Çıkışlar. hedef: bir sonraki durak (aynı durak = tekrar tur).
// sonuc: iş Sonuç durağında bu kodla kapanır.
// notZorunlu: kararın yanında not yazmak zorunlu mu.
export const CIKISLAR = {
  talep_bekleniyor: {
    evet: { etiket: 'Kişi rumuzuyla yazdı', hedef: 'durum_fotografi', notIpucu: 'Nereden yazdı, ne istedi… (isteğe bağlı)' }
  },
  durum_fotografi: {
    evet: { etiket: 'Durum Fotoğrafı hazırlandı, Pazarlama\'ya geçti', hedef: 'aday_takibi' }
  },
  aday_takibi: {
    evet: { etiket: 'Randevu alındı', hedef: 'satis_gorusmesi', notIpucu: 'Randevu tarihi, nasıl alındı…' },
    hayir: { etiket: 'Randevu alınamadı', sonuc: 'yonlendirme_gerceklesmedi', notIpucu: 'Neden aday olmadı? (biliniyorsa)' }
  },
  satis_gorusmesi: {
    evet: { etiket: 'Satış oldu', hedef: 'kurulum' },
    hayir: { etiket: 'Satış olmadı', sonuc: 'satis_gerceklesmedi', notIpucu: 'Adayın geri bildirimi, neden olmadı… (biliniyorsa)' }
  },
  kurulum: {
    evet: { etiket: 'İyi çalışıyor, iş sonuçlandı', sonuc: 'sonuclandi', bagliIsler: true },
    hayir: { etiket: 'Düzeltme gerekiyor', hedef: 'kurulum', notZorunlu: true, notIpucu: 'Ne düzeltilecek?' }
  }
};

export const SONUCLAR = {
  sonuclandi: 'İş sonuçlandı',
  yonlendirme_gerceklesmedi: 'Yönlendirme gerçekleşmedi',
  satis_gerceklesmedi: 'Satış gerçekleşmedi',
  talep_gelmedi: 'Talep gelmedi'
};

// Aday Takibi: Durum Fotoğrafı'ndan sonra kaçıncı günlerde yoklanır.
// İnsan her takipte bir sonraki tarihi kendisi atar; atamazsa HAP bu
// günleri kullanır. Üçüncü takipten sonra karar insanındır (tarih atanmaz).
export const TAKIP_DURAGI = 'aday_takibi';
export const TAKIP_PLANI_GUN = [3, 10, 17];

// Bağlı işler (yeni kayıt, kendi kategorisinde, ana işe bağlı):
//   Kurulum kapanışı → arge: sorunlar / eksikler Ar-Ge'ye (D, Ürün masası)
//   Kurulum kapanışı → referans: olumlu geri bildirim Pazarlama'ya (B, İçerik)
//   Ar-Ge işi "Yapıldı" → cozum: çözüm / iyileştirme Pazarlama'ya (B, İçerik)
// Ham sorunlar pazarlamaya gitmez; pazarlama çözülmüş olanı anlatır.
// (Karar: 2026-10-23)
export const BAGLI_ISLER = {
  arge: { kategori: 'D', modul: 'urun_gelistirme', baslik: 'Ar-Ge notu', ad: 'Ar-Ge' },
  referans: { kategori: 'B', modul: 'icerik', baslik: 'Olumlu geri bildirim', ad: 'Pazarlama (geri bildirim)' },
  cozum: { kategori: 'B', modul: 'icerik', baslik: 'Çözüm / iyileştirme', ad: 'Pazarlama (çözüm)' }
};
