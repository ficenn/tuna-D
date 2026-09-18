// Bu dosya artık kendi sayaç mantığını içermiyor — tek gerçek uygulama
// isIdCounter.js'de. grep ile repo genelinde hiçbir yerden import
// edilmediği doğrulandı, ama Wix Editor tarafında (bu repo dışında)
// referans veren bir şey olabileceği ihtimaline karşı silinmek yerine
// ince bir sarmalayıcıya çevrildi.
import { webMethod, Permissions } from 'wix-web-module';
import { getNextIsId as getNextIsIdShared } from './isIdCounter';

export const getNextIsId = webMethod(
    Permissions.Admin,
    async () => {
        return getNextIsIdShared();
    }
);
