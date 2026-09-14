import { Timestamp } from '@angular/fire/firestore';

/**
 * Modelo de `sales/{saleId}` (plan §8.6), acotado a lo que la Fase 4
 * implementa: `cash` y `qr` sin voucher todavía (llega en la Fase 5);
 * `giftcard` no se ofrece hasta la Fase 6 — el tipo ya lo reserva para no
 * migrar el modelo otra vez, pero nada de este feature lo produce ni lo lee.
 *
 * Todo el documento lo escribe `createSale`/`cancelSale` (Cloud Functions,
 * Admin SDK): las Rules cierran `allow write: if false` (plan §10.2). El
 * cliente nunca construye un `Sale` para escribirlo — solo lo lee.
 */
export type PaymentMethod = 'cash' | 'qr' | 'giftcard';

export interface Payment {
    method: PaymentMethod;
    amountCents: number;

    /**
     * Voucher del pago QR (Fase 5) — EVIDENCIA OPCIONAL, nunca una condición
     * para que la venta esté completa (decisión de negocio explícita: cobrar
     * y atender tiene prioridad sobre sacar la foto).
     *
     * `'pending'` NO significa "venta incompleta" ni genera ninguna alerta,
     * bloqueo u obligación — es el estado inicial neutral de todo pago QR, y
     * puede quedarse así para siempre. `createSale` lo escribe así; solo
     * `attachVoucher` (Function) lo sella a `'uploaded'`, de forma
     * INMUTABLE: un voucher `'uploaded'` no se reemplaza ni se borra.
     *
     * Invariante server-side: `voucherStatus === 'uploaded'` implica
     * `voucherPath`/`voucherUrl` presentes; en cualquier otro caso (incluida
     * la ausencia del campo, en pagos `cash` o en ventas previas a la Fase
     * 5) no existen. Nunca se migran datos históricos: una venta QR sin
     * imagen de Fase 4 sigue siendo una venta completa y válida.
     */
    voucherStatus?: 'pending' | 'uploaded';
    voucherUrl?: string;
    voucherPath?: string;
    voucherUploadedAt?: Timestamp;
    voucherUploadedBy?: string;

    // solo si method === 'giftcard' (Fase 6)
    giftCardIssueId?: string;
    giftCardCode?: string;
}

export interface SaleItem {
    productId: string;
    code: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
    subtotalCents: number;
}

export type SaleStatus = 'completed' | 'cancelled';

export interface Sale {
    id: string; // del ID del documento — NO se guarda en el documento

    sellerId: string;
    sellerName: string;

    items: SaleItem[];
    totalCents: number;

    payments: Payment[];
    paymentMethods: PaymentMethod[];

    cashCents: number;
    qrCents: number;
    giftCardCents: number;

    customerName?: string;

    status: SaleStatus;
    cancelledAt?: Timestamp;
    cancelledBy?: string;
    cancelReason?: string;

    createdAt: Timestamp;
    updatedAt: Timestamp;
    dateKey: string; // 'YYYY-MM-DD' en America/La_Paz
    monthKey: string; // 'YYYY-MM'
    year: number;
}

/** Línea del carrito del POS — estado local, nunca se guarda tal cual (plan §15.5). */
export interface SaleCartLine {
    productId: string;
    code: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
    /** Stock al momento de agregarlo — solo referencia visual (plan §9, §15.5): la
     * validación real de stock ocurre en `createSale`, en servidor. */
    stockReference: number;
}
