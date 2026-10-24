import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
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
 *
 * SEGUNDO AJUSTE POSTERIOR (identidad ≠ monto): el código generado
 * ya NO codifica la denominación (`GC{monto}-{secuencia}`, p. ej.
 * `GC1000-010`) — ese formato ataba el código al valor, y el valor de una
 * tarjeta reutilizable puede cambiar entre un ciclo y el siguiente. El
 * formato nuevo es `GC-{secuencia global}` (`GC-000001`, `GC-000002`...),
 * con UN solo contador (`giftCardCodeCounters/global`), independiente de
 * cuánto valga la tarjeta. Los códigos antiguos con el formato viejo (y los
 * manuales, de cualquier formato) siguen funcionando exactamente igual —
 * nunca se migran (ver el comentario de `buildGeneratedCode` para el
 * detalle completo, y plan §16.13).
 *
 * El mismo ajuste agrega dos operaciones nuevas, ambas admin-only y
 * server-side (nunca solo un botón oculto en el frontend):
 * `updateGiftCardAmount` (cambia el monto configurado, solo mientras la
 * tarjeta está `AVAILABLE`) y `replaceGiftCard` (reemplaza el plástico de
 * una tarjeta dañada/perdida sin volver a cobrar — ver el comentario largo
 * de cada una más abajo).
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

/**
 * Historial de Gift Cards (recibo/reimpresión — ajuste posterior, sin abrir
 * una fase nueva): `ISSUE_LIST_MAX_PAGE_SIZE` espeja el mismo techo que
 * `PAGE_SIZE_OPTIONS` del frontend (5/10/15, `core/data`). El loop de
 * `listGiftCardIssues` filtra `origin === 'replacement'` EN MEMORIA (ver el
 * comentario largo de esa Function para el porqué) — `ISSUE_LIST_MAX_BATCH_ITERATIONS`
 * es el mismo tipo de techo defensivo que `MAX_GENERATION_ATTEMPTS` arriba:
 * a esta escala (20-40 tarjetas) nunca se acerca, solo evita un bucle
 * colgado si algún día hay muchísimos reemplazos consecutivos.
 */
const ISSUE_LIST_MAX_PAGE_SIZE = 15;
const ISSUE_LIST_MAX_BATCH_ITERATIONS = 20;

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

interface UpdateGiftCardAmountData {
    code: string;
    amountCents: number;
}

/**
 * `'generate'` (default, sin cambios) — código nuevo generado por el sistema.
 * `'existing'` — reutiliza una Gift Card física YA REGISTRADA, `AVAILABLE`
 * (ajuste posterior, prompt "reemplazar usando una Gift Card existente").
 */
type ReplaceGiftCardMode = 'generate' | 'existing';

interface ReplaceGiftCardData {
    code: string;
    reason?: string;
    mode?: ReplaceGiftCardMode;
    /** Obligatorio (y solo válido) cuando `mode === 'existing'`. */
    targetCode?: string;
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

interface GetGiftCardIssueData {
    issueId: string;
}

interface ListGiftCardIssuesCursor {
    activatedAtMs: number;
    id: string;
}

interface ListGiftCardIssuesData {
    pageSize: number;
    cursor?: ListGiftCardIssuesCursor | null;
    /** Admin y vendedor por igual (prompt Historial §14, búsqueda por código). */
    cardCode?: string;
    /** Solo lo usa el admin (prompt §9, §20): el vendedor siempre ve las suyas. */
    sellerId?: string;
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
 * Único contador para el código GENERADO (ajuste posterior: identidad ≠
 * monto). Antes había un contador por denominación (`giftCardCodeCounters/
 * {denominación}`, p. ej. `.../1000`); esos documentos quedan huérfanos — no
 * se borran ni se migran, simplemente ya no los usa ningún código nuevo — y
 * este contador global (`giftCardCodeCounters/global`) es, desde ahora, el
 * único que `reserveGeneratedCodes()` toca.
 */
const GLOBAL_CODE_COUNTER_ID = 'global';
/**
 * Mínimo de dígitos del código generado (`GC-000001`...`GC-001000`...), sin
 * techo: `padStart` nunca trunca, solo rellena por la izquierda.
 */
const GLOBAL_CODE_MIN_DIGITS = 6;

/**
 * `GC-{secuencia}` — el código ya NO codifica el monto (ajuste posterior,
 * prompt §1-§2): antes era `GC{denominación}-{secuencia}` (p. ej.
 * `GC1000-010`), un formato que atrapaba la identidad de la tarjeta junto a
 * su valor, imposible de sostener ahora que el valor es editable. Los
 * códigos viejos con ese formato (manuales o generados antes de este
 * ajuste) siguen siendo códigos válidos y funcionan exactamente igual — solo
 * son strings opacos (§16.3) — pero su monto YA NO SE INFIERE del texto del
 * código en ningún punto del sistema; solo cuenta `giftCards.amountCents`.
 */
function buildGeneratedCode(seq: number): string {
    return `GC-${String(seq).padStart(GLOBAL_CODE_MIN_DIGITS, '0')}`;
}

/**
 * Reserva `count` código(s) NUEVOS y únicos, dentro de la MISMA transacción
 * del caller (requerimiento §6-§9, §16) — nunca como un paso previo separado:
 * así la generación es atómica de punta a punta y dos llamadas simultáneas
 * nunca pueden terminar con el mismo código (Firestore reintenta la
 * transacción que pierde la carrera con una lectura fresca).
 *
 * El contador `giftCardCodeCounters/global` es solo de dónde arrancar a
 * buscar — la única fuente de verdad de unicidad sigue siendo
 * `giftCards/{code}` (plan §16.3), exactamente igual que ya hace
 * `registerGiftCard` en modo manual. Por eso cada candidato se verifica
 * contra `giftCards` antes de aceptarlo: si ya existe (un código manual que
 * se adelantó, un código del formato viejo por denominación, o una tarjeta
 * `CANCELLED` — su documento nunca se borra, así que su código nunca se
 * reutiliza), el candidato se descarta sin sobreescribir nada y se prueba el
 * siguiente — nunca se salta ni se repite un número solo porque el contador
 * arrancó en 0 y ya existen tarjetas con el formato viejo.
 *
 * Todas las lecturas (`tx.get`) ocurren aquí, antes de que el caller escriba
 * nada — regla de las transacciones de Firestore: todas las lecturas antes
 * que cualquier escritura. El caller es responsable de persistir el contador
 * con `finalSeq` y de crear los documentos de `codes` devueltos.
 */
async function reserveGeneratedCodes(
    tx: FirebaseFirestore.Transaction,
    count: number,
): Promise<{
    codes: string[];
    counterRef: FirebaseFirestore.DocumentReference;
    counterExists: boolean;
    finalSeq: number;
}> {
    const counterRef = db.doc(`giftCardCodeCounters/${GLOBAL_CODE_COUNTER_ID}`);
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
                'No se pudo generar un código único. Intenta nuevamente.',
            );
        }
        seq++;
        const candidate = buildGeneratedCode(seq);
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

const DEFAULT_REPLACEMENT_REASON = 'Reemplazo de tarjeta física (código anterior cancelado).';

/** El motivo del reemplazo es opcional (prompt §43 reutiliza `reason`, no inventa un workflow nuevo). */
function optionalReplacementReason(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return DEFAULT_REPLACEMENT_REASON;
    return value.trim().slice(0, MAX_REASON_LENGTH);
}

/**
 * `undefined`/`null` (callable serializa `undefined` como `null`, ver
 * `sales.harness.js`) → `'generate'`: así cualquier caller anterior a este
 * ajuste (que nunca mandó `mode`) sigue comportándose EXACTAMENTE igual, sin
 * ninguna migración (prompt §29).
 */
function requireReplaceMode(value: unknown): ReplaceGiftCardMode {
    if (value === undefined || value === null) return 'generate';
    if (value === 'generate' || value === 'existing') return value;
    throw new HttpsError('invalid-argument', 'El modo de reemplazo no es válido.');
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

function requireIssueId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpsError('invalid-argument', 'Emisión inválida.');
    }
    return value.trim();
}

function requireListPageSize(value: unknown): number {
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > ISSUE_LIST_MAX_PAGE_SIZE
    ) {
        throw new HttpsError('invalid-argument', 'Tamaño de página inválido.');
    }
    return value;
}

function optionalCardCodeFilter(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return normalizeGiftCardCode(value);
}

function optionalSellerIdFilter(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.trim();
}

function optionalListCursor(value: unknown): ListGiftCardIssuesCursor | null {
    if (value === undefined || value === null) return null;
    const ms = (value as { activatedAtMs?: unknown })?.activatedAtMs;
    const id = (value as { id?: unknown })?.id;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || typeof id !== 'string' || !id) {
        throw new HttpsError('invalid-argument', 'Cursor de paginación inválido.');
    }
    return { activatedAtMs: ms, id };
}

/**
 * `true` únicamente para un ciclo abierto por `replaceGiftCard` (prompt
 * Historial/Recibo §10, §12): nunca es una venta real, nunca tiene recibo de
 * cobro. Los ciclos de VENTA anteriores a este campo (plan §16.13) no lo
 * tienen en absoluto — se leen como `'sale'`, nunca como reemplazo.
 */
function isReplacementOrigin(snap: FirebaseFirestore.DocumentSnapshot): boolean {
    return (snap.get('origin') as string | undefined) === 'replacement';
}

interface GiftCardIssueDto {
    id: string;
    cardCode: string;
    cycleNumber: number;
    amountCents: number;
    status: string;
    buyerName: string | null;
    activatedAtMs: number;
    activatedBy: string;
    activatedByName: string;
    dateKey: string;
    payments: { method: IssuePaymentMethod; amountCents: number }[];
}

/** Forma serializable (sin `Timestamp`) de un ciclo, para la respuesta de un `onCall`. */
function toIssueDto(snap: FirebaseFirestore.DocumentSnapshot): GiftCardIssueDto {
    const activatedAt = snap.get('activatedAt') as FirebaseFirestore.Timestamp;
    return {
        id: snap.id,
        cardCode: snap.get('cardCode') as string,
        cycleNumber: snap.get('cycleNumber') as number,
        amountCents: snap.get('amountCents') as number,
        status: snap.get('status') as string,
        buyerName: (snap.get('buyerName') as string | null) ?? null,
        activatedAtMs: activatedAt.toMillis(),
        activatedBy: snap.get('activatedBy') as string,
        activatedByName: snap.get('activatedByName') as string,
        dateKey: snap.get('dateKey') as string,
        payments:
            (snap.get('payments') as { method: IssuePaymentMethod; amountCents: number }[]) ?? [],
    };
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
            const { codes, counterRef, counterExists, finalSeq } = await reserveGeneratedCodes(tx, 1);
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
        // Ajuste posterior (identidad ≠ monto, lineage de reemplazos):
        // `lastCycleId` NUNCA se limpia una vez puesto (a diferencia de
        // `activeCycleId`) — es lo que permite reemplazar una tarjeta que ya
        // está `CANCELLED` sin tener que resucitar su ciclo (§16.13).
        lastCycleId: null,
        replacedByCode: null,
        replacesCode: null,
        pendingReplacement: false,
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
            lastCycleId: issueRef.id,
            pendingReplacement: false,
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
            // Venta real (a diferencia de `replaceGiftCard`, que abre un
            // ciclo con `origin: 'replacement'` — nunca cuenta como venta en
            // reportes por vendedor, ver `sumIssues` en reports.service.ts).
            origin: 'sale',
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
 * vuelve a AVAILABLE. Si había un ciclo abierto (ACTIVE o SUSPENDED), ese
 * ciclo se cierra como `cancelled`.
 *
 * REGLA DE NEGOCIO (confirmada por el cliente): la venta de una Gift Card es
 * INGRESO RECONOCIDO al momento de venderse, y el negocio NO ofrece
 * devoluciones. Cancelar la tarjeta es inutilizarla, NO devolver el dinero:
 * por eso esta función NUNCA toca `dailySummaries` — ni resta
 * `giftCardsIssuedCents` ni el desglose `giftCardIssuesCashCents`/
 * `giftCardIssuesQrCents` del día en que se vendió. (Antes los restaba; ver
 * plan §16.11.) Si algún día hubiera una devolución real, sería otra operación
 * explícita (`refundGiftCard`) con sus propios movimientos, no esta.
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

        if (hadOpenCycle && cycleId) {
            issueRef = db.doc(`giftCardIssues/${cycleId}`);
            issueSnap = await tx.get(issueRef);
        }

        // Solo escrituras de aquí en adelante.
        tx.update(cardRef, {
            status: 'CANCELLED',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledBy: uid,
            cancelledByName: name,
            cancelReason: reason,
            // Ajuste posterior (prompt §11, §17, §47): si había un ciclo
            // abierto (dinero ya pagado por el cliente), queda marcada como
            // "reemplazable" — `replaceGiftCard` es la única forma de
            // transferir ese valor a un código nuevo. Una tarjeta `AVAILABLE`
            // cancelada (prompt §20, §48) nunca llega aquí con dinero
            // pendiente: esos Bs eran solo configuración.
            pendingReplacement: hadOpenCycle,
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

/**
 * Cambia el monto configurado de una tarjeta (solo admin, ajuste posterior:
 * identidad ≠ monto, prompt §4-§8). El código (`cardCode`) nunca cambia,
 * solo `amountCents` — y únicamente mientras la tarjeta está `AVAILABLE`: en
 * cuanto se vende/activa, ese monto queda CONGELADO en el ciclo (snapshot en
 * `giftCardIssues.amountCents`, §16.8) y ya no se puede tocar hasta que la
 * tarjeta vuelva a estar disponible (prompt §5, §6, §9).
 *
 * Server-side, no solo ocultando el botón en el frontend (prompt §35, §41):
 * ni un admin puede saltarse esta regla desde la consola, porque `giftCards`
 * tiene `allow write: if false` — la única vía de escritura es esta
 * Function.
 *
 * NO es un ingreso (prompt §25, §26): solo deja constancia en
 * `giftCardMovements` (`AMOUNT_CHANGED`, con `previousAmountCents`) para que
 * el historial de la tarjeta sea legible — nunca toca `dailySummaries`.
 */
export const updateGiftCardAmount = onCall<UpdateGiftCardAmountData>({ region: REGION }, async (request) => {
    const adminSnap = await assertAdmin(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(adminSnap);

    const cardCode = requireCode(request.data.code);
    const amountCents = requireAmountCents(request.data.amountCents);

    const cardRef = db.doc(`giftCards/${cardCode}`);

    await db.runTransaction(async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists) {
            throw new HttpsError('not-found', 'Tarjeta no encontrada.');
        }
        if (cardSnap.get('status') !== 'AVAILABLE') {
            throw new HttpsError(
                'failed-precondition',
                'Solo se puede cambiar el monto mientras la tarjeta está disponible.',
            );
        }
        const previousAmountCents = cardSnap.get('amountCents') as number;
        if (previousAmountCents === amountCents) {
            throw new HttpsError('invalid-argument', 'El nuevo monto debe ser diferente al actual.');
        }

        tx.update(cardRef, { amountCents, updatedAt: FieldValue.serverTimestamp() });
        tx.create(db.collection('giftCardMovements').doc(), {
            giftCardId: cardCode,
            codeSnapshot: cardCode,
            amountCents,
            previousAmountCents,
            cycleNumber: null,
            cycleId: null,
            type: 'AMOUNT_CHANGED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: null,
            saleId: null,
            reason: null,
            replacedByCode: null,
            replacesCode: null,
        });
    });

    return { cardCode, amountCents };
});

/**
 * Reemplaza el PLÁSTICO de una tarjeta dañada/perdida, SIN cobrar de nuevo
 * (solo admin, ajuste posterior: identidad ≠ monto, prompt §12-§22, §36-§37,
 * §46-§48).
 *
 * El valor ya pagado — el monto vigente de la tarjeta al momento en que se
 * vendió/activó, congelado desde entonces (§16.8) — se TRANSFIERE a un
 * código nuevo generado por el sistema (siempre `codeMode: 'generated'`
 * internamente: nadie teclea el código de un reemplazo). El código viejo
 * queda `CANCELLED` para siempre; el nuevo nace `ACTIVE` directamente, con
 * el mismo monto, SIN pasar por `AVAILABLE` ni por `activateGiftCard` — no
 * es una venta (prompt §12-§13): por eso el `giftCardIssues` que abre lleva
 * `origin: 'replacement'` y `payments: []`, y ningún `dailySummaries` se
 * toca (prompt §14, §29). Los reportes por vendedor (`sumIssues`,
 * `reports.service.ts`) excluyen `origin === 'replacement'` de sus totales
 * (prompt §28).
 *
 * REGLA DE FLUJO DEFINITIVA (ajuste posterior sobre el ajuste anterior):
 * el reemplazo YA NO es directo desde `ACTIVE`/`SUSPENDED` — el admin
 * primero debe ejecutar `cancelGiftCard` (que decide, según había o no un
 * ciclo pagado abierto, si deja `pendingReplacement: true`); solo entonces
 * esta Function acepta transferir el valor. Elegibilidad, decidida
 * enteramente con los campos ya denormalizados en `giftCards` (nunca hace
 * falta releer `giftCardIssues` — mismo criterio de "1 lectura" que el
 * resto de esta colección, §16.1):
 * - `ACTIVE`/`SUSPENDED` — rechazada: hay que cancelar primero.
 * - `AVAILABLE` — rechazada: no hay nada pagado pendiente que transferir.
 * - `CANCELLED` sin `pendingReplacement` (nunca tuvo ciclo abierto, prompt
 *   §20/§48, o una tarjeta anterior a este ajuste) — rechazada: ese monto
 *   era solo configuración, nadie pagó por él.
 * - `CANCELLED` con `replacedByCode` ya fijado (doble reemplazo, prompt
 *   §18) — rechazada de inmediato, sin mirar nada más.
 * - `CANCELLED` + `pendingReplacement === true` + `replacedByCode` nulo —
 *   única combinación elegible.
 *
 * El `cycleId`/`cycleNumber` que se citan en los movimientos de auditoría
 * salen de `lastCycleId`/`cycleNumber`, que `cancelGiftCard` ya deja fijados
 * en el momento de cancelar y esta Function nunca vuelve a tocar — el ciclo
 * ya quedó cerrado (`status: 'cancelled'`) por `cancelGiftCard`.
 *
 * IDENTIDAD DEL ENTITLEMENT (ajuste posterior, hallazgo en DEV): el valor
 * transferido no es solo el monto — también el COMPRADOR y el VENDEDOR
 * ORIGINALES viajan con él, porque siguen siendo el mismo derecho pagado,
 * solo con un plástico nuevo. Esta Function SÍ necesita releer
 * `giftCardIssues/{lastCycleId}` (una lectura más, dentro de la misma
 * transacción) para tomar `buyerName`/`activatedAt`/`activatedBy`/
 * `activatedByName` de ahí — no hay otro snapshot estable de esa identidad.
 * El nuevo `giftCards`/`giftCardIssues` se crea con esos mismos valores
 * (nunca con los del admin que ejecuta el reemplazo): así el listado y el
 * detalle siguen resolviendo "Comprador"/"Vendido por" sin releer nada —
 * siguen leyendo `giftCards.currentBuyerName`/`activatedByName` tal cual ya
 * hacían, cero N+1 — y la cadena de reemplazos (A→B→C) propaga la misma
 * identidad indefinidamente, porque cada eslabón nuevo vuelve a dejarla en
 * SU PROPIO `lastCycleId`. El admin que ejecuta el reemplazo solo queda
 * registrado en `performedBy`/`performedByName` de los movimientos
 * `REPLACED`/`REPLACEMENT_CREATED` de abajo — nunca en `activatedBy` de la
 * tarjeta ni del ciclo, porque no fue quien la vendió.
 *
 * Atómico de punta a punta (prompt §16): reservar y crear el código nuevo,
 * marcar el viejo como reemplazado, abrir el ciclo nuevo y los movimientos
 * de auditoría ocurren en una sola transacción.
 *
 * SEGUNDO MODO (ajuste posterior: "reemplazar usando una Gift Card
 * existente"): `mode` decide hacia dónde se transfiere el valor —
 * `'generate'` (default, sin cambios: cualquier caller que nunca mandó este
 * campo sigue exactamente igual, prompt §29) crea un código nuevo; `'existing'`
 * reutiliza un plástico YA REGISTRADO (`targetCode`), `AVAILABLE` en el
 * momento de leerlo DENTRO de esta misma transacción (protección contra
 * carrera: si entre que el admin eligió la tarjeta en pantalla y confirmó
 * otra venta se la llevó, esta relectura la encuentra `ACTIVE` y la
 * transacción se rechaza sin tocar nada — prompt §15-§16, §36-§37). Ambos
 * modos comparten TODO lo demás (identidad del entitlement, `origin:
 * 'replacement'`, cero impacto en `dailySummaries`/reportes, un solo hop de
 * lineage en `replacedByCode`/`replacesCode`) — la única diferencia real es
 * si el documento destino se `create()` (modo `'generate'`, nace con
 * `cycleNumber: 1`) o se `update()` (modo `'existing'`: el plástico ya tenía
 * su propio historial de ciclos anteriores, que esta Function NUNCA borra ni
 * reabre — solo avanza su `cycleNumber` igual que `activateGiftCard` ya hace
 * con cualquier activación real, prompt §18). En modo `'existing'` el código
 * del documento (`targetCode`) nunca cambia (prompt §17); `replacesCode` se
 * sobreescribe con el código de la fuente de ESTE reemplazo — es, por
 * diseño, un puntero de un solo salto al origen MÁS RECIENTE del valor que
 * trae la tarjeta (mismo criterio que `activeCycleId`/`lastCycleId`: estado
 * corriente denormalizado, nunca una lista — la cadena completa, si hiciera
 * falta reconstruirla, sigue viva en `giftCardMovements`, append-only).
 */
export const replaceGiftCard = onCall<ReplaceGiftCardData>({ region: REGION }, async (request) => {
    const adminSnap = await assertAdmin(request.auth);
    const uid = request.auth!.uid;
    const name = staffName(adminSnap);

    const oldCode = requireCode(request.data.code);
    const reason = optionalReplacementReason(request.data.reason);
    const mode = requireReplaceMode(request.data.mode);
    const targetCode = mode === 'existing' ? requireCode(request.data.targetCode, 'targetCode') : null;
    if (targetCode && targetCode === oldCode) {
        // Defensivo (prompt §26): la fuente está CANCELLED y por lo tanto
        // nunca aparece en el listado de tarjetas AVAILABLE que alimenta el
        // selector, pero una Function nunca confía solo en lo que el cliente
        // mandó.
        throw new HttpsError(
            'invalid-argument',
            'La tarjeta seleccionada no puede ser la misma que la tarjeta a reemplazar.',
        );
    }

    const settingsSnap = await db.doc('settings/app').get();
    const timezone = (settingsSnap.get('timezone') as string) || 'America/La_Paz';
    const { dateKey, monthKey, year } = dateKeys(new Date(), timezone);

    const oldCardRef = db.doc(`giftCards/${oldCode}`);
    let newCode = '';
    let transferredAmountCents = 0;

    await db.runTransaction(async (tx) => {
        const oldCardSnap = await tx.get(oldCardRef);
        if (!oldCardSnap.exists) {
            throw new HttpsError('not-found', 'Tarjeta no encontrada.');
        }
        if (oldCardSnap.get('replacedByCode')) {
            throw new HttpsError('failed-precondition', 'Esta tarjeta ya fue reemplazada anteriormente.');
        }

        const status = oldCardSnap.get('status') as string;
        const pendingReplacement = oldCardSnap.get('pendingReplacement') === true;
        if (status !== 'CANCELLED' || !pendingReplacement) {
            throw new HttpsError(
                'failed-precondition',
                'Solo se puede reemplazar una tarjeta ya cancelada definitivamente, con un valor pagado pendiente.',
            );
        }

        const amountCents = oldCardSnap.get('amountCents') as number;
        transferredAmountCents = amountCents;
        const cycleNumber = oldCardSnap.get('cycleNumber') as number;
        const cycleId = oldCardSnap.get('lastCycleId') as string | null;
        if (!cycleId) {
            throw new HttpsError(
                'internal',
                'No se pudo recuperar el ciclo original de esta tarjeta. Intenta nuevamente.',
            );
        }

        // Snapshot del comprador/vendedor ORIGINALES (ajuste posterior:
        // identidad del entitlement, no solo su monto): `lastCycleId` ya
        // identifica exactamente el ciclo que pagó este valor (§16.13), así
        // que esta es la MISMA fuente que ya usa el resto del sistema para
        // esa información — ni un campo nuevo ni una consulta extra fuera de
        // esta transacción. El reemplazo transfiere la identidad del
        // comprador/vendedor junto con el valor; quién ejecuta el reemplazo
        // (este admin) solo queda registrado en los movimientos de abajo,
        // nunca pisa `activatedBy`/`activatedByName` de la tarjeta.
        const originalIssueSnap = await tx.get(db.doc(`giftCardIssues/${cycleId}`));
        if (!originalIssueSnap.exists) {
            throw new HttpsError(
                'internal',
                'No se pudo recuperar el ciclo original de esta tarjeta. Intenta nuevamente.',
            );
        }
        const originalBuyerName = (originalIssueSnap.get('buyerName') as string | null) ?? null;
        const originalActivatedAt = originalIssueSnap.get('activatedAt');
        const originalActivatedBy = originalIssueSnap.get('activatedBy') as string;
        const originalActivatedByName = originalIssueSnap.get('activatedByName') as string;

        // Resolución del destino — TODAS las lecturas (incluida la del
        // plástico existente, si aplica) ocurren antes de cualquier
        // escritura, regla de las transacciones de Firestore (prompt §16).
        let targetCardRef: FirebaseFirestore.DocumentReference;
        let newCycleNumber: number;
        let counterRef: FirebaseFirestore.DocumentReference | null = null;
        let counterExists = false;
        let finalSeq = 0;

        if (mode === 'existing') {
            targetCardRef = db.doc(`giftCards/${targetCode}`);
            const targetCardSnap = await tx.get(targetCardRef);
            if (!targetCardSnap.exists) {
                throw new HttpsError('not-found', 'La tarjeta seleccionada no existe.');
            }
            // Relectura fresca DENTRO de la transacción = la protección
            // contra carrera (prompt §15, §36): si otra operación la vendió
            // entre que se mostró en pantalla y se confirmó, esto la
            // encuentra ya `ACTIVE`/`SUSPENDED`/`CANCELLED` y rechaza limpio,
            // sin dejar la fuente marcada como reemplazada (sin escritura
            // parcial — prompt §16).
            if (targetCardSnap.get('status') !== 'AVAILABLE') {
                throw new HttpsError(
                    'failed-precondition',
                    'La tarjeta seleccionada ya no está disponible. Selecciona otra tarjeta.',
                );
            }
            newCode = targetCode as string;
            // El plástico puede traer ciclos anteriores (prompt §18): se
            // avanza su propio contador, igual que `activateGiftCard` — NUNCA
            // se reinicia a 1 como si fuera una tarjeta recién nacida.
            newCycleNumber = ((targetCardSnap.get('cycleNumber') as number) ?? 0) + 1;
        } else {
            const reserved = await reserveGeneratedCodes(tx, 1);
            newCode = reserved.codes[0];
            counterRef = reserved.counterRef;
            counterExists = reserved.counterExists;
            finalSeq = reserved.finalSeq;
            targetCardRef = db.doc(`giftCards/${newCode}`);
            newCycleNumber = 1;
        }

        const newIssueRef = db.collection('giftCardIssues').doc();

        // Solo escrituras de aquí en adelante.
        if (counterRef) {
            writeGeneratedCodeCounter(tx, counterRef, counterExists, finalSeq);
        }

        // La tarjeta vieja ya estaba CANCELLED (la dejó así `cancelGiftCard`):
        // solo se marca hacia dónde se transfirió el valor, sin reabrir ni
        // tocar nada más de su estado terminal.
        tx.update(oldCardRef, {
            replacedByCode: newCode,
            pendingReplacement: false,
            updatedAt: FieldValue.serverTimestamp(),
        });

        if (mode === 'existing') {
            // `update()`, nunca `create()`: es el MISMO documento físico de
            // siempre (prompt §17) — sus ciclos ya cerrados en `giftCardIssues`
            // y sus `giftCardMovements` históricos quedan intocados (prompt
            // §18). `createdAt`/`createdBy`/`createdByName` tampoco se tocan:
            // son del registro original del plástico, no de este ciclo.
            tx.update(targetCardRef, {
                amountCents,
                status: 'ACTIVE' as const,
                cycleNumber: newCycleNumber,
                activeCycleId: newIssueRef.id,
                lastCycleId: newIssueRef.id,
                replacedByCode: null,
                replacesCode: oldCode,
                pendingReplacement: false,
                currentBuyerName: originalBuyerName,
                activatedAt: originalActivatedAt,
                activatedBy: originalActivatedBy,
                activatedByName: originalActivatedByName,
                suspendedAt: null,
                suspendedBy: null,
                suspendedByName: null,
                suspensionReason: null,
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
            tx.create(targetCardRef, {
                cardCode: newCode,
                amountCents,
                status: 'ACTIVE' as const,
                cycleNumber: newCycleNumber,
                activeCycleId: newIssueRef.id,
                lastCycleId: newIssueRef.id,
                replacedByCode: null,
                replacesCode: oldCode,
                pendingReplacement: false,
                currentBuyerName: originalBuyerName,
                activatedAt: originalActivatedAt,
                activatedBy: originalActivatedBy,
                activatedByName: originalActivatedByName,
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
            });
        }

        tx.create(newIssueRef, {
            cardCode: newCode,
            cycleNumber: newCycleNumber,
            amountCents,
            status: 'active',
            buyerName: originalBuyerName,
            activatedAt: originalActivatedAt,
            activatedBy: originalActivatedBy,
            activatedByName: originalActivatedByName,
            dateKey,
            monthKey,
            year,
            payments: [],
            origin: 'replacement',
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

        tx.create(db.collection('giftCardMovements').doc(), {
            giftCardId: oldCode,
            codeSnapshot: oldCode,
            amountCents,
            cycleNumber,
            cycleId,
            type: 'REPLACED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: originalBuyerName,
            saleId: null,
            reason,
            replacedByCode: newCode,
            replacesCode: null,
        });
        tx.create(db.collection('giftCardMovements').doc(), {
            giftCardId: newCode,
            codeSnapshot: newCode,
            amountCents,
            cycleNumber: newCycleNumber,
            cycleId: newIssueRef.id,
            type: 'REPLACEMENT_CREATED' as const,
            createdAt: FieldValue.serverTimestamp(),
            performedBy: uid,
            performedByName: name,
            buyerNameSnapshot: originalBuyerName,
            saleId: null,
            reason,
            replacedByCode: null,
            replacesCode: oldCode,
        });
    });

    return { cardCode: oldCode, newCardCode: newCode, amountCents: transferredAmountCents };
});

/**
 * Recibo de cobro de UNA emisión/venta real de Gift Card (ajuste posterior,
 * Recibo/Historial de Gift Cards, sin abrir una fase nueva — ver también
 * `listGiftCardIssues` abajo). Fuente de verdad del comprobante: SIEMPRE
 * `giftCardIssues/{issueId}`, nunca `giftCards` — el monto/comprador
 * ACTUALES de la tarjeta pueden pertenecer a un ciclo totalmente distinto
 * para cuando alguien reimprime (plan §16.13, identidad ≠ monto). Un
 * `origin: 'replacement'` se rechaza explícitamente: un reemplazo nunca
 * generó dinero nuevo y no tiene recibo de cobro.
 *
 * Esta misma Function es el único punto de lectura tanto para "Imprimir
 * recibo" justo después de vender como para reimprimir desde el Historial:
 * así los dos caminos nunca pueden mostrar algo distinto para el mismo
 * ciclo.
 *
 * `giftCardIssues` es `allow get, list: if isAdmin()` en las Rules (solo
 * auditoría, plan §16.1, comentario de cabecera de este archivo): un
 * vendedor no puede leerlo directo desde Angular. En vez de abrir las Rules
 * SOLO para esta pantalla (instrucción explícita del prompt: "NO cambies
 * Rules a una solución más permisiva solamente para leer historial"), esta
 * Function hace la misma verificación de dueño que ya usa `sales`
 * (`sellerId == uid` en la Rule de `sales`, acá `activatedBy == uid` en
 * código): el vendedor solo puede traer SU PROPIA emisión; el admin,
 * cualquiera.
 */
export const getGiftCardIssue = onCall<GetGiftCardIssueData>({ region: REGION }, async (request) => {
    const staffSnap = await assertStaffRole(request.auth);
    const uid = request.auth!.uid;
    const isAdmin = staffSnap.get('role') === 'admin';

    const issueId = requireIssueId(request.data.issueId);
    const snap = await db.doc(`giftCardIssues/${issueId}`).get();
    if (!snap.exists) {
        throw new HttpsError('not-found', 'Emisión no encontrada.');
    }
    if (isReplacementOrigin(snap)) {
        throw new HttpsError(
            'failed-precondition',
            'Un reemplazo de plástico no genera un recibo de cobro.',
        );
    }
    if (!isAdmin && snap.get('activatedBy') !== uid) {
        throw new HttpsError('permission-denied', 'No puedes ver esta emisión.');
    }

    return toIssueDto(snap);
});

/**
 * Historial de emisiones/ventas REALES de Gift Card, paginado por cursor
 * (ajuste posterior, Recibo/Historial de Gift Cards). Fuente SIEMPRE
 * `giftCardIssues`, nunca `giftCards`: una misma tarjeta física reutilizada
 * son N emisiones distintas en este historial (plan §16.13 — el ejemplo del
 * prompt: Camila/Bs 100 → Roberto/Bs 500 → María/Bs 1000, tres filas, no
 * una). Un ciclo con `origin: 'replacement'` jamás aparece aquí: no es una
 * venta, es Bs 0 de ingreso nuevo.
 *
 * Mismo motivo que `getGiftCardIssue` para ser una Function y no una
 * consulta directa desde Angular (`giftCardIssues` es admin-only en las
 * Rules): el vendedor ve solo lo que él mismo activó (`activatedBy` forzado
 * a su propio uid si no es admin, igual que `sellerId` en el historial de
 * Ventas); el admin ve todo y puede acotar por vendedor o por código.
 *
 * SIN filtro de fecha a propósito, a diferencia de Ventas: la tienda tiene
 * 20-40 tarjetas físicas (CLAUDE.md) — unas pocas decenas de emisiones en
 * total con el tiempo, no miles por día — así que forzar un filtro de fecha
 * no aporta nada aquí y solo complicaría la pantalla sin necesidad (prompt
 * Historial §14: "no agregues filtros que no aporten").
 *
 * `origin: 'replacement'` no se puede excluir con un `where()`: los ciclos
 * de VENTA anteriores a este campo (plan §16.13) no tienen `origin` en
 * absoluto, y un filtro de Firestore (`==`, `in`, `!=`) nunca incluye un
 * documento que no tiene el campo — se leerían como si esas ventas
 * históricas no existieran. Por eso se filtra EN MEMORIA, en páginas
 * internas acotadas (mismo patrón que `getSellerIssuesTotals` en
 * `reports.service.ts`, del lado del cliente, para un problema análogo):
 * nunca una lectura sin límite, solo varias lecturas acotadas encadenadas
 * por cursor hasta reunir una página completa o agotar la colección.
 *
 * El total mostrado en el paginador excluye los reemplazos de la misma
 * forma: `totalAll − totalReplacements`, dos agregaciones `count()` baratas
 * (nunca se transfieren documentos para contar) sobre el mismo filtro de
 * `cardCode`/`activatedBy` que ya aplica la página.
 */
export const listGiftCardIssues = onCall<ListGiftCardIssuesData>({ region: REGION }, async (request) => {
    const staffSnap = await assertStaffRole(request.auth);
    const uid = request.auth!.uid;
    const isAdmin = staffSnap.get('role') === 'admin';

    const pageSize = requireListPageSize(request.data.pageSize);
    const cardCode = optionalCardCodeFilter(request.data.cardCode);
    const sellerId = isAdmin ? optionalSellerIdFilter(request.data.sellerId) : uid;
    const cursor = optionalListCursor(request.data.cursor);

    const withEqualityFilters = (q: FirebaseFirestore.Query): FirebaseFirestore.Query => {
        let filtered = q;
        if (cardCode) filtered = filtered.where('cardCode', '==', cardCode);
        if (sellerId) filtered = filtered.where('activatedBy', '==', sellerId);
        return filtered;
    };

    const [totalAll, totalReplacements] = await Promise.all([
        withEqualityFilters(db.collection('giftCardIssues'))
            .count()
            .get()
            .then((snap) => snap.data().count),
        withEqualityFilters(db.collection('giftCardIssues'))
            .where('origin', '==', 'replacement')
            .count()
            .get()
            .then((snap) => snap.data().count),
    ]);
    const total = totalAll - totalReplacements;

    const baseQuery = withEqualityFilters(db.collection('giftCardIssues'))
        .orderBy('activatedAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc');

    const batchSize = pageSize + 1;
    let cursorQuery: FirebaseFirestore.Query = cursor
        ? baseQuery.startAfter(Timestamp.fromMillis(cursor.activatedAtMs), cursor.id)
        : baseQuery;

    const accepted: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let iterations = 0;
    while (accepted.length < batchSize) {
        iterations++;
        if (iterations > ISSUE_LIST_MAX_BATCH_ITERATIONS) break;

        const snap = await cursorQuery.limit(batchSize).get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            if (!isReplacementOrigin(doc)) accepted.push(doc);
            if (accepted.length >= batchSize) break;
        }

        if (snap.docs.length < batchSize) break; // se agotó la colección real que cumple los filtros
        cursorQuery = baseQuery.startAfter(snap.docs[snap.docs.length - 1]);
    }

    const hasNext = accepted.length > pageSize;
    const pageDocs = accepted.slice(0, pageSize);
    const rows = pageDocs.map(toIssueDto);
    const lastDoc = pageDocs.at(-1);
    const nextCursor =
        hasNext && lastDoc
            ? {
                  activatedAtMs: (lastDoc.get('activatedAt') as FirebaseFirestore.Timestamp).toMillis(),
                  id: lastDoc.id,
              }
            : null;

    return { rows, hasNext, total, nextCursor };
});
