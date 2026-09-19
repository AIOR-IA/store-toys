import { Timestamp } from '@angular/fire/firestore';

/**
 * Modelo de Gift Cards (Fase 6, plan §16 actualizado — ver el comentario
 * largo en `functions/src/giftcards.ts` para la justificación completa).
 *
 * Tres colecciones, tres responsabilidades (plan §16.1), sin cambios en esta
 * fase respecto a esa arquitectura:
 *
 * - `giftCards/{cardCode}`     el PLÁSTICO — reutilizable, estado visible en
 *                              1 lectura.
 * - `giftCardIssues/{id}`      un CICLO de uso — nace al vender/activar,
 *                              vive mientras está ACTIVE/SUSPENDED, se cierra
 *                              al redimirse o cancelarse. Solo admin lo lee
 *                              directo (auditoría); el mostrador no lo
 *                              necesita porque el estado corriente ya está
 *                              denormalizado en `GiftCard`.
 * - `giftCardMovements/{id}`   el LIBRO MAYOR, append-only — un evento por
 *                              transición, con snapshot de comprador/venta.
 *
 * DECISIÓN NUEVA de esta fase — denominación FIJA, no importe libre: las
 * tarjetas las imprime una imprenta externa con el monto ya impreso
 * (100/500/1000 Bs…). `amountCents` se fija UNA VEZ al registrar la tarjeta
 * física, nunca en cada activación (reemplaza el "importes libres" del plan
 * original, §16.2 E2 — información nueva confirmada por el cliente).
 */
export type GiftCardStatus = 'AVAILABLE' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

/**
 * Origen del código al registrar una tarjeta física (ajuste posterior a la
 * Fase 6, sin tocar el modelo de `GiftCard`: el código sigue siendo el ID
 * del documento en ambos casos, indistinguible una vez creado — ver
 * `functions/src/giftcards.ts`, comentario de cabecera).
 *
 * - `'manual'` — el código viene de la imprenta, tecleado por quien registra.
 * - `'generated'` — el servidor lo decide: `GC{denominación}-{secuencia}`.
 */
export type GiftCardCodeMode = 'manual' | 'generated';

export interface GiftCard {
    cardCode: string; // del ID del documento — NO se guarda en el documento
    amountCents: number; // denominación fija, decidida al registrar (nunca cambia)
    status: GiftCardStatus;

    /**
     * Mecanismo anti-carrera entre ciclos (prompt §7, §23, §44):
     * `cycleNumber` es el identificador legible ("va en el ciclo 3"),
     * `activeCycleId` es el id real de `giftCardIssues` que hay que citar
     * para operar sobre el ciclo vigente — cualquier operación que cite un
     * `activeCycleId` viejo se rechaza server-side porque este campo ya
     * cambió.
     */
    cycleNumber: number;
    activeCycleId: string | null;

    currentBuyerName: string | null;
    activatedAt: Timestamp | null;
    activatedBy: string | null;
    activatedByName: string | null;

    suspendedAt: Timestamp | null;
    suspendedBy: string | null;
    suspendedByName: string | null;
    suspensionReason: string | null;

    cancelledAt: Timestamp | null;
    cancelledBy: string | null;
    cancelledByName: string | null;
    cancelReason: string | null;

    createdAt: Timestamp;
    createdBy: string;
    createdByName: string;
    updatedAt: Timestamp;
}

export type GiftCardCycleStatus = 'active' | 'suspended' | 'redeemed' | 'cancelled';

export type GiftCardIssuePaymentMethod = 'cash' | 'qr';

export interface GiftCardIssuePayment {
    method: GiftCardIssuePaymentMethod;
    amountCents: number;
}

/** `giftCardIssues/{id}` — un CICLO de uso de una tarjeta física. Solo admin (Rules). */
export interface GiftCardIssue {
    id: string;
    cardCode: string;
    cycleNumber: number;
    amountCents: number; // snapshot de GiftCard.amountCents en la activación
    status: GiftCardCycleStatus;
    buyerName: string | null;

    activatedAt: Timestamp;
    activatedBy: string;
    activatedByName: string;
    dateKey: string; // America/La_Paz — el día que corresponde ajustar si se cancela después
    monthKey: string;
    year: number;
    payments: GiftCardIssuePayment[]; // cómo pagó el comprador LA TARJETA (no una redención)

    suspendedAt: Timestamp | null;
    suspendedBy: string | null;
    suspensionReason: string | null;
    reactivatedAt: Timestamp | null;
    reactivatedBy: string | null;

    redeemedAt: Timestamp | null;
    saleId: string | null;
    redeemedAmountCents: number | null;
    forfeitedAmountCents: number | null;

    cancelledAt: Timestamp | null;
    cancelledBy: string | null;
    cancelReason: string | null;

    closedAt: Timestamp | null;
}

export type GiftCardMovementType =
    | 'REGISTERED'
    | 'ACTIVATED'
    | 'SUSPENDED'
    | 'REACTIVATED'
    | 'REDEEMED'
    | 'FORFEITED'
    | 'CANCELLED'
    | 'ADJUSTMENT';

/** `giftCardMovements/{id}` — libro mayor append-only. Solo admin (Rules). */
export interface GiftCardMovement {
    id: string;
    giftCardId: string;
    codeSnapshot: string;
    amountCents: number;
    cycleNumber: number | null;
    cycleId: string | null;
    type: GiftCardMovementType;
    createdAt: Timestamp;
    performedBy: string;
    performedByName: string;
    buyerNameSnapshot: string | null;
    saleId: string | null;
    reason: string | null;
}
