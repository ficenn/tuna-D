import { isKaydiniOlustur } from 'backend/hapBackend.web';

$w.onReady(function () {

  $w('#calistirBtn').onClick(async () => {

    const is = $w('#isInput').value.trim();

    if (!is) {
      $w('#memurCiktisi').value = 'Lütfen yapılacak işi yaz.';
      return;
    }

    $w('#calistirBtn').disable();
    $w('#memurCiktisi').value = 'İş kaydı oluşturuluyor...';

    try {

      const sonuc = await isKaydiniOlustur(is);

      $w('#memurCiktisi').value =
        `İş kaydı oluşturuldu: ${sonuc.isId}`;

      $w('#isInput').value = '';

    } catch (error) {

      console.error('İş kaydı oluşturulamadı:', error);

      $w('#memurCiktisi').value =
        'HATA: ' + (error.message || String(error));

    } finally {

      $w('#calistirBtn').enable();

    }

  });

});