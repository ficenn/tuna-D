import { webMethod, Permissions } from 'wix-web-module';
import wixData from 'wix-data';

export const getNextIsId = webMethod(
    Permissions.Admin,
    async () => {

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

        const yeniNumara = Number(item.sayac || 0) + 1;

        item.sayac = yeniNumara;

        await wixData.update(
            "sistem",
            item,
            { suppressAuth: true }
        );

        return String(yeniNumara).padStart(6, "0");
    }
);
