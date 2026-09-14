import { Timestamp } from '@angular/fire/firestore';

/**
 * Subconjunto de `settings/app` (plan §8.3) que ya tiene consumidores. El
 * resto del modelo del plan (moneda, políticas de venta, prefijo de gift
 * card, etc.) se añade cuando la fase que lo necesita lo requiera — no antes.
 */
export interface AppSettings {
    internalCodePrefix: string; // 'MP' (plan §14.2)
    lowStockThreshold: number; // 3 (plan §13.2, B8)
    updatedAt: Timestamp;
}
