import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { saleConverter } from './sale.converter';

/**
 * Venta Extra (nueva funcionalidad): `fromFirestore` normaliza `items[]`
 * SIN `kind` a `'PRODUCT'` — ventas anteriores a este ajuste nunca tenían el
 * campo. Nunca se migra ningún documento; la normalización ocurre solo al
 * leer (mismo patrón ya probado para `subtotalCents`/`discountCents`).
 */
describe('saleConverter — backward compatibility de SaleItem.kind', () => {
    const snapOf = (data: Record<string, unknown>): QueryDocumentSnapshot =>
        ({ id: 'sale-1', data: () => data }) as unknown as QueryDocumentSnapshot;

    it('un item histórico sin "kind" se normaliza a PRODUCT, con todos sus campos intactos', () => {
        const sale = saleConverter.fromFirestore(
            snapOf({
                items: [
                    { productId: 'p1', code: 'MP000001', name: 'Juguete', unitPriceCents: 1000, quantity: 2, subtotalCents: 2000 },
                ],
                totalCents: 2000,
            }),
        );

        expect(sale.items).toEqual([
            { kind: 'PRODUCT', productId: 'p1', code: 'MP000001', name: 'Juguete', unitPriceCents: 1000, quantity: 2, subtotalCents: 2000 },
        ]);
    });

    it('un item con "kind": "EXTRA" se conserva tal cual, sin productId/code', () => {
        const sale = saleConverter.fromFirestore(
            snapOf({
                items: [{ kind: 'EXTRA', name: 'Chocolate', unitPriceCents: 1000, quantity: 2, subtotalCents: 2000 }],
                totalCents: 2000,
            }),
        );

        expect(sale.items).toEqual([
            { kind: 'EXTRA', name: 'Chocolate', unitPriceCents: 1000, quantity: 2, subtotalCents: 2000 },
        ]);
    });

    it('venta mixta: cada item conserva su propio kind, en el mismo orden guardado', () => {
        const sale = saleConverter.fromFirestore(
            snapOf({
                items: [
                    { kind: 'PRODUCT', productId: 'p1', code: 'MP000001', name: 'Juguete', unitPriceCents: 8000, quantity: 1, subtotalCents: 8000 },
                    { kind: 'EXTRA', name: 'Chocolate', unitPriceCents: 1000, quantity: 2, subtotalCents: 2000 },
                ],
                totalCents: 10000,
            }),
        );

        expect(sale.items.map((i) => i.kind)).toEqual(['PRODUCT', 'EXTRA']);
    });

    it('sin ningún item (venta sin items[] en Firestore, caso límite): no falla, queda un arreglo vacío', () => {
        const sale = saleConverter.fromFirestore(snapOf({ totalCents: 0 }));
        expect(sale.items).toEqual([]);
    });

    it('sigue normalizando subtotalCents/discountCents ausentes (regresión: no se rompió lo existente)', () => {
        const sale = saleConverter.fromFirestore(snapOf({ items: [], totalCents: 5000 }));
        expect(sale.subtotalCents).toBe(5000);
        expect(sale.discountCents).toBe(0);
    });
});
