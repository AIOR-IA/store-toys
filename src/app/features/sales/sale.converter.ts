import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { ExtraSaleItem, ProductSaleItem, Sale, SaleItem } from './sale.model';

/**
 * Venta Extra (nueva funcionalidad): ventas ANTERIORES a este ajuste no
 * tienen `kind` en sus `items[]` — se normalizan a `'PRODUCT'` al leer
 * (mismo patrón que `subtotalCents`/`discountCents` abajo), nunca se migra
 * ningún documento.
 */
function normalizeSaleItem(raw: Record<string, unknown>): SaleItem {
    if (raw['kind'] === 'EXTRA') {
        return raw as unknown as ExtraSaleItem;
    }
    return { ...raw, kind: 'PRODUCT' } as unknown as ProductSaleItem;
}

/**
 * `withConverter` de `sales` (CLAUDE.md, "Datos": *un `withConverter` por
 * colección*). Solo de LECTURA en la práctica: el cliente nunca escribe en
 * `sales` (plan §10.2) — `toFirestore` existe únicamente porque el tipo del
 * SDK lo exige.
 */
export const saleConverter: FirestoreDataConverter<Sale> = {
    toFirestore(sale: Sale): DocumentData {
        const { id, ...data } = sale;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Sale {
        const data = snapshot.data(options);
        // Ventas previas al ajuste de rebaja: sin los campos nuevos, se leen
        // como "sin rebaja" con su total histórico (ver `Sale`).
        return {
            ...data,
            id: snapshot.id,
            subtotalCents: data['subtotalCents'] ?? data['totalCents'],
            discountCents: data['discountCents'] ?? 0,
            items: ((data['items'] as Record<string, unknown>[]) ?? []).map(normalizeSaleItem),
        } as Sale;
    },
};
