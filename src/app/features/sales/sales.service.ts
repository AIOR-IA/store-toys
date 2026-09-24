import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, from, map } from 'rxjs';
import { CursorPager, PageSize } from '@core/data';
import { saleConverter } from './sale.converter';
import { PaymentMethod, Sale } from './sale.model';

export interface CreateSaleItemInput {
    productId: string;
    quantity: number;
}

export interface CreateSalePaymentInput {
    method: PaymentMethod;
    amountCents: number;
    // Solo si method === 'giftcard' (Fase 6): lo que el POS observó al
    // buscar la tarjeta — `createSale` recalcula el monto real server-side
    // (plan §21) y solo usa estos dos como el ciclo exacto a citar.
    giftCardId?: string;
    giftCardCycleId?: string;
}

export interface CreateSaleInput {
    saleId: string;
    items: CreateSaleItemInput[];
    payments: CreateSalePaymentInput[];
    customerName?: string;
    /** Rebaja fija opcional en centavos; `createSale` la valida y recalcula el total. */
    discountCents?: number;
}

export interface SalesHistoryFilter {
    dateKey: string;
    /** Solo lo usa el admin (plan §15.5): el vendedor siempre ve las suyas. */
    sellerId?: string;
    /**
     * Solo lo usa el detalle diario de Reportes (admin): se filtra EN LA
     * CONSULTA —antes de paginar— por `paymentMethods array-contains`, así el
     * conteo, las páginas y los cursores corresponden a las ventas que
     * usaron ese método (una venta mixta Efectivo + QR entra en ambos
     * filtros, una sola vez en cada uno). Ausente = todas las ventas, con la
     * misma consulta de siempre. Requiere los índices compuestos
     * `sales(paymentMethods, dateKey, createdAt)` y
     * `sales(paymentMethods, dateKey, sellerId, createdAt)`.
     */
    paymentMethod?: PaymentMethod;
}

/**
 * Datos de `sales` (plan §8.6, §15). Todo el escrito pasa por las Cloud
 * Functions `createSale`/`cancelSale` — las Rules cierran `allow write: if
 * false` a propósito (plan §10.2): ni un admin puede crear o tocar una venta
 * directo desde el cliente.
 */
@Injectable({ providedIn: 'root' })
export class SalesService {
    private readonly firestore = inject(Firestore);
    private readonly functions = inject(Functions);

    private readonly salesCollection = collection(this.firestore, 'sales').withConverter(
        saleConverter,
    );

    /**
     * Genera el ID de venta EN EL CLIENTE, sin escribir nada (plan §15.3): es
     * lo que permite que `createSale` sea idempotente con `tx.create()` — un
     * doble clic reenvía el mismo `saleId` y la segunda llamada falla limpio
     * en vez de duplicar la venta.
     */
    generateSaleId(): string {
        return doc(collection(this.firestore, 'sales')).id;
    }

    /** `createSale` (Function): recalcula precios/total y descuenta stock en servidor. */
    createSale(input: CreateSaleInput): Observable<{ saleId: string }> {
        const callable = httpsCallable<CreateSaleInput, { saleId: string }>(
            this.functions,
            'createSale',
        );
        return from(callable(input)).pipe(map((result) => result.data));
    }

    /** `cancelSale` (Function, solo admin): devuelve stock y ajusta el resumen diario. */
    cancelSale(saleId: string, reason: string): Observable<{ saleId: string }> {
        const callable = httpsCallable<
            { saleId: string; reason: string },
            { saleId: string; status: string }
        >(this.functions, 'cancelSale');
        return from(callable({ saleId, reason })).pipe(map((result) => result.data));
    }

    /**
     * Adjunta el voucher de un pago QR vía `attachVoucher` (Fase 5): la
     * imagen (ya comprimida por `ImageCompressorService`) viaja en base64
     * dentro del propio payload del callable — `attachVoucher` es quien sube
     * el archivo a Storage con el Admin SDK, DESPUÉS de validar ownership
     * sobre `sales/{saleId}` directamente. `qr-vouchers/` en Storage Rules es
     * `allow write: if false` sin excepciones: el cliente nunca escribe ahí
     * (decisión tomada en vivo al auditar ownership — ver el comentario de
     * `attachVoucher` en `functions/src/sales.ts` y el de `storage.rules`).
     *
     * La venta ya existe y ya está completa cuando esto se llama: si falla,
     * el error se informa, pero NUNCA revierte ni invalida la venta (prompt
     * §5, §13).
     */
    attachVoucherWithUpload(
        saleId: string,
        paymentIndex: number,
        image: Blob,
    ): Observable<{ saleId: string }> {
        return from(this.doAttachVoucherWithUpload(saleId, paymentIndex, image));
    }

    private async doAttachVoucherWithUpload(
        saleId: string,
        paymentIndex: number,
        image: Blob,
    ): Promise<{ saleId: string }> {
        const fileBase64 = await this.blobToBase64(image);
        const contentType = image.type || 'image/webp';

        const callable = httpsCallable<
            { saleId: string; paymentIndex: number; fileBase64: string; contentType: string },
            { saleId: string }
        >(this.functions, 'attachVoucher');
        const result = await callable({ saleId, paymentIndex, fileBase64, contentType });
        return result.data;
    }

    /** `data:...;base64,XXXX` → solo `XXXX`, lo que espera `attachVoucher`. */
    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.slice(result.indexOf(',') + 1));
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    getSale(saleId: string): Observable<Sale | null> {
        return from(getDoc(doc(this.salesCollection, saleId))).pipe(
            map((snap) => (snap.exists() ? snap.data() : null)),
        );
    }

    /**
     * Historial de ventas (plan §15.5, alcance Fase 4): el vendedor solo ve
     * las suyas del día (`sellerId` siempre presente); el admin puede ver
     * todas las de un día o filtrar por vendedor — ambos casos usan los
     * mismos dos índices compuestos (plan §8.9), nunca una consulta sin
     * `where` de igualdad que Firestore tendría que rechazar por la Rule de
     * `list` (plan §10.2, nota sobre la consulta del vendedor).
     */
    createPager(filter: SalesHistoryFilter, pageSize: PageSize): CursorPager<Sale> {
        const baseConstraints = () => {
            const constraints = [where('dateKey', '==', filter.dateKey)];
            if (filter.sellerId) {
                constraints.push(where('sellerId', '==', filter.sellerId));
            }
            if (filter.paymentMethod) {
                constraints.push(where('paymentMethods', 'array-contains', filter.paymentMethod));
            }
            return [...constraints, orderBy('createdAt', 'desc')];
        };

        return new CursorPager<Sale>(
            (extra) => query(this.salesCollection, ...baseConstraints(), ...extra),
            () => query(this.salesCollection, ...baseConstraints()),
            pageSize,
        );
    }

    /**
     * Vendedores activos para el filtro del historial (solo admin). Consulta
     * ACOTADA (`limit(50)`) sobre `users` — la tienda tiene 1-2 empleados
     * (CLAUDE.md); nunca la colección completa sin límite.
     */
    listSellers(): Observable<{ uid: string; name: string }[]> {
        return from(
            getDocs(
                query(
                    collection(this.firestore, 'users'),
                    where('isActive', '==', true),
                    orderBy('searchName'),
                    limit(50),
                ),
            ).then((snap) =>
                snap.docs.map((d) => ({
                    uid: d.id,
                    name: `${d.get('firstName')} ${d.get('lastName')}`.trim(),
                })),
            ),
        );
    }
}
