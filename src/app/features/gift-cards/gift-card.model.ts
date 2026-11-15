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
 *
 * AJUSTE POSTERIOR (identidad ≠ monto, plan §16.13): `amountCents` dejó de
 * ser verdaderamente fijo — ahora es el MONTO CONFIGURADO ACTUAL, editable
 * por admin o vendedor (`updateGiftCardAmount`, plan §16.17 — ajuste de
 * permisos posterior, antes solo admin) mientras la tarjeta está
 * `AVAILABLE`. El nombre del campo no cambió (nunca hubo necesidad de
 * migrar nada): lo que cambió es la regla de negocio detrás de él. Una vez
 * que la tarjeta se vende/activa, ese valor queda CONGELADO en el ciclo
 * (snapshot en `GiftCardIssue.amountCents`) y ya no se puede editar hasta
 * que vuelva a `AVAILABLE` — ver `GiftCard.pendingReplacement` y
 * `replaceGiftCard` en `functions/src/giftcards.ts` para el mecanismo de
 * reemplazo de plástico sin volver a cobrar.
 */
export type GiftCardStatus = 'AVAILABLE' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

/**
 * Origen del código al registrar una tarjeta física (ajuste posterior a la
 * Fase 6, sin tocar el modelo de `GiftCard`: el código sigue siendo el ID
 * del documento en ambos casos, indistinguible una vez creado — ver
 * `functions/src/giftcards.ts`, comentario de cabecera).
 *
 * - `'manual'` — el código viene de la imprenta, tecleado por quien registra.
 * - `'generated'` — el servidor lo decide: `GC{secuencia global}` (ajuste
 *   posterior, identidad ≠ monto: ya NO codifica la denominación — ver plan
 *   §16.13; sin guion desde el plan §16.16, por incompatibilidad con el
 *   lector físico).
 */
export type GiftCardCodeMode = 'manual' | 'generated';

/**
 * Modo de `replaceGiftCard` (ajuste posterior: "reemplazar usando una Gift
 * Card existente"). `'generate'` (default, sin cambios) — código nuevo
 * generado por el sistema. `'existing'` — reutiliza un plástico YA
 * REGISTRADO, `AVAILABLE`, elegido en el panel de reemplazo — ver
 * `functions/src/giftcards.ts` para la validación/transacción real.
 */
export type GiftCardReplaceMode = 'generate' | 'existing';

export interface GiftCard {
    cardCode: string; // del ID del documento — NO se guarda en el documento
    amountCents: number; // monto configurado ACTUAL (editable solo admin + AVAILABLE; ver comentario de cabecera)
    /**
     * Saldo persistente disponible AHORA MISMO (ajuste posterior, plan §16.18
     * — revoca E6 "no se pueden recargar"). NUNCA es `amountCents`: ese sigue
     * siendo el monto configurado/nominal del ciclo, este es lo que
     * realmente queda por gastar. Invariantes: `AVAILABLE` → `0`;
     * `ACTIVE`/`SUSPENDED` → `> 0` (suspender nunca pierde saldo);
     * `CANCELLED` puede conservar `> 0` mientras `pendingReplacement` espera
     * un `replaceGiftCard`. Un documento anterior a este ajuste no tiene el
     * campo: `giftCardConverter` lo lee como `0` (nunca como `amountCents` —
     * sería una suposición de negocio, no un valor neutro).
     */
    balanceCents: number;
    /**
     * Contador monotónico de "algo tocó el saldo de este ciclo" (ajuste
     * sobre la Fase B, plan §16.21) — nunca se repite dentro de un ciclo,
     * a diferencia del saldo (que sí puede volver a un valor anterior tras
     * una recarga). Solo lo usa el backend (`cancelSale`) como chequeo
     * autoritativo; la UI todavía no lo necesita — opcional a propósito,
     * sin resolver legacy (no hay historial de `balanceRevision` que
     * reconstruir). Representa EXCLUSIVAMENTE la secuencia de operaciones
     * que modifican `balanceCents` — nunca cambios de status, comprador ni
     * ningún otro campo (por eso el nombre explícito, no un `revision`
     * genérico).
     */
    balanceRevision?: number;
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

    /**
     * El último ciclo abierto, de cualquier tarjeta — a diferencia de
     * `activeCycleId`, NUNCA se limpia (ni al redimirse ni al cancelarse).
     * Es lo que permite reemplazar una tarjeta que ya quedó `CANCELLED` sin
     * tener que leer `giftCardIssues` (ajuste posterior, plan §16.13).
     * `null` en tarjetas que nunca se activaron.
     */
    lastCycleId: string | null;
    /** Si esta tarjeta ya fue reemplazada, el código de la nueva. `null` si no. */
    replacedByCode: string | null;
    /** Si esta tarjeta NACIÓ como reemplazo de otra, el código de la vieja. `null` si no. */
    replacesCode: string | null;
    /**
     * `true` únicamente cuando esta tarjeta quedó `CANCELLED` con un ciclo
     * abierto (dinero ya pagado) todavía sin transferir a un reemplazo — es
     * la condición exacta que habilita `replaceGiftCard` sobre una tarjeta
     * ya cancelada (plan §16.13). Siempre `false` en cualquier otro estado.
     */
    pendingReplacement: boolean;

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

/**
 * `'sale'` — ciclo abierto por una venta real (`activateGiftCard`): cuenta
 * en reportes por vendedor. `'replacement'` — ciclo abierto por
 * `replaceGiftCard` (ajuste posterior, plan §16.13): transfiere un valor ya
 * pagado, SIN cobrar de nuevo — `sumIssues()` (reports.service.ts) lo
 * excluye de los totales por vendedor. Los ciclos anteriores a este ajuste
 * no tienen este campo: se leen como `'sale'` (comportamiento histórico sin
 * cambios).
 */
export type GiftCardIssueOrigin = 'sale' | 'replacement';

export type GiftCardIssuePaymentMethod = 'cash' | 'qr';

export interface GiftCardIssuePayment {
    method: GiftCardIssuePaymentMethod;
    amountCents: number;
}

/**
 * Recibo de cobro de UNA emisión/venta real de Gift Card (ajuste posterior,
 * Recibo/Historial de Gift Cards, sin abrir una fase nueva). Forma reducida
 * de `GiftCardIssue`, pensada para el único transporte disponible desde el
 * cliente: las Functions `getGiftCardIssue`/`listGiftCardIssues`
 * (`giftCardIssues` es admin-only en las Rules, plan §16.1 — ver el
 * comentario largo de esas Functions en `functions/src/giftcards.ts`).
 *
 * Fuente de verdad SIEMPRE `giftCardIssues`, nunca `giftCards`: el
 * monto/comprador ACTUALES de la tarjeta pueden pertenecer a un ciclo
 * totalmente distinto para cuando alguien reimprime (plan §16.13, identidad
 * ≠ monto) — por eso cada campo de aquí es el SNAPSHOT congelado del ciclo,
 * nunca una relectura de `GiftCard`. Mismo documento, imprimir justo
 * después de vender y reimprimir desde el Historial: nunca puede haber dos
 * recibos distintos para el mismo ciclo.
 */
export interface GiftCardReceipt {
    id: string; // del ID de `giftCardIssues/{id}`
    cardCode: string;
    cycleNumber: number;
    amountCents: number;
    buyerName: string | null;
    activatedAt: Timestamp;
    activatedByName: string;
    dateKey: string;
    payments: GiftCardIssuePayment[];
}

/** `giftCardIssues/{id}` — un CICLO de uso de una tarjeta física. Solo admin (Rules). */
export interface GiftCardIssue {
    id: string;
    cardCode: string;
    cycleNumber: number;
    amountCents: number; // snapshot INMUTABLE del monto con el que nació este ciclo — nunca cambia después
    /**
     * Saldo CORRIENTE de este ciclo (ajuste posterior, plan §16.18). Vive
     * aparte de `GiftCard.balanceCents` (que es el acceso rápido del
     * mostrador) porque la reversión de `cancelSale` necesita comparar el
     * saldo exactamente como quedó en el momento de ESTA venta, sin depender
     * de qué le haya pasado a `GiftCard` desde entonces. Un ciclo histórico
     * (anterior a este ajuste, o ya cerrado antes de que existiera) se lee
     * como `0` — nunca como `amountCents`.
     */
    balanceCents: number;
    /** Equivalente a `GiftCard.balanceRevision` para este ciclo (ajuste sobre la Fase B, plan §16.21). */
    balanceRevision?: number;
    status: GiftCardCycleStatus;
    /** Opcional por compatibilidad histórica: un ciclo sin este campo es `'sale'` (ver el tipo). */
    origin?: GiftCardIssueOrigin;
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

/**
 * Saldo persistente — adopción progresiva, SIN backfill masivo (ajuste
 * posterior sobre la Fase A, plan §16.18): resuelve el saldo EFECTIVO de una
 * `GiftCard` que todavía no fue "adoptada" por el modelo nuevo (nunca tuvo
 * `balanceCents` escrito). Usado por `giftCardConverter` para que el
 * mostrador NUNCA muestre saldo `0` falso en una `ACTIVE`/`SUSPENDED` legacy
 * que jamás se redimió — mismo criterio y mismo nombre que el helper
 * equivalente de `functions/src/giftcards.ts` (backend).
 *
 * Recibe los campos ya leídos de Firestore (antes de que el converter
 * decida qué poner en `balanceCents`), nunca un `GiftCard` ya resuelto —
 * evitaría poder distinguir "0 real" de "campo ausente".
 *
 * ENDURECIDO en la Fase E — mismo criterio que el helper equivalente de
 * `functions/src/giftcards.ts` (Fase D, plan §16.23): el `status` manda
 * SIEMPRE sobre cualquier `balanceCents` residual, nunca al revés.
 * `AVAILABLE` y `CANCELLED` sin `pendingReplacement` devuelven `0` aunque el
 * documento tenga un `balanceCents` viejo distinto de cero (p. ej. una
 * tarjeta ya reemplazada con un residuo que debería haber quedado en 0) —
 * el mostrador nunca debe mostrar un saldo que el backend ya considera
 * inexistente.
 */
export function resolveGiftCardBalance(card: {
    status: GiftCardStatus;
    amountCents: number;
    balanceCents?: number | null;
    pendingReplacement?: boolean;
}): number {
    if (card.status === 'AVAILABLE') return 0;
    if (card.status === 'CANCELLED' && !card.pendingReplacement) return 0;
    if (typeof card.balanceCents === 'number') return card.balanceCents;
    return card.amountCents;
}

/**
 * Equivalente a `resolveGiftCardBalance` para un `GiftCardIssue` (ajuste
 * posterior, plan §16.18). Un ciclo CERRADO (`redeemed`/`cancelled`,
 * histórico) nunca necesitó saldo — su efectivo es `0`; solo un ciclo
 * abierto (`active`/`suspended`) sin `balanceCents` todavía reconstruye
 * desde `amountCents`, igual criterio que la tarjeta.
 *
 * ENDURECIDO en la Fase E, mismo motivo que `resolveGiftCardBalance`: un
 * ciclo cerrado devuelve `0` aunque tenga un `balanceCents` residual — el
 * estado del ciclo manda siempre.
 */
export function resolveGiftCardIssueBalance(issue: {
    status: GiftCardCycleStatus;
    amountCents: number;
    balanceCents?: number | null;
}): number {
    if (issue.status === 'redeemed' || issue.status === 'cancelled') return 0;
    if (typeof issue.balanceCents === 'number') return issue.balanceCents;
    return issue.amountCents;
}

export type GiftCardMovementType =
    | 'REGISTERED'
    | 'ACTIVATED'
    | 'SUSPENDED'
    | 'REACTIVATED'
    | 'REDEEMED'
    | 'FORFEITED'
    | 'CANCELLED'
    | 'ADJUSTMENT'
    // Ajuste posterior (identidad ≠ monto, plan §16.13):
    | 'AMOUNT_CHANGED' // admin cambió el monto configurado (solo AVAILABLE) — NUNCA es ingreso
    | 'REPLACED' // tarjeta vieja: quedó CANCELLED y transfirió su valor a `replacedByCode`
    | 'REPLACEMENT_CREATED' // tarjeta nueva: nació con el valor transferido de `replacesCode`
    // Ajuste posterior (saldo persistente, plan §16.18) — tipos reservados
    // para las Fases B/C: ningún Function los escribe todavía (Fase A solo
    // prepara el modelo).
    | 'TOP_UP' // recarga: balanceCents aumenta sobre el MISMO ciclo (ACTIVE únicamente)
    | 'BALANCE_RESTORED'; // reversión de `cancelSale` sobre saldo parcial — NUNCA reutiliza 'ADJUSTMENT'

/**
 * `giftCardMovements/{id}` — libro mayor append-only. Solo admin (Rules).
 *
 * `previousAmountCents`/`replacedByCode`/`replacesCode` son opcionales por
 * compatibilidad histórica — solo los escriben los movimientos nuevos
 * (`AMOUNT_CHANGED`/`REPLACED`/`REPLACEMENT_CREATED`); un movimiento
 * anterior a este ajuste simplemente no los tiene.
 */
export interface GiftCardMovement {
    id: string;
    giftCardId: string;
    codeSnapshot: string;
    amountCents: number;
    /** Solo en `AMOUNT_CHANGED`: el monto que tenía antes del cambio. */
    previousAmountCents?: number | null;
    cycleNumber: number | null;
    cycleId: string | null;
    type: GiftCardMovementType;
    createdAt: Timestamp;
    performedBy: string;
    performedByName: string;
    buyerNameSnapshot: string | null;
    saleId: string | null;
    reason: string | null;
    /** Solo en `REPLACED` (tarjeta vieja): el código de la tarjeta nueva. */
    replacedByCode?: string | null;
    /** Solo en `REPLACEMENT_CREATED` (tarjeta nueva): el código de la tarjeta vieja. */
    replacesCode?: string | null;
    /**
     * Saldo antes/después del evento (ajuste posterior, plan §16.18) —
     * `REDEEMED`/`BALANCE_RESTORED` (Fase B) y `TOP_UP` (Fase C) ya los
     * escriben; el resto de los tipos (`REGISTERED`, `ACTIVATED`, etc.) no
     * los necesita, quedan opcionales por eso.
     */
    balanceBeforeCents?: number | null;
    balanceAfterCents?: number | null;
    /** Equivalente a `balanceRevision` de la tarjeta/ciclo en el momento de este movimiento (ajuste sobre la Fase B, plan §16.21). */
    balanceRevisionBefore?: number | null;
    balanceRevisionAfter?: number | null;
}

/**
 * Respuesta de `topUpGiftCard` (Fase C, plan §16.22) — lo mínimo que el
 * frontend futuro (Fase E) necesita para refrescar la pantalla sin releer la
 * tarjeta. Un reintento idempotente (mismo `topUpId`) devuelve exactamente
 * esta misma forma, con los valores de la recarga original.
 */
export interface GiftCardTopUpResult {
    cardCode: string;
    amountAddedCents: number;
    balanceBeforeCents: number;
    balanceAfterCents: number;
    balanceRevision: number;
    cycleNumber: number;
}

/**
 * Comprobante de UNA recarga (Fase E, UI/UX de saldo persistente): a
 * diferencia de `GiftCardReceipt` (emisión/venta real, respaldada por
 * `giftCardIssues` vía `getGiftCardIssue`), este NUNCA se relee del servidor
 * — `giftCardTopUps` sigue `allow read, write: if false` (plan §16.22: "sin
 * consumidor real todavía") y abrir esa Rule solo para imprimir un recibo no
 * está en el alcance de esta fase. Se construye en el cliente, en el
 * instante, a partir de la RESPUESTA ya recibida de `topUpGiftCard`
 * (`GiftCardTopUpResult`) más los pagos que el propio cliente envió y el
 * nombre de quien hizo la operación (sesión activa) — nunca se inventa
 * ningún valor que no haya confirmado el servidor. Reimprimir más adelante
 * (fuera de esta fase) requeriría o bien relajar esa Rule, o bien una
 * Function de lectura dedicada — documentado, no implementado aquí.
 */
export interface GiftCardTopUpReceipt {
    cardCode: string;
    cycleNumber: number;
    amountAddedCents: number;
    balanceBeforeCents: number;
    balanceAfterCents: number;
    performedByName: string;
    createdAt: Timestamp;
    payments: GiftCardIssuePayment[];
}
