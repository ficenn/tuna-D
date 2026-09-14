import wixData from 'wix-data';

export const invoke = async ({ payload }) => {

    // 1. Sayaçtan sıradaki numarayı al
    const result = await wixData.query("sistem")
        .eq("anahtar", "IS_ID_SAYAC")
        .find({
            suppressAuth: true,
            consistentRead: true
        });

    const item = result.items[0];

    if (!item) {
        throw new Error("IS_ID_SAYAC kaydı bulunamadı.");
    }

    // 2. Sayacı artır
    const yeniNumara = Number(item.sayac || 0) + 1;

    item.sayac = yeniNumara;

    await wixData.update(
        "sistem",
        item,
        { suppressAuth: true }
    );

    // 3. İş ID oluştur
    const isId = String(yeniNumara).padStart(6, "0");

    // 4. İş kaydını oluştur
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