import { Timestamp } from '@angular/fire/firestore';

/**
 * `settings/app` (plan §8.3), shape completo.
 *
 * Hasta la Fase 3 solo tenía consumidores `internalCodePrefix` y
 * `lowStockThreshold` — el documento real en Firestore solo traía esos dos
 * campos, sembrados a mano (plan §7.1). La Fase 4 es la primera en necesitar
 * el resto: `allowSaleWithoutStock`/`timezone` los lee `createSale` en
 * servidor, y los datos de la tienda van en el comprobante (plan §18.4). Los
 * campos que Fase 6 introduce (`giftCardPrefix`, `giftCardAllowsPartial`) se
 * declaran ya para no migrar el modelo otra vez, pero nada los consume todavía.
 */
export interface AppSettings {
    storeName: string; // "Mi Pimpollito"
    storeTagline: string; // "JUGUETERÍA"
    storeDescription: string; // "Artículos y accesorios para Niños"
    address: string;
    phone: string;
    social?: string;
    nit?: string; // vacío: no hay facturación fiscal (plan A3)
    currency: 'BOB';
    timezone: 'America/La_Paz';

    internalCodePrefix: string; // 'MP' (plan §14.2)
    giftCardPrefix: string; // 'GC' (Fase 6) — reservado, sin consumidores todavía
    lowStockThreshold: number; // 3 (plan §13.2, B8)

    allowSaleWithoutStock: boolean; // true (plan §2.1 C-1, C4) — Fase 4
    giftCardAllowsPartial: boolean; // false (Fase 6) — reservado, sin consumidores todavía

    updatedAt: Timestamp;
}
