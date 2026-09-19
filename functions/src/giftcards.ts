import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './admin';
import { assertActive, assertAdmin } from './guards';
import { dateKeys } from './date-keys';
import { normalizeGiftCardCode } from './normalize';

/**
 * Cloud Functions de Gift Cards (Fase 6, docs/architecture/mi-pimpollito-plan.md
 * §16, actualizado por la nueva información confirmada por el cliente en el
 * prompt de la Fase 6 — ver el comentario largo en `sales.ts` sobre el pago
 * `giftcard` para la mitad de la historia que vive del lado de `createSale`).
 *
 * DECISIÓN DE ESTA FASE — denominación fija, no importe libre. El plan
 * original (§16.2, E2) asumía "importes libres, con decimales", pensado para
 * tarjetas de plástico virgen donde el vendedor decide el monto al vender.
 * El cliente confirmó en vivo que las tarjetas las imprime una imprenta
 * externa con la denominación YA IMPRESA (100/500/1000 Bs...): el monto se
 * fija UNA VEZ, al registrar la tarjeta física, no en cada activación. Es
 * información nueva que prevalece sobre el E2 original (instrucción explícita
 * del prompt) — se documenta el cambio en el plan (§16.2, §8.8).
 *
 * Se mantiene sin cambios la arquitectura de tres colecciones que el plan ya
 * había aprobado (§16.1) porque sigue respondiendo exactamente las mismas
 * tres preguntas:
 *   - `giftCards/{cardCode}`      el PLÁSTICO — reutilizable, con el estado
 *                                 visible en 1 lectura (AVAILABLE | ACTIVE |
 *                                 SUSPENDED | CANCELLED) y el puntero
 *                                 `activeCycleId` al ciclo vigente.
 *   - `giftCardIssues/{issueId}`  un CICLO de uso (antes "emisión"): nace en
 *                                 `activateGiftCard`, vive mientras la
 *                                 tarjeta está ACTIVE/SUSPENDED, y se cierra
 *                                 al redimirse (dentro de `createSale`) o al
 *                                 cancelarse. El nombre de colección no
 *                                 cambia (evita una migración de Rules e
 *                                 índices sin necesidad); el campo nuevo
 *                                 `cycleNumber` es el identificador legible
 *                                 del ciclo que pidió el cliente.
 *   - `giftCardMovements/{id}`    el LIBRO MAYOR, append-only: un evento por
 *                                 cada transición de estado, con snapshot de
 *                                 comprador/venta/ciclo — nunca se sobrescribe
 *                                 ni se borra.
 *
 * `cycleNumber`/`activeCycleId` son el mecanismo anti-carrera que el cliente
 * pidió explícitamente (prompt §7, §23, §44): cada activación genera un
 * `issueId` nuevo (auto-ID de Firestore, ya único por construcción) y avanza
 * `cycleNumber`. Una operación que todavía referencia un `activeCycleId`
 * viejo se rechaza porque `giftCards.activeCycleId` ya apunta a otro id — es
 * exactamente el mismo patrón de "el servidor recalcula, no confía" que ya
 * usa `createSale` con `unitPriceCents` (plan §15.3).
 *
 * Solo estas Functions escriben `giftCards`/`giftCardIssues`/
 * `giftCardMovements` — las Rules cierran `allow write: if false` en las
 * tres (prompt §17, §35): ni un admin puede cambiar un `status`, un
 * `amountCents` o crear un movimiento a mano desde la consola.
 *
 * AJUSTE POSTERIOR A LA FASE 6 (sin abrir una fase nueva) — `codeMode`:
 * hasta ahora `registerGiftCard`/`registerGiftCardBatch` solo aceptaban un
 * código YA IMPRESO por la imprenta (modo `'manual'`, sin cambios: sigue
 * siendo exactamente el mismo flujo). Se añade un segundo modo,
 * `'generated'`, para cuando la tienda necesita generar ella misma el
 * código de una tarjeta física nueva (imprenta distinta, numeración propia
 * agotada, etc.) — ver `reserveGeneratedCodes()` más abajo para el porqué
 * de cada decisión. Ninguna de las dos Functions existentes se duplicó: el
 * modo es un parámetro más, como ya sugería el propio requerimiento
 * ("preferiblemente extender, no crear Functions redundantes").
 */
const REGION = 'southamerica-west1';

const MAX_CODE_LENGTH = 40;
const CODE_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;
const MAX_CODES_PER_BATCH = 50;
const MAX_AMOUNT_CENTS = Number.MAX_SAFE_INTEGER;
const MAX_BUYER_NAME_LENGTH = 120;
const MAX_REASON_LENGTH = 300;

/**
 * Techo defensivo de intentos al buscar el siguiente código libre de una
 * denominación (ver `reserveGeneratedCodes`). A esta escala (20-40 tarjetas
 * iniciales, unas pocas denominaciones) nunca se acerca ni de lejos — existe
 * solo para que una denominación corrupta a mano no cuelgue la Function en
 * un bucle infinito.
 */
const MAX_GENERATION_ATTEMPTS = 10000;

type IssuePaymentMethod = 'cash' | 'qr';
const ISSUE_PAYMENT_METHODS: IssuePaymentMethod[] = ['cash', 'qr'];

type GiftCardCodeMode = 'manual' | 'generated';

interface IssuePaymentInput {
    method: IssuePaymentMethod;
    amountCents: number;
}

interface RegisterGiftCardData {
    /** Solo en modo `'manual'` (por defecto si se omite `codeMode`). */
    code?: string;
    amountCents: number;
    codeMode?: GiftCardCodeMode;
}

interface RegisterGiftCardBatchData {
    amountCents: number;
    codeMode?: GiftCardCodeMode;
    /** Solo en modo `'manual'` (por defecto si se omite `codeMode`). */
    codes?: string[];
    /** Solo en modo `'generated'`: cuántos códigos nuevos generar. */
    quantity?: number;
}

interface ActivateGiftCardData {
    code: string;
    buyerName?: string;
    payments: IssuePaymentInput[];
}

interface SuspendGiftCardData {
    code: string;
    reason: string;
}

interface ReactivateGiftCardData {
    code: string;
}

interface CancelGiftCardData {
    code: string;
    reason: string;
}

function requireCode(value: unknown, field = 'code'): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpsError('invalid-argument', `El campo "${field}" es inválido.`);
    }
    const normalized = normalizeGiftCardCode(value);
    if (!CODE_PATTERN.test(normalized) || normalized === '.' || normalized === '..') {
        throw new HttpsError(
            'invalid-argument',
            `El código "${value}" no es válido (letras, números, "." "_" "-", máx. ${MAX_CODE_LENGTH} caracteres).`,
        );
    }
    return normalized;
}

function requireAmountCents(value: unknown, field = 'amountCents'): number {
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > MAX_AMOUNT_CENTS
    ) {
        throw new HttpsError('invalid-argument', `El campo "${field}" es inválido.`);
    }
    return value;
}

function requireCodeMode(value: unknown): GiftCardCodeMode {
    if (value === undefined || value === null) return 'manual'; // default: comportamiento sin cambios
    if (value === 'manual' || value === 'generated') return value;
    throw new HttpsError('invalid-argument', 'El modo de código no es válido.');
}

function requireBatchQuantity(value: unknown): number {
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > MAX_CODES_PER_BATCH
    ) {
        throw new HttpsError(
            'invalid-argument',
            `La cantidad debe ser un número entero entre 1 y ${MAX_CODES_PER_BATCH}.`,
        );
    }
    return value;
}

/**
 * Denominación legible para el código generado (requerimiento §1): el monto
 * en bolivianos, sin decimales cuando es un entero — el caso real de todas
 * las denominaciones fijas del cliente (50/100/250/500/1000 Bs). Si alguna
 * vez existiera una denominación con centavos, se conserva el decimal en vez
 * de redondearlo en silencio (nunca se pierde información del monto real).
 */
function denominationLabel(amountCents: number): string {
    const bs = amountCents / 100;
    return Number.isInteger(bs) ? String(bs) : bs.toFixed(2);
}

function padSequence(seq: number): string {
    // Mínimo 3 dígitos (requerimiento §1); crece naturalmente más allá de
    // 999 porque `padStart` nunca trunca, solo rellena por la izquierda.
    return String(seq).padStart(3, '0');
}

function buildGeneratedCode(label: string, seq: number): string {
    return `GC${label}-${padSequence(seq)}`;
}

/**
 * Reserva `count` código(s) NUEVOS y únicos para una denominación, dentro de
 * la MISMA transacción del caller (requerimiento §6-§9) — nunca como un paso
 * previo separado: así la generación es atómica de punta a punta y dos
 * pestañas generando a la vez para la misma denominación nunca pueden
 * terminar con el mismo código (Firestore reintenta la transacción que pierde
 * la carrera con una lectura fresca).
 *
 * El contador `giftCardCodeCounters/{denominationLabel}` (uno independiente
 * por denominación, requerimiento §7) es solo de dónde arrancar a buscar —
 * la única fuente de verdad de unicidad sigue siendo `giftCards/{code}`
 * (plan §16.3), exactamente igual que ya hace `registerGiftCard` en modo
 * manual. Por eso cada candidato se verifica contra `giftCards` antes de
 * aceptarlo: si la imprenta ya registró a mano el código que el contador
 * cree que sigue (p. ej. "GC1000-010"), el candidato se descarta sin
 * sobreescribir nada y se prueba el siguiente (requerimiento §8) — lo mismo
 * ocurre naturalmente con una tarjeta CANCELLED, porque su documento sigue
 * existiendo para siempre (nunca se borra), así que su código nunca se
 * reutiliza.
 *
 * Todas las lecturas (`tx.get`) ocurren aquí, antes de que el caller escriba
 * nada — regla de las transacciones de Firestore: todas las lecturas antes
 * que cualquier escritura. El caller es responsable de persistir el contador
 * con `finalSeq` y de crear los documentos de `codes` devueltos.
 */
async function reserveGeneratedCodes(
    tx: FirebaseFirestore.Transaction,
    amountCents: number,
    count: number,
): Promise<{
    codes: string[];
    counterRef: FirebaseFirestore.DocumentReference;
    counterExists: boolean;
    finalSeq: number;
}> {
    const label = denominationLabel(amountCents);
    const counterRef = db.doc(`giftCardCodeCounters/${label}`);
    const counterSnap = await tx.get(counterRef);
    const counterExists = counterSnap.exists;
    let seq = counterExists ? ((counterSnap.get('seq') as number) ?? 0) : 0;

    const codes: string[] = [];
    let attempts = 0;
    while (codes.length < count) {
        attempts++;
        if (attempts > MAX_GENERATION_ATTEMPTS) {
            throw new HttpsError(
                'internal',
                'No se pudo generar un código único para esta denominación. Intenta nuevamente.',
            );
        }
        seq++;
        const candidate = buildGeneratedCode(label, seq);
        const candidateSnap = await tx.get(db.doc(`giftCards/${candidate}`));
        if (!candidateSnap.exists) {
            codes.push(candidate);
        }
    }

    return { codes, counterRef, counterExists, finalSeq: seq };
}

function writeGeneratedCodeCounter(
    tx: FirebaseFirestore.Transaction,
    counterRef: FirebaseFirestore.DocumentReference,
    counterExists: boolean,
    finalSeq: number,
): void {
    if (counterExists) {
        tx.update(counterRef, { seq: finalSeq, updatedAt: FieldValue.serverTimestamp() });
    } else {
        // Nace la primera vez que se genera un código de esta denominación
        // — no requiere una siembra manual previa (a diferencia de
        // `counters/internalCode` de Productos): esta escritura la hace
        // siempre el Admin SDK dentro de la Function, nunca el cliente.
        tx.create(counterRef, {
            seq: finalSeq,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }
}

function requireReason(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpsError('invalid-argument', 'Escribe un motivo.');
    }
    return value.trim().slice(0, MAX_REASON_LENGTH);
}

function optionalBuyerName(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.trim().slice(0, MAX_BUYER_NAME_LENGTH);
}

function validateIssuePayments(value: unknown): IssuePaymentInput[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
        throw new HttpsError(
            'invalid-argument',
            'Indica cómo pagó el comprador la tarjeta (efectivo o QR).',
        );
    }
    return value.map((raw) => {
        const method = (raw as { method?: unknown })?.method;
        if (typeof method !== 'string' || !ISSUE_PAYMENT_METHODS.includes(method as IssuePaymentMethod)) {
            throw new HttpsError('invalid-argument', 'Esa forma de pago no está disponible.');
        }
        const amountCents = (raw as { amountCents?: unknown })?.amountCents;
        if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
            throw new HttpsError('invalid-argument', 'El monto pagado es inválido.');
        }
        return { method: method as IssuePaymentMethod, amountCents };
    });
}

async function assertStaffRole(auth: Parameters<typeof assertActive>[0]) {
    const snap = await assertActive(auth);
    const role = snap.get('role');
    if (role !== 'admin' && role !== 'user') {
        throw new HttpsError('permission-denied', 'Rol no autorizado.');
    }
    return snap;
}

function staffName(snap: FirebaseFirestore.DocumentSnapshot): string {
    return `${snap.get('firstName')} ${snap.get('lastName')}`.trim();
}

/**
 * Registra una tarjeta física nueva (admin, prompt §13, §16). AVAILABLE
 * desde el día 1.
 *
 * `codeMode` (ajuste posterior a la Fase 6, ver comentario de cabecera):
 * - `'manual'` (default si se omite) — SIN CAMBIOS: el código lo trae quien
 *   registra (imprenta), se valida y se rechaza si ya existe.
 * - `'generated'` — el servidor decide el código (`reserveGeneratedCodes`),
 *   dentro de la MISMA transacción que crea la tarjeta: nunca hay una
 *   ventana entre "generar" y "registrar" donde otro código pudiera colarse.
 */
export const registerGiftCard = onCall<RegisterGiftCardData>({ region: REGION }, async (request) => {
    const adminSnap = await assertAdmin(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(adminSnap);

    const amountCents = requireAmountCents(request.data.amountCents);
    const codeMode = requireCodeMode(request.data.codeMode);

    let resultCardCode = '';

    if (codeMode === 'generated') {
        await db.runTransaction(async (tx) => {
            const { codes, counterRef, counterExists, finalSeq } = await reserveGeneratedCodes(
                tx,
                amountCents,
                1,
            );
            const cardCode = codes[0];
            resultCardCode = cardCode;

            writeGeneratedCodeCounter(tx, counterRef, counterExists, finalSeq);
            tx.create(db.doc(`giftCards/${cardCode}`), buildNewCardDoc(cardCode, amountCents, uid, name));
            tx.create(
                db.collection('giftCardMovements').doc(),
                buildRegisteredMovement(cardCode, amountCents, uid, name),
            );
        });
    } else {
        const cardCode = requireCode(request.data.code);
        resultCardCode = cardCode;
        const cardRef = db.doc(`giftCards/${cardCode}`);
        const movementRef = db.collection('giftCardMovements').doc();

        await db.runTransaction(async (tx) => {
            const cardSnap = await tx.get(cardRef);
            if (cardSnap.exists) {
                throw new HttpsError(
                    'already-exists',
                    `El código "${cardCode}" ya está registrado.`,
                );
            }

            tx.create(cardRef, buildNewCardDoc(cardCode, amountCents, uid, name));
            tx.create(movementRef, buildRegisteredMovement(cardCode, amountCents, uid, name));
        });
    }

    return { cardCode: resultCardCode };
});

/**
 * Registra un lote de tarjetas bajo UNA denominación (admin, prompt §13):
 * todo o nada — si un código ya existe (en `giftCards` o repetido dentro del
 * mismo lote), no se crea ninguna. Hasta `MAX_CODES_PER_BATCH` por llamada,
 * de sobra para las 20-40 tarjetas iniciales del cliente.
 *
 * `codeMode` (ajuste posterior a la Fase 6, ver comentario de cabecera):
 * - `'manual'` (default si se omite) — SIN CAMBIOS: `codes` trae la lista.
 * - `'generated'` — `quantity` reemplaza a `codes`: el servidor reserva esa
 *   cantidad de códigos nuevos y únicos de la denominación pedida, dentro de
 *   la misma transacción (`reserveGeneratedCodes`), con las mismas garantías
 *   de todo-o-nada que el modo manual.
 */
export const registerGiftCardBatch = onCall<RegisterGiftCardBatchData>(
    { region: REGION },
    async (request) => {
        const adminSnap = await assertAdmin(request.auth);
        const uid = request.auth!.uid;
        const name = staffName(adminSnap);

        const amountCents = requireAmountCents(request.data.amountCents);
        const codeMode = requireCodeMode(request.data.codeMode);

        if (codeMode === 'generated') {
            const quantity = requireBatchQuantity(request.data.quantity);
            let resultCodes: string[] = [];

            await db.runTransaction(async (tx) => {
                const { codes, counterRef, counterExists, finalSeq } = await reserveGeneratedCodes(
                    tx,
                    amountCents,
                    quantity,
                );
                resultCodes = codes;

                writeGeneratedCodeCounter(tx, counterRef, counterExists, finalSeq);
                for (const code of codes) {
                    tx.create(db.doc(`giftCards/${code}`), buildNewCardDoc(code, amountCents, uid, name));
                    tx.create(
                        db.collection('giftCardMovements').doc(),
                        buildRegisteredMovement(code, amountCents, uid, name),
                    );
                }
            });

            return { cardCodes: resultCodes };
        }

        const rawCodes = request.data.codes;
        if (!Array.isArray(rawCodes) || rawCodes.length < 1 || rawCodes.length > MAX_CODES_PER_BATCH) {
            throw new HttpsError(
                'invalid-argument',
                `El lote debe tener entre 1 y ${MAX_CODES_PER_BATCH} códigos.`,
            );
        }
        const normalizedCodes = rawCodes.map((c) => requireCode(c));
        const seen = new Set<string>();
        for (const code of normalizedCodes) {
            if (seen.has(code)) {
                throw new HttpsError(
                    'invalid-argument',
                    `El código "${code}" está repetido dentro del mismo lote.`,
                );
            }
            seen.add(code);
        }

        const cardRefs = normalizedCodes.map((code) => db.doc(`giftCards/${code}`));

        await db.runTransaction(async (tx) => {
            const cardSnaps = await Promise.all(cardRefs.map((ref) => tx.get(ref)));
            const existing = cardSnaps.find((snap) => snap.exists);
            if (existing) {
                throw new HttpsError(
                    'already-exists',
                    `El código "${existing.id}" ya está registrado: no se creó ninguna tarjeta del lote.`,
                );
            }

            for (let i = 0; i < normalizedCodes.length; i++) {
                tx.create(cardRefs[i], buildNewCardDoc(normalizedCodes[i], amountCents, uid, name));
                tx.create(
                    db.collection('giftCardMovements').doc(),
                    buildRegisteredMovement(normalizedCodes[i], amountCents, uid, name),
                );
            }
        });

        return { cardCodes: normalizedCodes };
    },
);

function buildNewCardDoc(
    cardCode: string,
    amountCents: number,
    uid: string,
    name: string,
) {
    return {
        cardCode,
        amountCents,
        status: 'AVAILABLE' as const,
        cycleNumber: 0,
        activeCycleId: null,
        currentBuyerName: null,
        activatedAt: null,
        activatedBy: null,
        activatedByName: null,
        suspendedAt: null,
        suspendedBy: null,
        suspendedByName: null,
        suspensionReason: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelledByName: null,
        cancelReason: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        createdByName: name,
        updatedAt: FieldValue.serverTimestamp(),
    };
}

function buildRegisteredMovement(
    cardCode: string,
    amountCents: number,
    uid: string,
    name: string,
) {
    return {
        giftCardId: cardCode,
        codeSnapshot: cardCode,
        amountCents,
        cycleNumber: null,
        cycleId: null,
        type: 'REGISTERED' as const,
        createdAt: FieldValue.serverTimestamp(),
        performedBy: uid,
        performedByName: name,
        buyerNameSnapshot: null,
        saleId: null,
        reason: null,
    };
}

/**
 * Vende/activa una tarjeta AVAILABLE (staff, prompt §10, §30): abre un
 * ciclo nuevo (`cycleNumber += 1`, `activeCycleId` nuevo) y registra cómo
 * pagó el comprador la tarjeta — dinero NUEVO que entra hoy, separado del
 * dinero de mercancía (plan §18.1, §16.2: "emitir una gift card no es una
 * venta"). NO crea ningún documento en `sales`.
 */
export const activateGiftCard = onCall<ActivateGiftCardData>({ region: REGION }, async (request) => {
    const staffSnap = await assertStaffRole(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(staffSnap);

    const cardCode = requireCode(request.data.code);
    const buyerName = optionalBuyerName(request.data.buyerName);
    const payments = validateIssuePayments(request.data.payments);
    const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

    const settingsSnap = await db.doc('settings/app').get();
    const timezone = (settingsSnap.get('timezone') as string) || 'America/La_Paz';
    const { dateKey, monthKey, year } = dateKeys(new Date(), timezone);

    const cardRef = db.doc(`giftCards/${cardCode}`);
    const issueRef = db.collection('giftCardIssues').doc();
    const movementRef = db.collection('giftCardMovements').doc();
    const summaryRef = db.doc(`dailySummaries/${dateKey}`);

    let resultCycleNumber = 0;

    await db.runTransaction(async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists) {
            throw new HttpsError('not-found', 'Tarjeta no encontrada.');
        }
        if (cardSnap.get('status') !== 'AVAILABLE') {
            throw new HttpsError(
                'failed-precondition',
                'Esta tarjeta no está disponible para vender.',
            );
        }
        const amountCents = cardSnap.get('amountCents') as number;
        if (paidCents !== amountCents) {
            throw new HttpsError(
                'failed-precondition',
                'El monto pagado no coincide con el valor de la tarjeta.',
            );
        }
        const cashCents = payments
            .filter((p) => p.method === 'cash')
            .reduce((sum, p) => sum + p.amountCents, 0);
        const qrCents = payments
            .filter((p) => p.method === 'qr')
            .reduce((sum, p) => sum + p.amountCents, 0);

        const summarySnap = await tx.get(summaryRef);

        const newCycleNumber = ((cardSnap.get('cycleNumber') as number) ?? 0) + 1;
        resultCycleNumber = newCycleNumber;

        // Solo escrituras de aquí en adelante.
        tx.update(cardRef, {
            status: 'ACTIVE',
            cycleNumber: newCycleNumber,
            activeCycleId: issueRef.id,
            currentBuyerName: buyerName,
            activatedAt: FieldValue.serverTimestamp(),
            activatedBy: uid,
            activatedByName: name,
            suspendedAt: null,
            suspendedBy: null,
            suspendedByName: null,
            suspensionReason: null,
            updatedAt: FieldValue.serverTimestamp(),
        });

        tx.create(issueRef, {
            cardCode,
            cycleNumber: newCycleNumber,
            amountCents,
            status: 'active',
            buyerName,
            activatedAt: FieldValue.serverTimestamp(),
            activatedBy: uid,
            activatedByName: name,
            dateKey,
            monthKey,
            year,
            payments,
            suspendedAt: null,
            suspendedBy: null,
            suspensionReason: null,
            reactivatedAt: null,
            reactivatedBy: null,
            redeemedAt: null,
            saleId: null,
            redeemedAmountCents: null,
            forfeitedAmountCents: null,
            cancelledAt: null,
            cancelledBy: null,
            cancelReason: null,
            closedAt: null,
        });

        tx.create(movementRef, {
            giftCardId: cardCode,
            codeSnapshot: cardCode,
            amountCents,
            cycleNumber: newCycleNumber,
            cycleId: issueRef.id,
            type: 'ACTIVATED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: buyerName,
            saleId: null,
            reason: null,
        });

        if (!summarySnap.exists) {
            tx.create(summaryRef, {
                dateKey,
                monthKey,
                year,
                salesCount: 0,
                itemsCount: 0,
                totalCents: 0,
                cashCents: 0,
                qrCents: 0,
                giftCardCents: 0,
                giftCardsIssuedCents: amountCents,
                giftCardForfeitedCents: 0,
                giftCardIssuesCashCents: cashCents,
                giftCardIssuesQrCents: qrCents,
                products: {},
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
            const newIssuedCents =
                ((summarySnap.get('giftCardsIssuedCents') as number) ?? 0) + amountCents;
            const newIssuesCashCents =
                ((summarySnap.get('giftCardIssuesCashCents') as number) ?? 0) + cashCents;
            const newIssuesQrCents =
                ((summarySnap.get('giftCardIssuesQrCents') as number) ?? 0) + qrCents;
            tx.update(summaryRef, {
                giftCardsIssuedCents: newIssuedCents,
                giftCardIssuesCashCents: newIssuesCashCents,
                giftCardIssuesQrCents: newIssuesQrCents,
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
    });

    return { cardCode, cycleId: issueRef.id, cycleNumber: resultCycleNumber };
});

/** Pérdida/robo reportado (staff, prompt §11): ACTIVE → SUSPENDED. Mismo ciclo. */
export const suspendGiftCard = onCall<SuspendGiftCardData>({ region: REGION }, async (request) => {
    const staffSnap = await assertStaffRole(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(staffSnap);

    const cardCode = requireCode(request.data.code);
    const reason = requireReason(request.data.reason);

    const cardRef = db.doc(`giftCards/${cardCode}`);

    await db.runTransaction(async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists) {
            throw new HttpsError('not-found', 'Tarjeta no encontrada.');
        }
        if (cardSnap.get('status') !== 'ACTIVE') {
            throw new HttpsError(
                'failed-precondition',
                'Solo una tarjeta activa se puede suspender.',
            );
        }
        const cycleId = cardSnap.get('activeCycleId') as string;
        const issueRef = db.doc(`giftCardIssues/${cycleId}`);
        const issueSnap = await tx.get(issueRef);
        if (!issueSnap.exists) {
            throw new HttpsError('internal', 'No se pudo suspender la tarjeta. Intenta nuevamente.');
        }

        tx.update(cardRef, {
            status: 'SUSPENDED',
            suspendedAt: FieldValue.serverTimestamp(),
            suspendedBy: uid,
            suspendedByName: name,
            suspensionReason: reason,
            updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(issueRef, {
            status: 'suspended',
            suspendedAt: FieldValue.serverTimestamp(),
            suspendedBy: uid,
            suspensionReason: reason,
        });
        tx.create(db.collection('giftCardMovements').doc(), {
            giftCardId: cardCode,
            codeSnapshot: cardCode,
            amountCents: cardSnap.get('amountCents') as number,
            cycleNumber: cardSnap.get('cycleNumber') as number,
            cycleId,
            type: 'SUSPENDED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: cardSnap.get('currentBuyerName') ?? null,
            saleId: null,
            reason,
        });
    });

    return { cardCode };
});

/** La tarjeta apareció (staff, prompt §11): SUSPENDED → ACTIVE. Mismo ciclo, nunca uno nuevo. */
export const reactivateGiftCard = onCall<ReactivateGiftCardData>({ region: REGION }, async (request) => {
    const staffSnap = await assertStaffRole(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(staffSnap);

    const cardCode = requireCode(request.data.code);

    const cardRef = db.doc(`giftCards/${cardCode}`);

    await db.runTransaction(async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists) {
            throw new HttpsError('not-found', 'Tarjeta no encontrada.');
        }
        if (cardSnap.get('status') !== 'SUSPENDED') {
            throw new HttpsError(
                'failed-precondition',
                'Solo una tarjeta suspendida se puede reactivar.',
            );
        }
        const cycleId = cardSnap.get('activeCycleId') as string;
        const issueRef = db.doc(`giftCardIssues/${cycleId}`);
        const issueSnap = await tx.get(issueRef);
        if (!issueSnap.exists) {
            throw new HttpsError('internal', 'No se pudo reactivar la tarjeta. Intenta nuevamente.');
        }

        tx.update(cardRef, {
            status: 'ACTIVE',
            suspendedAt: null,
            suspendedBy: null,
            suspendedByName: null,
            suspensionReason: null,
            updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(issueRef, {
            status: 'active',
            reactivatedAt: FieldValue.serverTimestamp(),
            reactivatedBy: uid,
        });
        tx.create(db.collection('giftCardMovements').doc(), {
            giftCardId: cardCode,
            codeSnapshot: cardCode,
            amountCents: cardSnap.get('amountCents') as number,
            cycleNumber: cardSnap.get('cycleNumber') as number,
            cycleId,
            type: 'REACTIVATED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: cardSnap.get('currentBuyerName') ?? null,
            saleId: null,
            reason: null,
        });
    });

    return { cardCode };
});

/**
 * Baja definitiva de la tarjeta FÍSICA (solo admin, prompt §12: política
 * conservadora al no existir una decisión previa distinta). Terminal: nunca
 * vuelve a AVAILABLE. Si había un ciclo abierto (ACTIVE o SUSPENDED) con
 * dinero ya cobrado por la venta de la tarjeta, ese ciclo se cierra como
 * `cancelled` (mismo patrón que `cancelGiftCardIssue` ya aprobado en el plan,
 * §16.6: "el reporte descuenta esa emisión del total de tarjetas vendidas
 * del día") y el resumen diario del día en que se activó se corrige — nunca
 * el de hoy, porque la activación pudo ser cualquier día anterior.
 */
export const cancelGiftCard = onCall<CancelGiftCardData>({ region: REGION }, async (request) => {
    const adminSnap = await assertAdmin(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(adminSnap);

    const cardCode = requireCode(request.data.code);
    const reason = requireReason(request.data.reason);

    const cardRef = db.doc(`giftCards/${cardCode}`);

    await db.runTransaction(async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists) {
            throw new HttpsError('not-found', 'Tarjeta no encontrada.');
        }
        const status = cardSnap.get('status') as string;
        if (status === 'CANCELLED') {
            throw new HttpsError('failed-precondition', 'Esta tarjeta ya está cancelada.');
        }

        const hadOpenCycle = status === 'ACTIVE' || status === 'SUSPENDED';
        const cycleId = hadOpenCycle ? (cardSnap.get('activeCycleId') as string) : null;

        let issueRef: FirebaseFirestore.DocumentReference | null = null;
        let issueSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        let summaryRef: FirebaseFirestore.DocumentReference | null = null;
        let summarySnap: FirebaseFirestore.DocumentSnapshot | null = null;

        if (hadOpenCycle && cycleId) {
            issueRef = db.doc(`giftCardIssues/${cycleId}`);
            issueSnap = await tx.get(issueRef);
            if (issueSnap.exists) {
                const issueDateKey = issueSnap.get('dateKey') as string;
                summaryRef = db.doc(`dailySummaries/${issueDateKey}`);
                summarySnap = await tx.get(summaryRef);
            }
        }

        // Solo escrituras de aquí en adelante.
        tx.update(cardRef, {
            status: 'CANCELLED',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledBy: uid,
            cancelledByName: name,
            cancelReason: reason,
            activeCycleId: null,
            currentBuyerName: null,
            activatedAt: null,
            activatedBy: null,
            activatedByName: null,
            suspendedAt: null,
            suspendedBy: null,
            suspendedByName: null,
            suspensionReason: null,
            updatedAt: FieldValue.serverTimestamp(),
        });

        if (issueRef && issueSnap && issueSnap.exists) {
            tx.update(issueRef, {
                status: 'cancelled',
                cancelledAt: FieldValue.serverTimestamp(),
                cancelledBy: uid,
                cancelReason: reason,
                closedAt: FieldValue.serverTimestamp(),
            });

            if (summaryRef && summarySnap && summarySnap.exists) {
                const amountCents = issueSnap.get('amountCents') as number;
                const payments =
                    (issueSnap.get('payments') as { method: string; amountCents: number }[]) ?? [];
                const cashCents = payments
                    .filter((p) => p.method === 'cash')
                    .reduce((sum, p) => sum + p.amountCents, 0);
                const qrCents = payments
                    .filter((p) => p.method === 'qr')
                    .reduce((sum, p) => sum + p.amountCents, 0);

                const newIssuedCents = Math.max(
                    0,
                    ((summarySnap.get('giftCardsIssuedCents') as number) ?? 0) - amountCents,
                );
                const newIssuesCashCents = Math.max(
                    0,
                    ((summarySnap.get('giftCardIssuesCashCents') as number) ?? 0) - cashCents,
                );
                const newIssuesQrCents = Math.max(
                    0,
                    ((summarySnap.get('giftCardIssuesQrCents') as number) ?? 0) - qrCents,
                );
                tx.update(summaryRef, {
                    giftCardsIssuedCents: newIssuedCents,
                    giftCardIssuesCashCents: newIssuesCashCents,
                    giftCardIssuesQrCents: newIssuesQrCents,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        }

        tx.create(db.collection('giftCardMovements').doc(), {
            giftCardId: cardCode,
            codeSnapshot: cardCode,
            amountCents: cardSnap.get('amountCents') as number,
            cycleNumber: cardSnap.get('cycleNumber') as number,
            cycleId,
            type: 'CANCELLED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: cardSnap.get('currentBuyerName') ?? null,
            saleId: null,
            reason,
        });
    });

    return { cardCode };
});
