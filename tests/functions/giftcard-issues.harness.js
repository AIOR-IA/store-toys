/**
 * Arnés del backend de Recibo/Historial de Gift Cards: ejecuta el handler REAL de
 * getGiftCardIssue/listGiftCardIssues (functions/lib/giftcards.js, compilado) sobre un
 * Firestore EN MEMORIA que soporta consultas (where/orderBy/limit/startAfter/count), a
 * diferencia del store minimalista de sales.harness.js (que solo soporta get/create/update
 * dentro de una transacción). Solo se reemplazan ./admin (db) y ./guards (lectura de
 * users/{uid}); toda la lógica de las dos Functions es la real.
 *
 * Uso:  npm run test:functions        (compila Functions y corre este archivo)
 *       node tests/functions/giftcard-issues.harness.js [dir-con-lib]
 */
const path = require('path');
const { createRequire } = require('module');
const libDir = path.resolve(process.argv[2] || path.join(__dirname, '../../functions/lib'));
// `firebase-admin` solo está instalado dentro de `functions/node_modules`: se
// resuelve con un `require` anclado en `functions/package.json` (igual que
// Node resolvería `require('firebase-admin/firestore')` dentro de las propias
// Functions), no con un `path.join` directo — el paquete usa `exports` en su
// `package.json`, que solo la resolución real de Node sabe interpretar.
const functionsRequire = createRequire(path.join(libDir, '../package.json'));
const { Timestamp, FieldPath } = functionsRequire('firebase-admin/firestore');
const label = 'getGiftCardIssue / listGiftCardIssues (lib compilado)';

// ---------- Firestore en memoria, con soporte de consultas ----------
const store = new Map();

function snap(p) {
    const data = store.has(p) ? store.get(p) : undefined;
    return {
        id: p.split('/').pop(),
        exists: data !== undefined,
        get: (f) => (data === undefined ? undefined : data[f]),
        data: () => data,
    };
}
function docsOfCollection(name) {
    const prefix = `${name}/`;
    return [...store.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({ id: k.slice(prefix.length), data: v }));
}
function compareValues(a, b) {
    const av = a instanceof Timestamp ? a.toMillis() : a;
    const bv = b instanceof Timestamp ? b.toMillis() : b;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
}
function sortKeyOf(doc, orders) {
    return orders.map((o) => (o.field === '__name__' ? doc.id : doc.data[o.field]));
}
function makeQuery(name, filters = [], orders = [], limitN = null, cursorValues = null) {
    return {
        where(field, op, value) {
            if (op !== '==') throw new Error('mock solo soporta ==');
            return makeQuery(name, [...filters, { field, value }], orders, limitN, cursorValues);
        },
        orderBy(field, dir = 'asc') {
            const key = field instanceof FieldPath ? '__name__' : field;
            return makeQuery(name, filters, [...orders, { field: key, dir }], limitN, cursorValues);
        },
        limit(n) {
            return makeQuery(name, filters, orders, n, cursorValues);
        },
        startAfter(...args) {
            const values =
                args.length === 1 && args[0] && args[0]._sortKey ? args[0]._sortKey : args;
            return makeQuery(name, filters, orders, limitN, values);
        },
        async get() {
            let docs = docsOfCollection(name).filter((d) =>
                filters.every((f) => d.data[f.field] === f.value),
            );
            docs.sort((a, b) => {
                for (const o of orders) {
                    const av = o.field === '__name__' ? a.id : a.data[o.field];
                    const bv = o.field === '__name__' ? b.id : b.data[o.field];
                    const cmp = compareValues(av, bv) * (o.dir === 'desc' ? -1 : 1);
                    if (cmp !== 0) return cmp;
                }
                return 0;
            });
            if (cursorValues) {
                docs = docs.filter((d) => {
                    const key = sortKeyOf(d, orders);
                    for (let i = 0; i < orders.length; i++) {
                        const dir = orders[i].dir === 'desc' ? -1 : 1;
                        const cmp = compareValues(key[i], cursorValues[i]) * dir;
                        if (cmp < 0) return false;
                        if (cmp > 0) return true;
                    }
                    return false; // igual al cursor: `startAfter` lo excluye
                });
            }
            if (limitN != null) docs = docs.slice(0, limitN);
            const result = docs.map((d) => ({
                id: d.id,
                exists: true,
                get: (f) => (f === '__name__' ? d.id : d.data[f]),
                data: () => d.data,
                _sortKey: sortKeyOf(d, orders),
            }));
            return { empty: result.length === 0, docs: result };
        },
        count() {
            return {
                async get() {
                    const docs = docsOfCollection(name).filter((d) =>
                        filters.every((f) => d.data[f.field] === f.value),
                    );
                    return { data: () => ({ count: docs.length }) };
                },
            };
        },
    };
}
const db = {
    doc: (p) => ({ path: p, id: p.split('/').pop(), get: async () => snap(p) }),
    collection: (name) => makeQuery(name),
};

// ---------- inyectar mocks de ./admin y ./guards ----------
const inject = (file, exports) => {
    const p = require.resolve(path.join(libDir, file));
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
inject('admin.js', { db, storage: {}, auth: {} });
inject('guards.js', {
    assertActive: async (auth) => {
        const s = snap(`users/${auth.uid}`);
        if (!s.exists || s.get('isActive') !== true) throw new Error('inactive');
        return s;
    },
    assertAdmin: async (auth) => {
        const s = snap(`users/${auth.uid}`);
        if (s.get('role') !== 'admin') throw new Error('not admin');
        return s;
    },
});
const { getGiftCardIssue, listGiftCardIssues } = require(path.join(libDir, 'giftcards.js'));

// ---------- datos base ----------
function reset() {
    store.clear();
    store.set('users/seller', { isActive: true, role: 'user', firstName: 'Vend', lastName: 'Uno' });
    store.set('users/seller2', { isActive: true, role: 'user', firstName: 'Vend', lastName: 'Dos' });
    store.set('users/admin', { isActive: true, role: 'admin', firstName: 'Ad', lastName: 'Min' });
}
function ts(iso) {
    return Timestamp.fromMillis(Date.parse(iso));
}
function seedIssue(id, overrides = {}) {
    store.set(`giftCardIssues/${id}`, {
        cardCode: 'GC-TEST',
        cycleNumber: 1,
        amountCents: 10000,
        status: 'redeemed',
        buyerName: 'Comprador',
        activatedAt: ts('2026-10-01T12:00:00Z'),
        activatedBy: 'seller',
        activatedByName: 'Vendedor Uno',
        dateKey: '2026-10-01',
        payments: [{ method: 'cash', amountCents: 10000 }],
        ...overrides,
    });
}

const call = (fn, uid, data) => fn.run({ auth: { uid }, data, rawRequest: {} });
async function outcome(p) {
    try {
        return { ok: true, value: await p };
    } catch (e) {
        return { ok: false, code: e.code, message: e.message };
    }
}

let pass = 0,
    fail = 0;
const check = (name, cond, extra = '') => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
};

(async () => {
    console.log(`\n===== ${label} =====`);

    // A-C. getGiftCardIssue: dueño, ajeno y admin
    console.log('\nA-C. getGiftCardIssue: dueño / ajeno / admin');
    reset();
    seedIssue('iss1', { activatedBy: 'seller', activatedByName: 'Vendedor Uno', amountCents: 10000 });
    let r = await outcome(call(getGiftCardIssue, 'seller', { issueId: 'iss1' }));
    check(
        'A. el vendedor que activó puede leer su propia emisión (monto/comprador/pagos del snapshot)',
        r.ok && r.value.cardCode === 'GC-TEST' && r.value.amountCents === 10000 && r.value.buyerName === 'Comprador' && r.value.payments.length === 1,
        JSON.stringify(r),
    );
    r = await outcome(call(getGiftCardIssue, 'seller2', { issueId: 'iss1' }));
    check('B. otro vendedor NO puede leer una emisión que no activó él', !r.ok && r.code === 'permission-denied', JSON.stringify(r));
    r = await outcome(call(getGiftCardIssue, 'admin', { issueId: 'iss1' }));
    check('C. el admin puede leer cualquier emisión', r.ok && r.value.id === 'iss1', JSON.stringify(r));

    // D-E. replacement rechazado / no encontrado
    console.log('\nD-E. getGiftCardIssue: reemplazo rechazado / inexistente');
    seedIssue('iss-repl', { origin: 'replacement', activatedBy: 'seller' });
    r = await outcome(call(getGiftCardIssue, 'admin', { issueId: 'iss-repl' }));
    check('D. un ciclo origin=replacement se rechaza incluso para el admin (nunca es un recibo de cobro)', !r.ok && r.code === 'failed-precondition', JSON.stringify(r));
    r = await outcome(call(getGiftCardIssue, 'admin', { issueId: 'no-existe' }));
    check('E. emisión inexistente → not-found', !r.ok && r.code === 'not-found', JSON.stringify(r));

    // F-H. listGiftCardIssues: visibilidad por rol y exclusión de reemplazos
    console.log('\nF-H. listGiftCardIssues: visibilidad por rol y exclusión de reemplazos');
    reset();
    seedIssue('s1', { activatedBy: 'seller', cardCode: 'GC-A', activatedAt: ts('2026-10-01T10:00:00Z') });
    seedIssue('s2', { activatedBy: 'seller', cardCode: 'GC-B', activatedAt: ts('2026-10-02T10:00:00Z') });
    seedIssue('s2r', { activatedBy: 'seller2', cardCode: 'GC-C', activatedAt: ts('2026-10-03T10:00:00Z') });
    seedIssue('rep1', { activatedBy: 'seller', cardCode: 'GC-A', origin: 'replacement', activatedAt: ts('2026-10-04T10:00:00Z') });

    r = await outcome(call(listGiftCardIssues, 'seller', { pageSize: 10, cursor: null }));
    check(
        'F. el vendedor solo ve SUS propias emisiones reales (s1, s2 — nunca s2r ni el reemplazo)',
        r.ok && r.value.rows.length === 2 && r.value.total === 2 && r.value.rows.every((row) => row.activatedBy === 'seller'),
        JSON.stringify(r),
    );
    r = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null }));
    check(
        'G. el admin ve TODAS las emisiones reales (s1, s2, s2r) y ninguna de reemplazo',
        r.ok && r.value.rows.length === 3 && r.value.total === 3 && !r.value.rows.some((row) => row.id === 'rep1'),
        JSON.stringify(r),
    );
    r = await outcome(call(listGiftCardIssues, 'seller', { pageSize: 10, cursor: null, sellerId: 'seller2' }));
    check(
        'M. un vendedor que manda sellerId de otro vendedor es IGNORADO: sigue viendo solo lo suyo',
        r.ok && r.value.rows.length === 2 && r.value.rows.every((row) => row.activatedBy === 'seller'),
        JSON.stringify(r),
    );

    // I. misma tarjeta, dos ciclos → dos filas independientes al filtrar por código
    console.log('\nI. Misma tarjeta reutilizada: dos ciclos, dos filas independientes');
    reset();
    seedIssue('cyc1', { cardCode: 'GC-REUSE', activatedBy: 'seller', buyerName: 'Camila', amountCents: 10000, activatedAt: ts('2026-10-01T09:00:00Z') });
    seedIssue('cyc2', { cardCode: 'GC-REUSE', activatedBy: 'seller', buyerName: 'Roberto', amountCents: 50000, activatedAt: ts('2026-11-01T09:00:00Z') });
    r = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null, cardCode: 'gc-reuse' }));
    check(
        'I. GC-REUSE aparece con sus 2 ciclos como filas independientes, más reciente primero, cada uno con su propio comprador/monto',
        r.ok && r.value.rows.length === 2 && r.value.rows[0].buyerName === 'Roberto' && r.value.rows[0].amountCents === 50000 && r.value.rows[1].buyerName === 'Camila' && r.value.rows[1].amountCents === 10000,
        JSON.stringify(r),
    );

    // J. paginación: pageSize=1, cursor de ida y vuelta, sin huecos ni repetidos
    console.log('\nJ. Paginación por cursor (pageSize=1)');
    reset();
    seedIssue('p1', { cardCode: 'GC-P', activatedBy: 'seller', activatedAt: ts('2026-10-01T00:00:00Z') });
    seedIssue('p2', { cardCode: 'GC-P', activatedBy: 'seller', activatedAt: ts('2026-10-02T00:00:00Z') });
    seedIssue('p3', { cardCode: 'GC-P', activatedBy: 'seller', activatedAt: ts('2026-10-03T00:00:00Z') });
    let page1 = await outcome(call(listGiftCardIssues, 'seller', { pageSize: 1, cursor: null }));
    check('J1. página 1: 1 fila (p3, más reciente), hasNext, total 3', page1.ok && page1.value.rows.length === 1 && page1.value.rows[0].id === 'p3' && page1.value.hasNext && page1.value.total === 3, JSON.stringify(page1));
    let page2 = await outcome(call(listGiftCardIssues, 'seller', { pageSize: 1, cursor: page1.value.nextCursor }));
    check('J2. página 2: 1 fila (p2), hasNext', page2.ok && page2.value.rows.length === 1 && page2.value.rows[0].id === 'p2' && page2.value.hasNext, JSON.stringify(page2));
    let page3 = await outcome(call(listGiftCardIssues, 'seller', { pageSize: 1, cursor: page2.value.nextCursor }));
    check('J3. página 3: 1 fila (p1), SIN hasNext (fin)', page3.ok && page3.value.rows.length === 1 && page3.value.rows[0].id === 'p1' && !page3.value.hasNext && page3.value.nextCursor === null, JSON.stringify(page3));

    // K-L. filtros: código y vendedor (admin)
    console.log('\nK-L. Filtros: código y vendedor');
    reset();
    seedIssue('fk1', { cardCode: 'GC-K1', activatedBy: 'seller' });
    seedIssue('fk2', { cardCode: 'GC-K2', activatedBy: 'seller2' });
    r = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null, cardCode: 'GC-K1' }));
    check('K. filtro por código: solo trae esa tarjeta', r.ok && r.value.rows.length === 1 && r.value.rows[0].cardCode === 'GC-K1', JSON.stringify(r));
    r = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null, sellerId: 'seller2' }));
    check('L. admin filtrando por vendedor: solo las de ese vendedor', r.ok && r.value.rows.length === 1 && r.value.rows[0].activatedBy === 'seller2', JSON.stringify(r));

    // ---------- N. Auditoría de paginación: bloques de replacements NUNCA
    // deben producir páginas artificialmente cortas o vacías, ni duplicar/
    // omitir ventas al avanzar con el cursor (prompt de auditoría previo al
    // commit) ----------
    console.log('\nN. Auditoría de paginación con bloques de reemplazos');

    // A) caso crítico exacto del prompt: 10 reemplazos seguidos (más
    // recientes) y DESPUÉS 3 ventas reales (más antiguas). La función debe
    // seguir leyendo internamente más de un batch de Firestore hasta reunir
    // una página completa — la PRIMERA página ya debe traer las 3 ventas,
    // nunca quedar vacía.
    reset();
    for (let i = 0; i < 10; i++) {
        seedIssue(`NA-R${i}`, {
            origin: 'replacement',
            activatedAt: ts(`2026-10-01T12:${String(59 - i).padStart(2, '0')}:00Z`),
        });
    }
    seedIssue('NA-S1', { activatedAt: ts('2026-10-01T12:49:00Z'), buyerName: 'Camila' });
    seedIssue('NA-S2', { activatedAt: ts('2026-10-01T12:48:00Z'), buyerName: 'Roberto' });
    seedIssue('NA-S3', { activatedAt: ts('2026-10-01T12:47:00Z'), buyerName: 'Maria' });

    r = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null }));
    check(
        'A) 10 reemplazos seguidos + 3 ventas reales DESPUÉS: la PRIMERA página ya encuentra las 3 ventas (nunca vacía ni "no encontrado")',
        r.ok &&
            r.value.rows.length === 3 &&
            r.value.rows.map((x) => x.id).join(',') === 'NA-S1,NA-S2,NA-S3' &&
            r.value.total === 3 &&
            !r.value.hasNext,
        JSON.stringify(r),
    );
    // E (parte 1): confirma, ANTES de reiniciar el store, que esos issues
    // "venta real" del caso A no tienen el campo `origin` en absoluto (nunca
    // se fija por defecto en `seedIssue`) — y aun así aparecieron arriba.
    const na1HasNoOrigin = store.get('giftCardIssues/NA-S1').origin === undefined;

    // B-D) mezcla replacement/sale alternada (R,S,R,S,...), pageSize chico:
    // cada página debe traer EXACTAMENTE `pageSize` ventas reales (nunca una
    // página corta solo porque intercaladamente hay reemplazos), y avanzar
    // con `nextCursor` no debe duplicar ni omitir ninguna.
    reset();
    const buyers = ['Camila', 'Roberto', 'Maria', 'Ana', 'Luis', 'Sofia'];
    let minute = 59; // nunca 60: "HH:60:00" no es un minuto válido
    for (let i = 1; i <= 6; i++) {
        seedIssue(`NB-R${i}`, {
            origin: 'replacement',
            activatedAt: ts(`2026-10-01T12:${String(minute--).padStart(2, '0')}:00Z`),
        });
        seedIssue(`NB-S${i}`, {
            activatedAt: ts(`2026-10-01T12:${String(minute--).padStart(2, '0')}:00Z`),
            buyerName: buyers[i - 1],
        });
    }

    let nb1 = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 2, cursor: null }));
    check(
        'B) mezcla R,S,R,S... con pageSize=2: página 1 trae EXACTAMENTE 2 ventas reales (NB-S1, NB-S2), hasNext',
        nb1.ok && nb1.value.rows.map((x) => x.id).join(',') === 'NB-S1,NB-S2' && nb1.value.hasNext && nb1.value.total === 6,
        JSON.stringify(nb1),
    );

    let nb2 = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 2, cursor: nb1.value.nextCursor }));
    check(
        'C-D) next cursor: página 2 trae NB-S3, NB-S4 — sin duplicar NB-S1/S2 (C) y sin omitir ninguna (D)',
        nb2.ok && nb2.value.rows.map((x) => x.id).join(',') === 'NB-S3,NB-S4' && nb2.value.hasNext,
        JSON.stringify(nb2),
    );

    let nb3 = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 2, cursor: nb2.value.nextCursor }));
    check(
        'página 3 (fin): NB-S5, NB-S6, sin hasNext — las 6 ventas se recorrieron exactamente una vez cada una',
        nb3.ok && nb3.value.rows.map((x) => x.id).join(',') === 'NB-S5,NB-S6' && !nb3.value.hasNext && nb3.value.nextCursor === null,
        JSON.stringify(nb3),
    );

    // E) issues históricos SIN el campo `origin` (anteriores al ajuste de
    // reemplazo) aparecen en el historial igual que un `origin: 'sale'`
    // explícito — todos los `seedIssue(...)` de A-D ya omiten `origin` a
    // propósito (nunca se fija por defecto en el fixture): esta prueba lo
    // deja explícito para que no dependa de "por casualidad".
    check(
        'E) issues históricos sin campo `origin` en absoluto SÍ aparecen (nunca se tratan como reemplazo)',
        na1HasNoOrigin && nb1.value.rows.some((x) => x.id === 'NB-S1'),
    );

    // F) filtro de vendedor + bloque de reemplazos: cada vendedor tiene sus
    // propios reemplazos intercalados: el filtro nunca debe "contaminarse"
    // con las ventas/reemplazos del otro vendedor.
    reset();
    seedIssue('NF-sellerA-R', { activatedBy: 'sellerA', origin: 'replacement', activatedAt: ts('2026-10-01T12:05:00Z') });
    seedIssue('NF-sellerA-S', { activatedBy: 'sellerA', activatedAt: ts('2026-10-01T12:04:00Z') });
    seedIssue('NF-sellerB-R', { activatedBy: 'sellerB', origin: 'replacement', activatedAt: ts('2026-10-01T12:03:00Z') });
    seedIssue('NF-sellerB-S', { activatedBy: 'sellerB', activatedAt: ts('2026-10-01T12:02:00Z') });

    let nf = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null, sellerId: 'sellerA' }));
    check(
        'F) filtro de vendedor + reemplazos intercalados: solo la venta real de ESE vendedor, nunca su reemplazo ni nada del otro',
        nf.ok && nf.value.rows.length === 1 && nf.value.rows[0].id === 'NF-sellerA-S' && nf.value.total === 1,
        JSON.stringify(nf),
    );

    // G) filtro de código + reemplazo Y venta sobre la MISMA tarjeta: el
    // reemplazo de esa tarjeta se excluye, la venta real se mantiene.
    reset();
    seedIssue('NG-R', { cardCode: 'GC-MIXED', origin: 'replacement', activatedAt: ts('2026-10-01T12:05:00Z') });
    seedIssue('NG-S', { cardCode: 'GC-MIXED', activatedAt: ts('2026-10-01T12:04:00Z') });
    seedIssue('NG-other', { cardCode: 'GC-OTHER', activatedAt: ts('2026-10-01T12:03:00Z') });

    let ng = await outcome(call(listGiftCardIssues, 'admin', { pageSize: 10, cursor: null, cardCode: 'GC-MIXED' }));
    check(
        'G) filtro de código sobre una tarjeta con reemplazo Y venta: solo la venta real de ESA tarjeta',
        ng.ok && ng.value.rows.length === 1 && ng.value.rows[0].id === 'NG-S' && ng.value.total === 1,
        JSON.stringify(ng),
    );

    console.log(`\n${pass} pasaron, ${fail} fallaron.\n`);
    if (fail > 0) process.exitCode = 1;
})();
