/**
 * Arnés de `dailySellerSummaries` (write-time aggregation, plan §29-ter):
 * ejecuta los handlers REALES de createSale/cancelSale/activateGiftCard/
 * topUpGiftCard/replaceGiftCard y la Function getSellerCashbox
 * (functions/lib/*.js, compilado) sobre un Firestore EN MEMORIA. No toca
 * Firebase — mismo arnés/mocks que sales.harness.js.
 *
 * Uso:  npm run test:functions        (compila Functions y corre este archivo)
 *       node tests/functions/daily-seller-summary.harness.js [dir-con-lib]
 */
const path = require('path');
const libDir = path.resolve(process.argv[2] || path.join(__dirname, '../../functions/lib'));
const label = 'dailySellerSummaries + getSellerCashbox (lib compilado)';

// ---------- Firestore en memoria (mismo mock que sales.harness.js) ----------
const store = new Map();
const clone = (o) => JSON.parse(JSON.stringify(o));
const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, p, v) {
    const ks = p.split('.');
    let o = obj;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks[ks.length - 1]] = v;
}
const resolveSentinel = (v, current) => {
    const n = v && v.constructor && v.constructor.name;
    if (n && n.includes('NumericIncrement')) return (current ?? 0) + v.operand;
    if (n && n.includes('ServerTimestamp')) return '<serverTimestamp>';
    return v;
};
const snap = (p) => {
    const data = store.has(p) ? store.get(p) : undefined;
    return {
        id: p.split('/').pop(),
        exists: data !== undefined,
        get: (f) => (data === undefined ? undefined : getPath(data, f)),
        data: () => data,
    };
};
const ref = (p) => ({ path: p, id: p.split('/').pop(), get: async () => snap(p) });
let autoId = 0;
const db = {
    doc: (p) => ref(p),
    collection: (c) => ({ doc: () => ref(`${c}/auto${++autoId}`) }),
    runTransaction: async (fn) => {
        const writes = [];
        const tx = {
            get: async (r) => snap(r.path),
            create: (r, d) => writes.push(['create', r.path, d]),
            update: (r, d) => writes.push(['update', r.path, d]),
            set: (r, d) => writes.push(['set', r.path, d]),
        };
        const result = await fn(tx);
        const draft = new Map([...store].map(([k, v]) => [k, clone(v)]));
        for (const [kind, p, d] of writes) {
            if (kind === 'create') {
                if (draft.has(p)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
                const doc = {};
                for (const [k, v] of Object.entries(d)) doc[k] = resolveSentinel(v, undefined);
                draft.set(p, doc);
            } else if (kind === 'update') {
                if (!draft.has(p)) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
                const doc = draft.get(p);
                for (const [k, v] of Object.entries(d)) setPath(doc, k, resolveSentinel(v, getPath(doc, k)));
            } else draft.set(p, d);
        }
        store.clear();
        for (const [k, v] of draft) store.set(k, v);
        return result;
    },
};

// ---------- inyectar mocks de ./admin y ./guards ----------
const inject = (file, exports) => {
    const p = require.resolve(path.join(libDir, file));
    require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
inject('admin.js', { db, storage: {}, auth: {} });
inject('guards.js', {
    assertActive: async (auth) => {
        if (!auth) throw Object.assign(new Error('unauthenticated'), { code: 'unauthenticated' });
        const s = snap(`users/${auth.uid}`);
        if (!s.exists || s.get('isActive') !== true) {
            throw Object.assign(new Error('inactive'), { code: 'permission-denied' });
        }
        return s;
    },
    assertAdmin: async (auth) => {
        const s = snap(`users/${auth.uid}`);
        if (s.get('role') !== 'admin') throw Object.assign(new Error('not admin'), { code: 'permission-denied' });
        return s;
    },
});
const { createSale, cancelSale } = require(path.join(libDir, 'sales.js'));
const { registerGiftCard, activateGiftCard, cancelGiftCard, replaceGiftCard, topUpGiftCard } = require(
    path.join(libDir, 'giftcards.js'),
);
const { getSellerCashbox } = require(path.join(libDir, 'sales-cashbox.js'));

// ---------- datos base ----------
const todayKey = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
function reset() {
    store.clear();
    store.set('users/mariela', { isActive: true, role: 'user', firstName: 'Mariela', lastName: 'Flores' });
    store.set('users/lenar', { isActive: true, role: 'user', firstName: 'Lenar', lastName: 'Lima' });
    store.set('users/admin', { isActive: true, role: 'admin', firstName: 'Ad', lastName: 'Min' });
    store.set('settings/app', { allowSaleWithoutStock: true, timezone: 'America/La_Paz' });
    store.set('products/bear', { isActive: true, stock: 10, priceCents: 7500, code: 'MP000010', name: 'BEAR' });
    store.set('products/cheap', { isActive: true, stock: 10, priceCents: 500, code: 'MP000011', name: 'Chico' });
    store.set('products/big', { isActive: true, stock: 10, priceCents: 97000, code: 'MP000012', name: 'Grande' });
}
function seedGiftCard(code, amountCents) {
    store.set(`giftCards/${code}`, { status: 'ACTIVE', activeCycleId: 'cy1', lastCycleId: 'cy1', cycleNumber: 1, amountCents });
    store.set('giftCardIssues/cy1', {
        status: 'active', cycleNumber: 1, buyerName: 'Comprador', activatedAt: 't', activatedBy: 'mariela', activatedByName: 'Mariela Flores',
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
const sellerSummary = (sellerId, dateKey = todayKey) => store.get(`dailySellerSummaries/${dateKey}_${sellerId}`);
const bear2 = [{ productId: 'bear', quantity: 2 }];

let pass = 0,
    fail = 0;
const check = (name, cond, extra = '') => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
};

(async () => {
    console.log(`\n===== ${label} =====`);

    // ---- createSale ----
    reset();
    let r = await outcome(call(createSale, 'mariela', { saleId: 'S1', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] }));
    check('S1. venta cash 150 → seller summary cash +150 / qr 0', r.ok && sellerSummary('mariela').cashCents === 15000 && sellerSummary('mariela').qrCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    r = await outcome(call(createSale, 'mariela', { saleId: 'S2', items: bear2, payments: [{ method: 'qr', amountCents: 15000 }] }));
    check('S2. venta QR 150 → seller summary qr +150 / cash 0', r.ok && sellerSummary('mariela').qrCents === 15000 && sellerSummary('mariela').cashCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    r = await outcome(call(createSale, 'mariela', { saleId: 'S3', items: bear2, payments: [{ method: 'cash', amountCents: 9000 }, { method: 'qr', amountCents: 6000 }] }));
    check('S3. cash+QR 90/60 → seller summary cash 90 / qr 60', r.ok && sellerSummary('mariela').cashCents === 9000 && sellerSummary('mariela').qrCents === 6000, JSON.stringify(sellerSummary('mariela')));

    // El complemento cash/QR exige que el pago `giftcard` consuma el saldo
    // COMPLETO de la tarjeta (nunca una porción menor) cuando ese saldo es
    // menor al total — mismo criterio ya probado en sales.harness.js (caso
    // E2): GC con saldo 700, total 970 (producto 'big'), complemento 270.
    reset();
    seedGiftCard('GC1', 70000);
    r = await outcome(call(createSale, 'mariela', {
        saleId: 'S4', items: [{ productId: 'big', quantity: 1 }],
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: 'GC1', giftCardCycleId: 'cy1' }, { method: 'cash', amountCents: 27000 }],
    }));
    check('S4. Gift Card 700 + cash 270: seller summary SOLO cash 270 (giftCardCents no cuenta)', r.ok && sellerSummary('mariela').cashCents === 27000 && sellerSummary('mariela').qrCents === 0, JSON.stringify(r.ok ? sellerSummary('mariela') : r));

    reset();
    seedGiftCard('GC1', 70000);
    r = await outcome(call(createSale, 'mariela', {
        saleId: 'S5', items: [{ productId: 'big', quantity: 1 }],
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: 'GC1', giftCardCycleId: 'cy1' }, { method: 'qr', amountCents: 27000 }],
    }));
    check('S5. Gift Card 700 + QR 270: seller summary SOLO qr 270', r.ok && sellerSummary('mariela').qrCents === 27000 && sellerSummary('mariela').cashCents === 0, JSON.stringify(r.ok ? sellerSummary('mariela') : r));

    // ---- cancelSale ----
    reset();
    await call(createSale, 'mariela', { saleId: 'S6', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] });
    check('S6-previo. summary cash 150 antes de anular', sellerSummary('mariela').cashCents === 15000);
    r = await outcome(call(cancelSale, 'admin', { saleId: 'S6', reason: 'prueba' }));
    check('S6. cancelSale resta EXACTAMENTE la venta: cash vuelve a 0', r.ok && sellerSummary('mariela').cashCents === 0 && sellerSummary('mariela').qrCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    await call(createSale, 'mariela', { saleId: 'S7', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] });
    r = await outcome(call(cancelSale, 'admin', { saleId: 'S7', reason: 'cancela otro admin' }));
    check('S7. cancelación ejecutada por "admin" revierte el summary del vendedor ORIGINAL (mariela), nunca el de "admin"',
        r.ok && sellerSummary('mariela').cashCents === 0 && sellerSummary('admin') === undefined, JSON.stringify([sellerSummary('mariela'), sellerSummary('admin')]));

    // ---- activateGiftCard ----
    reset();
    store.set('giftCards/GCA', { status: 'AVAILABLE', amountCents: 10000, cycleNumber: 0, activeCycleId: null, currentBuyerName: null });
    r = await outcome(call(activateGiftCard, 'mariela', { code: 'GCA', payments: [{ method: 'cash', amountCents: 10000 }] }));
    check('S8. activación GC cash 100 → seller summary cash +100', r.ok && sellerSummary('mariela').cashCents === 10000 && sellerSummary('mariela').qrCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    store.set('giftCards/GCB', { status: 'AVAILABLE', amountCents: 10000, cycleNumber: 0, activeCycleId: null, currentBuyerName: null });
    r = await outcome(call(activateGiftCard, 'mariela', { code: 'GCB', payments: [{ method: 'qr', amountCents: 10000 }] }));
    check('S9. activación GC QR 100 → seller summary qr +100', r.ok && sellerSummary('mariela').qrCents === 10000 && sellerSummary('mariela').cashCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    store.set('giftCards/GCC', { status: 'AVAILABLE', amountCents: 10000, cycleNumber: 0, activeCycleId: null, currentBuyerName: null });
    r = await outcome(call(activateGiftCard, 'mariela', { code: 'GCC', payments: [{ method: 'cash', amountCents: 6000 }, { method: 'qr', amountCents: 4000 }] }));
    check('S10. activación GC cash+QR 60/40 → seller summary cash 60 / qr 40', r.ok && sellerSummary('mariela').cashCents === 6000 && sellerSummary('mariela').qrCents === 4000, JSON.stringify(sellerSummary('mariela')));

    // ---- replacement ----
    reset();
    store.set('giftCards/GCD', { status: 'AVAILABLE', amountCents: 5000, cycleNumber: 0, activeCycleId: null, currentBuyerName: null });
    await call(activateGiftCard, 'mariela', { code: 'GCD', payments: [{ method: 'cash', amountCents: 5000 }] });
    check('S11-previo. activación GCD: summary cash 50', sellerSummary('mariela').cashCents === 5000);
    await call(cancelGiftCard, 'admin', { code: 'GCD', reason: 'perdida' });
    r = await outcome(call(replaceGiftCard, 'admin', { code: 'GCD' }));
    check('S11. replacement: NO modifica ningún seller summary (mariela intacto en 50, admin nunca creado)',
        r.ok && sellerSummary('mariela').cashCents === 5000 && sellerSummary('admin') === undefined, JSON.stringify(r));

    // ---- topUpGiftCard ----
    reset();
    store.set('giftCards/GCE', { status: 'ACTIVE', amountCents: 10000, balanceCents: 10000, balanceRevision: 0, cycleNumber: 1, activeCycleId: 'cyE' });
    store.set('giftCardIssues/cyE', { status: 'active', cycleNumber: 1, balanceCents: 10000, balanceRevision: 0 });
    r = await outcome(call(topUpGiftCard, 'mariela', { topUpId: 'T1', code: 'GCE', payments: [{ method: 'cash', amountCents: 10000 }] }));
    check('S12. top-up cash 100 → seller summary cash +100', r.ok && sellerSummary('mariela').cashCents === 10000 && sellerSummary('mariela').qrCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    store.set('giftCards/GCF', { status: 'ACTIVE', amountCents: 10000, balanceCents: 10000, balanceRevision: 0, cycleNumber: 1, activeCycleId: 'cyF' });
    store.set('giftCardIssues/cyF', { status: 'active', cycleNumber: 1, balanceCents: 10000, balanceRevision: 0 });
    r = await outcome(call(topUpGiftCard, 'mariela', { topUpId: 'T2', code: 'GCF', payments: [{ method: 'qr', amountCents: 10000 }] }));
    check('S13. top-up QR 100 → seller summary qr +100', r.ok && sellerSummary('mariela').qrCents === 10000 && sellerSummary('mariela').cashCents === 0, JSON.stringify(sellerSummary('mariela')));

    reset();
    store.set('giftCards/GCG', { status: 'ACTIVE', amountCents: 10000, balanceCents: 10000, balanceRevision: 0, cycleNumber: 1, activeCycleId: 'cyG' });
    store.set('giftCardIssues/cyG', { status: 'active', cycleNumber: 1, balanceCents: 10000, balanceRevision: 0 });
    r = await outcome(call(topUpGiftCard, 'mariela', { topUpId: 'T3', code: 'GCG', payments: [{ method: 'cash', amountCents: 6000 }, { method: 'qr', amountCents: 4000 }] }));
    check('S14. top-up cash+QR 60/40 → seller summary cash 60 / qr 40', r.ok && sellerSummary('mariela').cashCents === 6000 && sellerSummary('mariela').qrCents === 4000, JSON.stringify(sellerSummary('mariela')));

    reset();
    store.set('giftCards/GCH', { status: 'ACTIVE', amountCents: 10000, balanceCents: 10000, balanceRevision: 0, cycleNumber: 1, activeCycleId: 'cyH' });
    store.set('giftCardIssues/cyH', { status: 'active', cycleNumber: 1, balanceCents: 10000, balanceRevision: 0 });
    await call(topUpGiftCard, 'mariela', { topUpId: 'T4', code: 'GCH', payments: [{ method: 'cash', amountCents: 10000 }] });
    r = await outcome(call(topUpGiftCard, 'mariela', { topUpId: 'T4', code: 'GCH', payments: [{ method: 'cash', amountCents: 10000 }] }));
    check('S15. reintento con el MISMO topUpId: NO duplica el summary (sigue en 100, no 200)', r.ok && sellerSummary('mariela').cashCents === 10000, JSON.stringify([r, sellerSummary('mariela')]));

    reset();
    store.set('giftCards/GCI', { status: 'ACTIVE', amountCents: 10000, balanceCents: 10000, balanceRevision: 0, cycleNumber: 1, activeCycleId: 'cyI' });
    store.set('giftCardIssues/cyI', { status: 'active', cycleNumber: 1, balanceCents: 10000, balanceRevision: 0 });
    await call(topUpGiftCard, 'mariela', { topUpId: 'T5', code: 'GCI', payments: [{ method: 'cash', amountCents: 10000 }] });
    r = await outcome(call(topUpGiftCard, 'mariela', { topUpId: 'T6', code: 'GCI', payments: [{ method: 'cash', amountCents: 10000 }] }));
    check('S16. DOS topUpId distintos SÍ suman dos veces (200)', r.ok && sellerSummary('mariela').cashCents === 20000, JSON.stringify(sellerSummary('mariela')));

    // ---- getSellerCashbox ----
    reset();
    await call(createSale, 'mariela', { saleId: 'S17', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] });
    r = await outcome(call(getSellerCashbox, 'mariela', { dateKey: todayKey }));
    check('S17. getSellerCashbox (vendedor, 1 lectura) = su summary (150/0)', r.ok && r.value.cashCents === 15000 && r.value.qrCents === 0, JSON.stringify(r));

    r = await outcome(call(getSellerCashbox, 'mariela', { dateKey: todayKey, sellerId: 'lenar' }));
    check('S18. vendedor pidiendo otro UID → permission-denied', !r.ok && r.code === 'permission-denied', JSON.stringify(r));

    reset();
    await call(createSale, 'mariela', { saleId: 'S19a', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] });
    await call(createSale, 'lenar', { saleId: 'S19b', items: [{ productId: 'cheap', quantity: 10 }], payments: [{ method: 'cash', amountCents: 5000 }] });
    r = await outcome(call(getSellerCashbox, 'admin', { dateKey: todayKey, sellerId: 'mariela' }));
    check('S19. admin consulta vendedor específico (mariela) → solo la suya (150)', r.ok && r.value.cashCents === 15000, JSON.stringify(r));

    r = await outcome(call(getSellerCashbox, 'admin', { dateKey: todayKey }));
    check('S20. admin "Todos" (sin sellerId) → global de dailySummaries = 150 + 50 = 200',
        r.ok && r.value.cashCents === 20000, JSON.stringify(r));

    r = await outcome(call(getSellerCashbox, 'mariela', { dateKey: '2026-01-01' }));
    check('S21. día sin documento → 0/0', r.ok && r.value.cashCents === 0 && r.value.qrCents === 0, JSON.stringify(r));

    reset();
    for (let i = 0; i < 20; i++) {
        await call(createSale, 'mariela', { saleId: `S22-${i}`, items: [{ productId: 'cheap', quantity: 2 }], payments: [{ method: 'cash', amountCents: 1000 }] });
    }
    r = await outcome(call(getSellerCashbox, 'mariela', { dateKey: todayKey }));
    check('S22. 20 operaciones (ninguna "página" posible: 1 sola lectura) → total de las 20 (200)', r.ok && r.value.cashCents === 20000, JSON.stringify(r));

    console.log(`\n${label}: ${pass} PASS, ${fail} FAIL`);
    if (fail > 0) process.exitCode = 1;
})();
