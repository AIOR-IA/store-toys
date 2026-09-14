import { randomUUID } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, storage } from './admin';
import { assertActive, assertAdmin } from './guards';
import { dateKeys } from './date-keys';

/**
 * Cloud Functions de Ventas (plan §15).
 *
 * Región `southamerica-west1`, la misma que Firestore (plan §7.3).
 *
 * `createSale` es la única forma de escribir en `sales`: las Rules cierran
 * `allow write: if false` (plan §10.2) precisamente porque el total, el
 * descuento de stock y el resumen diario tienen que nacer de una sola
 * transacción que primero LEE el estado real — algo que ni una Rule ni un
 * `writeBatch` de cliente pueden hacer (plan §15.2).
 */
const REGION = 'southamerica-west1';
const MAX_ITEMS = 50;
const MAX_CUSTOMER_NAME_LENGTH = 120;
const MAX_CANCEL_REASON_LENGTH = 300;
const MAX_VOUCHER_BYTES = 3 * 1024 * 1024;
const VOUCHER_EXTENSION_BY_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

type PaymentMethod = 'cash' | 'qr' | 'giftcard';
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'qr', 'giftcard'];

interface CreateSaleItemInput {
    productId: string;
    quantity: number;
}

interface CreateSalePaymentInput {
    method: PaymentMethod;
    amountCents: number;
    // Solo si method === 'giftcard' (Fase 6): lo que el cliente OBSERVÓ al
    // escanear/teclear la tarjeta. El servidor nunca confía en esto para el
    // monto — lo recalcula desde `giftCards`/`giftCardIssues` reales dentro
    // de la transacción (§21 del prompt de Fase 6) — pero SÍ lo usa como el
    // identificador exacto del ciclo que el cliente cree estar cobrando: si
    // `giftCardCycleId` ya no coincide con `giftCards/{id}.activeCycleId`,
    // la venta se rechaza (protección contra reintentos de un ciclo viejo,
    // prompt §23, §44).
    giftCardId?: string;
    giftCardCycleId?: string;
}

interface CreateSaleData {
    saleId: string;
    items: CreateSaleItemInput[];
    payments: CreateSalePaymentInput[];
    customerName?: string;
}

interface CancelSaleData {
    saleId: string;
    reason: string;
}

interface AttachVoucherData {
    saleId: string;
    paymentIndex: number;
    /** Imagen ya comprimida en el cliente (`compressVoucherImage`), codificada en base64. */
    fileBase64: string;
    contentType: string;
}

function requireDocId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new HttpsError('invalid-argument', `El campo "${field}" es inválido.`);
    }
    return value;
}

/**
 * Todo campo `*Cents` es dinero en centavos: un entero seguro, siempre (plan
 * §17.1). Se afirma explícitamente en cada punto donde un monto se computa o
 * está a punto de persistirse — no solo en la entrada del cliente — porque
 * `FieldValue.increment()` de Firestore puede degradar a `doubleValue` un
 * campo `*Cents` cuando el valor ACTUAL almacenado es exactamente `0` (caso
 * real encontrado: `qrCents` nace en `0` en la primera venta en efectivo del
 * día, y el incremento de la primera venta QR posterior llegó como
 * `doubleValue` pese a que el operando y el valor previo eran enteros). Por
 * eso los campos `*Cents` de `dailySummaries` ya NO usan
 * `FieldValue.increment()`: se leen dentro de la misma transacción, se suman
 * en JavaScript como enteros comunes, se verifican aquí, y se escriben como
 * literales — el mismo camino de serialización que ya probó producir
 * `integerValue` de forma consistente para los snapshots de `sales`.
 */
function assertSafeIntegerCents(value: number, field: string): number {
    if (!Number.isSafeInteger(value)) {
        throw new HttpsError(
            'internal',
            `Error interno de cálculo monetario en "${field}". Intenta nuevamente.`,
        );
    }
    return value;
}

/**
 * Valida la FORMA del payload (plan §15.3, paso 2) — antes de cualquier
 * lectura de Firestore. El precio y el total **nunca** vienen del cliente
 * (plan §30, §2.1 C-9): el ítem solo trae `productId`/`quantity`, así que no
 * hay nada de dinero que un cliente manipulado pueda falsear en este payload.
 */
function validateItemsShape(value: unknown): CreateSaleItemInput[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) {
        throw new HttpsError(
            'invalid-argument',
            `La venta debe tener entre 1 y ${MAX_ITEMS} productos.`,
        );
    }

    const merged = new Map<string, number>();
    for (const raw of value) {
        const productId = requireDocId(
            (raw as { productId?: unknown })?.productId,
            'productId',
        );
        const quantity = (raw as { quantity?: unknown })?.quantity;
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
            throw new HttpsError(
                'invalid-argument',
                'La cantidad de cada producto debe ser un entero mayor a 0.',
            );
        }
        merged.set(productId, (merged.get(productId) ?? 0) + quantity);
    }

    return Array.from(merged, ([productId, quantity]) => ({ productId, quantity }));
}

function validatePaymentsShape(value: unknown): CreateSalePaymentInput[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
        throw new HttpsError('invalid-argument', 'La venta debe tener al menos una forma de pago.');
    }

    const payments = value.map((raw) => {
        const method = (raw as { method?: unknown })?.method;
        if (typeof method !== 'string' || !PAYMENT_METHODS.includes(method as PaymentMethod)) {
            throw new HttpsError(
                'invalid-argument',
                'Esa forma de pago todavía no está disponible.',
            );
        }
        const amountCents = (raw as { amountCents?: unknown })?.amountCents;
        if (
            typeof amountCents !== 'number' ||
            !Number.isSafeInteger(amountCents) ||
            amountCents <= 0
        ) {
            throw new HttpsError('invalid-argument', 'El monto pagado es inválido.');
        }

        if (method === 'giftcard') {
            const giftCardId = requireDocId((raw as { giftCardId?: unknown })?.giftCardId, 'giftCardId');
            const giftCardCycleId = requireDocId(
                (raw as { giftCardCycleId?: unknown })?.giftCardCycleId,
                'giftCardCycleId',
            );
            return { method: method as PaymentMethod, amountCents, giftCardId, giftCardCycleId };
        }
        return { method: method as PaymentMethod, amountCents };
    });

    // ≤ 1 pago 'giftcard' y ≤ 1 pago de "diferencia" (plan §15.1, §15.3): el
    // único pago mixto permitido es gift card + la diferencia en cash o qr.
    const giftcardCount = payments.filter((p) => p.method === 'giftcard').length;
    if (giftcardCount > 1) {
        throw new HttpsError('invalid-argument', 'Solo se admite una gift card por venta.');
    }

    return payments;
}

/**
 * Registra una venta (plan §15.3): recalcula precios y total en servidor,
 * aplica `allowSaleWithoutStock`, y descuenta stock + actualiza el resumen
 * diario dentro de la misma transacción que crea la venta.
 *
 * Idempotente por diseño: `saleId` lo genera el cliente y la Function escribe
 * con `tx.create()`, que falla si el documento ya existe — un doble clic en
 * "Confirmar" (o un reintento tras perder la respuesta) nunca duplica la
 * venta ni descuenta el stock dos veces.
 */
export const createSale = onCall<CreateSaleData>({ region: REGION }, async (request) => {
    const sellerSnap = await assertActive(request.auth);
    const role = sellerSnap.get('role');
    if (role !== 'admin' && role !== 'user') {
        throw new HttpsError('permission-denied', 'Rol no autorizado para vender.');
    }

    const saleId = requireDocId(request.data.saleId, 'saleId');
    const items = validateItemsShape(request.data.items);
    const payments = validatePaymentsShape(request.data.payments);
    const customerNameRaw = request.data.customerName;
    const customerName =
        typeof customerNameRaw === 'string' && customerNameRaw.trim()
            ? customerNameRaw.trim().slice(0, MAX_CUSTOMER_NAME_LENGTH)
            : undefined;

    const settingsSnap = await db.doc('settings/app').get();
    const allowSaleWithoutStock = settingsSnap.get('allowSaleWithoutStock') !== false;
    const timezone = (settingsSnap.get('timezone') as string) || 'America/La_Paz';

    const saleRef = db.doc(`sales/${saleId}`);
    const productRefs = items.map((item) => db.doc(`products/${item.productId}`));

    try {
        const giftcardPayment = payments.find((p) => p.method === 'giftcard');
        const giftCardRef = giftcardPayment
            ? db.doc(`giftCards/${giftcardPayment.giftCardId}`)
            : null;

        await db.runTransaction(async (tx) => {
            const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

            // Lectura de la gift card ANTES de cualquier escritura (Firestore
            // exige que todas las lecturas de la transacción precedan a las
            // escrituras) — se resuelve aquí mismo, junto a los productos,
            // aunque las escrituras que dependen de ella ocurran más abajo.
            const giftCardSnap = giftCardRef ? await tx.get(giftCardRef) : null;
            let giftCardIssueSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            if (giftcardPayment && giftCardSnap) {
                if (!giftCardSnap.exists) {
                    throw new HttpsError('not-found', 'Gift card no encontrada.');
                }
                if (giftCardSnap.get('status') !== 'ACTIVE') {
                    throw new HttpsError(
                        'failed-precondition',
                        'Esta gift card no está activa: no se puede usar como pago.',
                    );
                }
                // Protección anti-carrera de ciclo (prompt §23, §44): si el
                // ciclo que el cliente observó ya no es el vigente —la
                // tarjeta se redimió y se volvió a vender mientras tanto—,
                // esta venta se rechaza en vez de afectar el ciclo nuevo.
                if (giftCardSnap.get('activeCycleId') !== giftcardPayment.giftCardCycleId) {
                    throw new HttpsError(
                        'failed-precondition',
                        'Esta gift card ya fue reutilizada: vuelve a escanearla.',
                    );
                }
                giftCardIssueSnap = await tx.get(
                    db.doc(`giftCardIssues/${giftcardPayment.giftCardCycleId}`),
                );
                if (
                    !giftCardIssueSnap.exists ||
                    giftCardIssueSnap.get('status') !== 'active' ||
                    giftCardIssueSnap.get('cycleNumber') !== giftCardSnap.get('cycleNumber')
                ) {
                    throw new HttpsError(
                        'failed-precondition',
                        'Esta gift card ya fue reutilizada: vuelve a escanearla.',
                    );
                }
            }

            const saleItems: {
                productId: string;
                code: string;
                name: string;
                unitPriceCents: number;
                quantity: number;
                subtotalCents: number;
            }[] = [];

            for (let i = 0; i < items.length; i++) {
                const snap = productSnaps[i];
                if (!snap.exists) {
                    throw new HttpsError(
                        'not-found',
                        'Uno de los productos de la venta ya no existe.',
                    );
                }
                if (snap.get('isActive') !== true) {
                    throw new HttpsError(
                        'failed-precondition',
                        `El producto "${snap.get('name')}" no está disponible para la venta.`,
                    );
                }

                const quantity = items[i].quantity;
                const stock = snap.get('stock') as number;
                if (!allowSaleWithoutStock && stock < quantity) {
                    throw new HttpsError(
                        'failed-precondition',
                        `Stock insuficiente para "${snap.get('name')}".`,
                    );
                }

                const unitPriceCents = assertSafeIntegerCents(
                    snap.get('priceCents') as number,
                    'products.priceCents',
                );
                saleItems.push({
                    productId: snap.id,
                    code: snap.get('code') as string,
                    name: snap.get('name') as string,
                    unitPriceCents,
                    quantity,
                    subtotalCents: assertSafeIntegerCents(
                        unitPriceCents * quantity,
                        'items[].subtotalCents',
                    ),
                });
            }

            const totalCents = assertSafeIntegerCents(
                saleItems.reduce((sum, item) => sum + item.subtotalCents, 0),
                'sale.totalCents',
            );

            // Consumo TOTAL, sin saldo remanente (plan §16.2, E3/E4): el
            // monto aplicado nunca lo decide el cliente — se recalcula desde
            // el `amountCents` real de la tarjeta. Si la compra alcanza o
            // supera el valor de la tarjeta, se aplica el valor completo (el
            // resto, si sobra compra, se cubre con el segundo pago cash/qr);
            // si la compra es menor, se aplica solo lo que cubre la compra y
            // el resto se pierde como `forfeit` (plan §16.3, filas 4'/4'').
            let giftCardAppliedCents = 0;
            let giftCardForfeitCents = 0;
            if (giftcardPayment && giftCardSnap) {
                const cardAmountCents = giftCardSnap.get('amountCents') as number;
                giftCardAppliedCents = Math.min(cardAmountCents, totalCents);
                giftCardForfeitCents = cardAmountCents - giftCardAppliedCents;
                if (giftcardPayment.amountCents !== giftCardAppliedCents) {
                    throw new HttpsError(
                        'failed-precondition',
                        'El monto de la gift card no coincide con el total de la venta. Vuelve a intentar.',
                    );
                }
            }

            const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
            if (paidCents !== totalCents) {
                throw new HttpsError(
                    'failed-precondition',
                    'El monto pagado no coincide con el total de la venta. Vuelve a intentar.',
                );
            }

            const cashCents = assertSafeIntegerCents(
                payments
                    .filter((p) => p.method === 'cash')
                    .reduce((sum, p) => sum + p.amountCents, 0),
                'sale.cashCents',
            );
            const qrCents = assertSafeIntegerCents(
                payments
                    .filter((p) => p.method === 'qr')
                    .reduce((sum, p) => sum + p.amountCents, 0),
                'sale.qrCents',
            );
            const paymentMethods = Array.from(new Set(payments.map((p) => p.method)));

            const { dateKey, monthKey, year } = dateKeys(new Date(), timezone);
            const totalItems = saleItems.reduce((sum, item) => sum + item.quantity, 0);
            const summaryRef = db.doc(`dailySummaries/${dateKey}`);
            const summarySnap = await tx.get(summaryRef);

            // A partir de aquí solo escrituras (Firestore exige que todas las
            // lecturas de la transacción precedan a las escrituras).
            tx.create(saleRef, {
                sellerId: request.auth!.uid,
                sellerName: `${sellerSnap.get('firstName')} ${sellerSnap.get('lastName')}`.trim(),
                items: saleItems,
                totalCents,
                payments: payments.map((p) => {
                    if (p.method === 'qr') {
                        return { method: p.method, amountCents: p.amountCents, voucherStatus: 'pending' };
                    }
                    if (p.method === 'giftcard') {
                        return {
                            method: p.method,
                            amountCents: p.amountCents,
                            giftCardId: p.giftCardId,
                            giftCardCode: p.giftCardId,
                            giftCardCycleNumber: giftCardSnap!.get('cycleNumber') as number,
                            giftCardCycleId: p.giftCardCycleId,
                            giftCardForfeitedCents: giftCardForfeitCents,
                        };
                    }
                    return { method: p.method, amountCents: p.amountCents };
                }),
                paymentMethods,
                cashCents,
                qrCents,
                giftCardCents: giftCardAppliedCents,
                ...(customerName ? { customerName } : {}),
                status: 'completed',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                dateKey,
                monthKey,
                year,
            });

            for (let i = 0; i < items.length; i++) {
                tx.update(productRefs[i], {
                    stock: FieldValue.increment(-items[i].quantity),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }

            // Redención de la gift card (plan §22, prompt §22): TODO en esta
            // misma transacción — la venta, el descuento de stock, el cierre
            // del ciclo y la devolución del plástico a AVAILABLE nacen o
            // fallan juntos. Dos cajas que intenten usar el mismo ciclo a la
            // vez nunca pueden tener éxito las dos: la segunda pierde la
            // carrera de la transacción (Firestore reintenta con una lectura
            // fresca de `activeCycleId`, que ya no coincide) o, si llega a
            // ejecutarse igual, la comprobación de arriba la rechaza.
            if (giftcardPayment && giftCardRef && giftCardSnap && giftCardIssueSnap) {
                const cycleId = giftcardPayment.giftCardCycleId!;
                const cycleNumber = giftCardSnap.get('cycleNumber') as number;
                const issueRef = db.doc(`giftCardIssues/${cycleId}`);

                tx.update(giftCardRef, {
                    status: 'AVAILABLE',
                    activeCycleId: null,
                    currentBuyerName: null,
                    activatedAt: null,
                    activatedBy: null,
                    activatedByName: null,
                    updatedAt: FieldValue.serverTimestamp(),
                });
                tx.update(issueRef, {
                    status: 'redeemed',
                    redeemedAt: FieldValue.serverTimestamp(),
                    saleId,
                    redeemedAmountCents: giftCardAppliedCents,
                    forfeitedAmountCents: giftCardForfeitCents,
                    closedAt: FieldValue.serverTimestamp(),
                });
                tx.create(db.collection('giftCardMovements').doc(), {
                    giftCardId: giftcardPayment.giftCardId,
                    codeSnapshot: giftcardPayment.giftCardId,
                    amountCents: giftCardAppliedCents,
                    cycleNumber,
                    cycleId,
                    type: 'REDEEMED' as const,
                    createdAt: FieldValue.serverTimestamp(),
                    performedBy: request.auth!.uid,
                    performedByName: `${sellerSnap.get('firstName')} ${sellerSnap.get('lastName')}`.trim(),
                    buyerNameSnapshot: giftCardIssueSnap.get('buyerName') ?? null,
                    saleId,
                    reason: null,
                });
                if (giftCardForfeitCents > 0) {
                    tx.create(db.collection('giftCardMovements').doc(), {
                        giftCardId: giftcardPayment.giftCardId,
                        codeSnapshot: giftcardPayment.giftCardId,
                        amountCents: giftCardForfeitCents,
                        cycleNumber,
                        cycleId,
                        type: 'FORFEITED' as const,
                        createdAt: FieldValue.serverTimestamp(),
                        performedBy: request.auth!.uid,
                        performedByName: `${sellerSnap.get('firstName')} ${sellerSnap.get('lastName')}`.trim(),
                        buyerNameSnapshot: giftCardIssueSnap.get('buyerName') ?? null,
                        saleId,
                        reason: null,
                    });
                }
            }

            if (!summarySnap.exists) {
                const products: Record<string, unknown> = {};
                for (const item of saleItems) {
                    products[item.productId] = {
                        code: item.code,
                        name: item.name,
                        qty: item.quantity,
                        totalCents: item.subtotalCents,
                    };
                }
                tx.create(summaryRef, {
                    dateKey,
                    monthKey,
                    year,
                    salesCount: 1,
                    itemsCount: totalItems,
                    totalCents,
                    cashCents,
                    qrCents,
                    giftCardCents: giftCardAppliedCents,
                    giftCardsIssuedCents: 0,
                    giftCardForfeitedCents: giftCardForfeitCents,
                    giftCardIssuesCashCents: 0,
                    giftCardIssuesQrCents: 0,
                    products,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            } else {
                // Los campos `*Cents` se leen y se suman aquí mismo, en vez de
                // `FieldValue.increment()` — ver el comentario de
                // `assertSafeIntegerCents` sobre por qué el incremento de un
                // campo de dinero puede degradar a `doubleValue`.
                const newTotalCents = assertSafeIntegerCents(
                    ((summarySnap.get('totalCents') as number) ?? 0) + totalCents,
                    'dailySummaries.totalCents',
                );
                const newCashCents = assertSafeIntegerCents(
                    ((summarySnap.get('cashCents') as number) ?? 0) + cashCents,
                    'dailySummaries.cashCents',
                );
                const newQrCents = assertSafeIntegerCents(
                    ((summarySnap.get('qrCents') as number) ?? 0) + qrCents,
                    'dailySummaries.qrCents',
                );
                const newGiftCardCents = assertSafeIntegerCents(
                    ((summarySnap.get('giftCardCents') as number) ?? 0) + giftCardAppliedCents,
                    'dailySummaries.giftCardCents',
                );
                const newGiftCardForfeitedCents = assertSafeIntegerCents(
                    ((summarySnap.get('giftCardForfeitedCents') as number) ?? 0) +
                        giftCardForfeitCents,
                    'dailySummaries.giftCardForfeitedCents',
                );

                const update: Record<string, unknown> = {
                    salesCount: FieldValue.increment(1),
                    itemsCount: FieldValue.increment(totalItems),
                    totalCents: newTotalCents,
                    cashCents: newCashCents,
                    qrCents: newQrCents,
                    giftCardCents: newGiftCardCents,
                    giftCardForfeitedCents: newGiftCardForfeitedCents,
                    updatedAt: FieldValue.serverTimestamp(),
                };
                for (const item of saleItems) {
                    const existing = summarySnap.get(`products.${item.productId}`) as
                        | { totalCents?: number }
                        | undefined;
                    const newProductTotalCents = assertSafeIntegerCents(
                        (existing?.totalCents ?? 0) + item.subtotalCents,
                        `dailySummaries.products.${item.productId}.totalCents`,
                    );
                    update[`products.${item.productId}.code`] = item.code;
                    update[`products.${item.productId}.name`] = item.name;
                    update[`products.${item.productId}.qty`] = FieldValue.increment(item.quantity);
                    update[`products.${item.productId}.totalCents`] = newProductTotalCents;
                }
                tx.update(summaryRef, update);
            }
        });
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        const code = (error as { code?: number | string })?.code;
        if (code === 6 || code === 'already-exists') {
            throw new HttpsError('already-exists', 'Esta venta ya fue registrada.');
        }
        throw new HttpsError('internal', 'No se pudo registrar la venta. Intenta nuevamente.');
    }

    return { saleId };
});

/**
 * Anula una venta (plan §15.4, solo admin): devuelve el stock, revierte los
 * totales del resumen diario y marca `status: 'cancelled'` — nunca borra ni
 * edita los datos originales de la venta.
 *
 * Gift card (Fase 6, prompt §31): si la venta se pagó (total o parcialmente)
 * con una gift card, la anulación solo se revierte cuando el ciclo que esa
 * venta redimió sigue EXACTAMENTE como la redención lo dejó — la tarjeta
 * AVAILABLE, sin ninguna activación posterior. Si la tarjeta ya se volvió a
 * vender (nuevo ciclo, `cycleNumber` avanzado), la anulación completa se
 * RECHAZA — nada se anula, ni el stock — para no arriesgarse a pisar el
 * ciclo de otro comprador. Ver el comentario largo dentro de la función.
 */
export const cancelSale = onCall<CancelSaleData>({ region: REGION }, async (request) => {
    const adminSnap = await assertAdmin(request.auth);
    const adminName = `${adminSnap.get('firstName')} ${adminSnap.get('lastName')}`.trim();

    const saleId = requireDocId(request.data.saleId, 'saleId');
    const reason = request.data.reason;
    if (typeof reason !== 'string' || !reason.trim()) {
        throw new HttpsError('invalid-argument', 'Escribe un motivo de anulación.');
    }
    const cancelReason = reason.trim().slice(0, MAX_CANCEL_REASON_LENGTH);

    const saleRef = db.doc(`sales/${saleId}`);

    await db.runTransaction(async (tx) => {
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists) {
            throw new HttpsError('not-found', 'Venta no encontrada.');
        }
        if (saleSnap.get('status') !== 'completed') {
            throw new HttpsError('failed-precondition', 'Esta venta ya fue anulada.');
        }

        const items = (saleSnap.get('items') as {
            productId: string;
            quantity: number;
        }[]) ?? [];
        const productRefs = items.map((item) => db.doc(`products/${item.productId}`));
        const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

        const dateKey = saleSnap.get('dateKey') as string;
        const summaryRef = db.doc(`dailySummaries/${dateKey}`);
        const summarySnap = await tx.get(summaryRef);

        // Gift card involucrada (Fase 6, prompt §31): el plan original
        // (§15.4) revertía siempre "la emisión vuelve a 'active'", una regla
        // escrita ANTES de que el cliente confirmara que las tarjetas son
        // reutilizables. Con reutilización real, reabrir a ciegas el ciclo
        // que esta venta redimió podría pisar un ciclo POSTERIOR de otro
        // comprador (dinero fantasma). Decisión tomada con el cliente en
        // vivo: si el ciclo sigue exactamente como esta venta lo dejó —la
        // tarjeta AVAILABLE, sin reactivar desde entonces— se revierte con
        // seguridad; si no, la anulación completa se RECHAZA (no se anula
        // nada, ni siquiera el stock) y hay que resolverlo manualmente.
        const giftcardPaymentEntry = (
            (saleSnap.get('payments') as
                | {
                      method: string;
                      amountCents: number;
                      giftCardId?: string;
                      giftCardCycleId?: string;
                      giftCardCycleNumber?: number;
                      giftCardForfeitedCents?: number;
                  }[]
                | undefined) ?? []
        ).find((p) => p.method === 'giftcard');

        let giftCardRevert: {
            cardRef: FirebaseFirestore.DocumentReference;
            issueRef: FirebaseFirestore.DocumentReference;
            issueSnap: FirebaseFirestore.DocumentSnapshot;
            appliedCents: number;
            forfeitedCents: number;
        } | null = null;

        if (giftcardPaymentEntry?.giftCardId && giftcardPaymentEntry.giftCardCycleId) {
            const cardRef = db.doc(`giftCards/${giftcardPaymentEntry.giftCardId}`);
            const issueRef = db.doc(`giftCardIssues/${giftcardPaymentEntry.giftCardCycleId}`);
            const [cardSnap, issueSnap] = await Promise.all([tx.get(cardRef), tx.get(issueRef)]);

            const safeToRevert =
                cardSnap.exists &&
                cardSnap.get('status') === 'AVAILABLE' &&
                cardSnap.get('activeCycleId') === null &&
                cardSnap.get('cycleNumber') === giftcardPaymentEntry.giftCardCycleNumber &&
                issueSnap.exists &&
                issueSnap.get('status') === 'redeemed' &&
                issueSnap.get('saleId') === saleId;

            if (!safeToRevert) {
                throw new HttpsError(
                    'failed-precondition',
                    'No se puede anular: la gift card usada en esta venta ya se reutilizó en otro ' +
                        'ciclo. Resuélvelo manualmente (contacta al administrador del sistema).',
                );
            }

            giftCardRevert = {
                cardRef,
                issueRef,
                issueSnap,
                appliedCents: giftcardPaymentEntry.amountCents,
                forfeitedCents: giftcardPaymentEntry.giftCardForfeitedCents ?? 0,
            };
        }

        // Solo escrituras de aquí en adelante.
        tx.update(saleRef, {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledBy: request.auth!.uid,
            cancelReason,
            updatedAt: FieldValue.serverTimestamp(),
        });

        for (let i = 0; i < items.length; i++) {
            if (!productSnaps[i].exists) continue; // soft delete: no debería pasar nunca
            tx.update(productRefs[i], {
                stock: FieldValue.increment(items[i].quantity),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }

        if (giftCardRevert) {
            const cycleNumber = giftCardRevert.issueSnap.get('cycleNumber') as number;
            const cycleId = giftCardRevert.issueRef.id;
            const buyerName = (giftCardRevert.issueSnap.get('buyerName') as string | null) ?? null;

            tx.update(giftCardRevert.cardRef, {
                status: 'ACTIVE',
                activeCycleId: cycleId,
                currentBuyerName: buyerName,
                activatedAt: giftCardRevert.issueSnap.get('activatedAt'),
                activatedBy: giftCardRevert.issueSnap.get('activatedBy'),
                activatedByName: giftCardRevert.issueSnap.get('activatedByName'),
                updatedAt: FieldValue.serverTimestamp(),
            });
            tx.update(giftCardRevert.issueRef, {
                status: 'active',
                redeemedAt: null,
                saleId: null,
                redeemedAmountCents: null,
                forfeitedAmountCents: null,
                closedAt: null,
            });
            tx.create(db.collection('giftCardMovements').doc(), {
                giftCardId: giftcardPaymentEntry!.giftCardId,
                codeSnapshot: giftcardPaymentEntry!.giftCardId,
                amountCents: giftCardRevert.appliedCents,
                cycleNumber,
                cycleId,
                type: 'ADJUSTMENT' as const,
                createdAt: FieldValue.serverTimestamp(),
                performedBy: request.auth!.uid,
                performedByName: adminName,
                buyerNameSnapshot: buyerName,
                saleId,
                reason: `Reversión por anulación de venta: ${cancelReason}`,
            });
        }

        if (summarySnap.exists) {
            // Los montos de la venta original ya se guardaron como enteros
            // seguros (mismo camino de `createSale`), pero se vuelven a
            // afirmar aquí porque son la base de una resta que se persiste.
            const saleTotalCents = assertSafeIntegerCents(
                saleSnap.get('totalCents') as number,
                'sale.totalCents',
            );
            const saleCashCents = assertSafeIntegerCents(
                saleSnap.get('cashCents') as number,
                'sale.cashCents',
            );
            const saleQrCents = assertSafeIntegerCents(
                saleSnap.get('qrCents') as number,
                'sale.qrCents',
            );
            const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

            // Igual que en `createSale`: los campos `*Cents` se leen y se
            // restan aquí mismo en vez de `FieldValue.increment(-n)` — ver
            // `assertSafeIntegerCents`.
            const newTotalCents = assertSafeIntegerCents(
                ((summarySnap.get('totalCents') as number) ?? 0) - saleTotalCents,
                'dailySummaries.totalCents',
            );
            const newCashCents = assertSafeIntegerCents(
                ((summarySnap.get('cashCents') as number) ?? 0) - saleCashCents,
                'dailySummaries.cashCents',
            );
            const newQrCents = assertSafeIntegerCents(
                ((summarySnap.get('qrCents') as number) ?? 0) - saleQrCents,
                'dailySummaries.qrCents',
            );

            const update: Record<string, unknown> = {
                salesCount: FieldValue.increment(-1),
                itemsCount: FieldValue.increment(-totalItems),
                totalCents: newTotalCents,
                cashCents: newCashCents,
                qrCents: newQrCents,
                updatedAt: FieldValue.serverTimestamp(),
            };

            if (giftCardRevert) {
                const newGiftCardCents = assertSafeIntegerCents(
                    ((summarySnap.get('giftCardCents') as number) ?? 0) - giftCardRevert.appliedCents,
                    'dailySummaries.giftCardCents',
                );
                const newGiftCardForfeitedCents = assertSafeIntegerCents(
                    ((summarySnap.get('giftCardForfeitedCents') as number) ?? 0) -
                        giftCardRevert.forfeitedCents,
                    'dailySummaries.giftCardForfeitedCents',
                );
                update['giftCardCents'] = newGiftCardCents;
                update['giftCardForfeitedCents'] = newGiftCardForfeitedCents;
            }
            for (const item of saleSnap.get('items') as {
                productId: string;
                quantity: number;
                subtotalCents: number;
            }[]) {
                const existing = summarySnap.get(`products.${item.productId}`) as
                    | { totalCents?: number }
                    | undefined;
                const newProductTotalCents = assertSafeIntegerCents(
                    (existing?.totalCents ?? 0) - item.subtotalCents,
                    `dailySummaries.products.${item.productId}.totalCents`,
                );
                update[`products.${item.productId}.qty`] = FieldValue.increment(-item.quantity);
                update[`products.${item.productId}.totalCents`] = newProductTotalCents;
            }
            tx.update(summaryRef, update);
        }
    });

    return { saleId, status: 'cancelled' as const };
});

/**
 * Verifica que `saleId`/`paymentIndex` admitan un voucher nuevo: la venta
 * existe, quien llama es su dueño (o admin), sigue `completed`, el pago en
 * ese índice es `qr`, y todavía no tiene `voucherStatus: 'uploaded'`.
 * Se llama DOS veces desde `attachVoucher` — antes de subir el archivo (para
 * no gastar una subida en algo que se va a rechazar) y otra vez dentro de la
 * transacción que escribe la metadata (por si algo cambió entre medio) —
 * así que vive en una sola función en vez de duplicar los cinco chequeos.
 */
function assertVoucherAttachable(
    saleSnap: FirebaseFirestore.DocumentSnapshot,
    paymentIndex: number,
    role: string,
    uid: string,
): Record<string, unknown>[] {
    if (!saleSnap.exists) {
        throw new HttpsError('not-found', 'Venta no encontrada.');
    }
    if (role !== 'admin' && saleSnap.get('sellerId') !== uid) {
        throw new HttpsError(
            'permission-denied',
            'Solo puedes adjuntar comprobantes de tus propias ventas.',
        );
    }
    if (saleSnap.get('status') !== 'completed') {
        throw new HttpsError(
            'failed-precondition',
            'No se puede adjuntar un comprobante a una venta anulada.',
        );
    }
    const payments = (saleSnap.get('payments') as Record<string, unknown>[]) ?? [];
    const payment = payments[paymentIndex];
    if (!payment || payment.method !== 'qr') {
        throw new HttpsError('failed-precondition', 'Ese pago no es un pago por QR.');
    }
    if (payment.voucherStatus === 'uploaded') {
        throw new HttpsError(
            'already-exists',
            'Este pago ya tiene un comprobante adjunto: no se puede reemplazar.',
        );
    }
    return payments;
}

/**
 * Adjunta el comprobante de un pago QR (plan §21, Fase 5). El voucher es
 * OPCIONAL: `createSale` nunca lo exige (decisión de negocio explícita que
 * prevalece sobre cualquier lectura anterior del plan) — `attachVoucher` solo
 * existe para asociar, cuando el vendedor lo tenga a mano, la evidencia de un
 * pago que la venta ya registró como completo.
 *
 * SUBE el archivo a Storage ella misma, vía Admin SDK (`storage.bucket()`),
 * en vez de que el cliente suba directo y esta Function solo valide la
 * metadata después. Cambio de diseño hecho en vivo durante la auditoría de
 * seguridad de la Fase 5: la versión anterior dependía de Storage Rules con
 * `firestore.get()` para verificar que `sales/{saleId}.sellerId` fuera quien
 * sube — esa función de Storage Rules (cross-service rules) compiló y
 * desplegó sin error, pero SIEMPRE denegó en este proyecto (probablemente
 * falta el binding de IAM `firebaserules.firestoreServiceAgent` que Firebase
 * normalmente auto-aprovisiona). Subir vía Admin SDK evita depender de esa
 * pieza de infraestructura por completo: la autorización real ocurre aquí,
 * ANTES de tocar Storage, sobre el propio documento de la venta — ni
 * siquiera existe una ventana en la que un archivo no autorizado pueda
 * llegar a `qr-vouchers/`. `sales` sigue con `allow write: if false` en las
 * Rules: esta Function solo toca el sub-objeto del voucher dentro de
 * `payments[]`, nunca `totalCents`, `items`, `sellerId` ni ningún otro campo.
 *
 * Inmutable por diseño (plan §15, Fase 5): si `voucherStatus` ya es
 * `'uploaded'`, se rechaza — un comprobante adjunto no se reemplaza ni se
 * borra. `qr-vouchers/` en Storage Rules ahora es `allow write: if false`
 * sin excepciones: el cliente NUNCA escribe ahí directo, solo esta Function
 * (Admin SDK), así que no hace falta ninguna condición de propiedad en la
 * Rule — ya no hay ninguna vía de escritura de cliente a la que aplicarla.
 */
export const attachVoucher = onCall<AttachVoucherData>({ region: REGION }, async (request) => {
    const staffSnap = await assertActive(request.auth);
    const role = staffSnap.get('role') as string;
    if (role !== 'admin' && role !== 'user') {
        throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }
    const uid = request.auth!.uid;

    const saleId = requireDocId(request.data.saleId, 'saleId');

    const paymentIndex = request.data.paymentIndex;
    if (typeof paymentIndex !== 'number' || !Number.isInteger(paymentIndex) || paymentIndex < 0) {
        throw new HttpsError('invalid-argument', 'Índice de pago inválido.');
    }

    const contentType = request.data.contentType;
    const extension = VOUCHER_EXTENSION_BY_MIME[contentType as string];
    if (!extension) {
        throw new HttpsError('invalid-argument', 'Formato de imagen no admitido.');
    }

    const fileBase64 = request.data.fileBase64;
    if (typeof fileBase64 !== 'string' || !fileBase64) {
        throw new HttpsError('invalid-argument', 'Falta el archivo del comprobante.');
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_VOUCHER_BYTES) {
        throw new HttpsError('invalid-argument', 'El comprobante debe pesar menos de 3 MB.');
    }

    const saleRef = db.doc(`sales/${saleId}`);

    // Autorización PRIMERO, sin tocar Storage todavía: evita gastar una
    // subida en un archivo que de todas formas se va a rechazar.
    const preCheckSnap = await saleRef.get();
    assertVoucherAttachable(preCheckSnap, paymentIndex, role, uid);

    // `firebaseStorageDownloadTokens` es el mecanismo que usa
    // `getDownloadURL()` del SDK de cliente — el Admin SDK no lo genera
    // solo, así que se agrega a mano para que "Ver comprobante" siga
    // funcionando exactamente igual que con una subida de cliente.
    const voucherPath = `qr-vouchers/${saleId}/${Date.now()}.${extension}`;
    const downloadToken = randomUUID();
    const bucket = storage.bucket();
    const file = bucket.file(voucherPath);
    await file.save(buffer, {
        contentType,
        metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
    });
    const voucherUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
        `${encodeURIComponent(voucherPath)}?alt=media&token=${downloadToken}`;

    try {
        await db.runTransaction(async (tx) => {
            const saleSnap = await tx.get(saleRef);
            const payments = assertVoucherAttachable(saleSnap, paymentIndex, role, uid);

            // `FieldValue.serverTimestamp()` no se admite dentro de un
            // elemento de arreglo (Firestore lo rechaza en tiempo de
            // ejecución) — por eso `voucherUploadedAt` usa `Timestamp.now()`,
            // un valor normal, en vez del sentinel que sí funciona en campos
            // de nivel superior como `updatedAt`.
            const updatedPayments = payments.map((p, index) =>
                index === paymentIndex
                    ? {
                          ...p,
                          voucherStatus: 'uploaded',
                          voucherPath,
                          voucherUrl,
                          voucherUploadedAt: Timestamp.now(),
                          voucherUploadedBy: uid,
                      }
                    : p,
            );

            tx.update(saleRef, {
                payments: updatedPayments,
                updatedAt: FieldValue.serverTimestamp(),
            });
        });
    } catch (error) {
        // Carrera perdida entre el pre-check y este commit (rara a esta
        // escala, pero posible): el archivo recién subido queda huérfano.
        // A diferencia de una subida directa del cliente, el Admin SDK SÍ
        // puede limpiarlo — Storage Rules no le aplica a estas llamadas.
        await file.delete().catch(() => undefined);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'No se pudo adjuntar el comprobante. Intenta nuevamente.');
    }

    return { saleId };
});
