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

type PaymentMethod = 'cash' | 'qr';
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'qr'];

interface CreateSaleItemInput {
    productId: string;
    quantity: number;
}

interface CreateSalePaymentInput {
    method: PaymentMethod;
    amountCents: number;
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

    return value.map((raw) => {
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
        return { method: method as PaymentMethod, amountCents };
    });
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
        await db.runTransaction(async (tx) => {
            const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

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
                payments: payments.map((p) =>
                    p.method === 'qr'
                        ? { method: p.method, amountCents: p.amountCents, voucherStatus: 'pending' }
                        : { method: p.method, amountCents: p.amountCents },
                ),
                paymentMethods,
                cashCents,
                qrCents,
                giftCardCents: 0,
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
                    giftCardCents: 0,
                    giftCardsIssuedCents: 0,
                    giftCardForfeitedCents: 0,
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

                const update: Record<string, unknown> = {
                    salesCount: FieldValue.increment(1),
                    itemsCount: FieldValue.increment(totalItems),
                    totalCents: newTotalCents,
                    cashCents: newCashCents,
                    qrCents: newQrCents,
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
 */
export const cancelSale = onCall<CancelSaleData>({ region: REGION }, async (request) => {
    await assertAdmin(request.auth);

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
