/**
 * Arnés del backend de Ventas: ejecuta el handler REAL de createSale/cancelSale
 * (functions/lib/sales.js, compilado) sobre un Firestore EN MEMORIA. No toca Firebase.
 *
 * Solo se reemplazan ./admin (db/storage) y ./guards (lectura de users/{uid}); toda la lógica de
 * sales.js, sale-discount.js y date-keys.js es la real. Límite: no es Firestore (p. ej. no
 * reproduce la conversión de increment() a doubleValue) — no sustituye la prueba en DEV.
 *
 * Uso:  npm run test:functions        (compila Functions y corre este archivo)
 *       node tests/functions/sales.harness.js [dir-con-lib]
 */
const path = require('path');
const libDir = path.resolve(process.argv[2] || path.join(__dirname, '../../functions/lib'));
const label = 'createSale / cancelSale (lib compilado)';

// ---------- Firestore en memoria ----------
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
        // commit atómico: todo o nada
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
const { createSale, cancelSale } = require(path.join(libDir, 'sales.js'));

// ---------- datos base ----------
const todayKey = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
function reset() {
    store.clear();
    store.set('users/seller', { isActive: true, role: 'user', firstName: 'Vend', lastName: 'Edor' });
    store.set('users/admin', { isActive: true, role: 'admin', firstName: 'Ad', lastName: 'Min' });
    store.set('settings/app', { allowSaleWithoutStock: true, timezone: 'America/La_Paz' });
    store.set('products/bear', { isActive: true, stock: 10, priceCents: 7500, code: 'MP000010', name: 'BEAR' });
    store.set('products/cheap', { isActive: true, stock: 10, priceCents: 500, code: 'MP000011', name: 'Chico' });
    store.set('products/big', { isActive: true, stock: 10, priceCents: 97000, code: 'MP000012', name: 'Grande' });
}
function seedGiftCard(amountCents) {
    store.set('giftCards/GC-1', { status: 'ACTIVE', activeCycleId: 'cy1', cycleNumber: 1, amountCents });
    store.set('giftCardIssues/cy1', {
        status: 'active', cycleNumber: 1, buyerName: 'Comprador', activatedAt: 't', activatedBy: 'seller', activatedByName: 'V',
    });
}
const call = (fn, uid, data) => fn.run({ auth: { uid }, data, rawRequest: {} });
const sale = (id) => store.get(`sales/${id}`);
const summary = () => store.get(`dailySummaries/${todayKey}`);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
};
async function outcome(p) {
    try { return { ok: true, value: await p }; } catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
const bear2 = [{ productId: 'bear', quantity: 2 }];

(async () => {
    console.log(`\n===== ${label} =====`);

    // A. caso exacto reportado
    console.log('\nA. BEAR x2 (Bs 150), rebaja Bs 10, efectivo por el total final (Bs 140)');
    reset();
    let r = await outcome(call(createSale, 'seller', {
        saleId: 'A', items: bear2, payments: [{ method: 'cash', amountCents: 14000 }], discountCents: 1000,
    }));
    console.log('  resultado:', r.ok ? 'OK' : `${r.code}: ${r.message}`);
    if (r.ok) {
        const s = sale('A');
        check('subtotal 15000 / rebaja 1000 / total 14000', s.subtotalCents === 15000 && s.discountCents === 1000 && s.totalCents === 14000, JSON.stringify(s));
        check('payments = [cash 14000] (la rebaja no es un pago)', s.payments.length === 1 && s.payments[0].method === 'cash' && s.payments[0].amountCents === 14000);
        check('cashCents 14000, qr 0, giftcard 0', s.cashCents === 14000 && s.qrCents === 0 && s.giftCardCents === 0);
        check('stock 10 → 8', store.get('products/bear').stock === 8);
        const d = summary();
        check('dailySummary: total 14000, cash 14000, discount 1000, ventas 1', d.totalCents === 14000 && d.cashCents === 14000 && d.discountCents === 1000 && d.salesCount === 1, JSON.stringify(d));
        check('producto en resumen a precio de lista (15000 = total + rebaja)', d.products.bear.totalCents === 15000 && d.products.bear.qty === 2);
    }

    // B. payload del frontend ANTERIOR (sin discountCents)
    console.log('\nB. Frontend antiguo: sin discountCents, efectivo Bs 150');
    reset();
    r = await outcome(call(createSale, 'seller', { saleId: 'B', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] }));
    console.log('  resultado:', r.ok ? 'OK' : `${r.code}: ${r.message}`);
    if (r.ok) {
        const s = sale('B');
        check('total 15000, rebaja 0, subtotal 15000', s.totalCents === 15000 && s.discountCents === 0 && s.subtotalCents === 15000, JSON.stringify(s));
        check('resumen sin rebaja: discountCents = 0', summary().discountCents === 0);
    }

    // C. cobrar el subtotal ignorando la rebaja
    console.log('\nC. Rebaja Bs 10 pero pago por el subtotal (Bs 150) — debe rechazarse');
    reset();
    r = await outcome(call(createSale, 'seller', { saleId: 'C', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }], discountCents: 1000 }));
    console.log('  resultado:', r.ok ? 'OK' : `${r.code}: ${r.message}`);
    check('rechazado y sin venta ni cambio de stock', !r.ok && !sale('C') && store.get('products/bear').stock === 10);

    if (true) {
        // D. rechazos del servidor
        console.log('\nD. Rebajas inválidas (server-side)');
        for (const bad of [3500, 1234, -1000, 1000.5, 0.5, null, '1000', 10000]) {
            reset();
            r = await outcome(call(createSale, 'seller', { saleId: 'D', items: bear2, payments: [{ method: 'cash', amountCents: 14000 }], discountCents: bad }));
            check(`rechaza discountCents=${JSON.stringify(bad)}`, !r.ok && r.code === 'invalid-argument' && !sale('D'), r.message);
        }
        for (const [price, disc] of [[500, 500], [500, 1000]]) {
            reset();
            r = await outcome(call(createSale, 'seller', { saleId: 'D2', items: [{ productId: 'cheap', quantity: 1 }], payments: [{ method: 'cash', amountCents: 1 }], discountCents: disc }));
            check(`subtotal ${price} con rebaja ${disc} (total cero/negativo) rechazado`, !r.ok && r.code === 'failed-precondition' && !sale('D2'), r.message);
        }
        for (const d of [500, 1000, 1500, 2000, 2500, 3000]) {
            reset();
            r = await outcome(call(createSale, 'seller', { saleId: 'D3', items: [{ productId: 'big', quantity: 1 }], payments: [{ method: 'cash', amountCents: 97000 - d }], discountCents: d }));
            check(`Bs 970 con rebaja ${d / 100} → total ${(97000 - d) / 100}`, r.ok && sale('D3').totalCents === 97000 - d && sale('D3').discountCents === d, r.message);
        }

        // E. gift cards
        console.log('\nE. Gift Card con rebaja');
        reset(); seedGiftCard(100000);
        r = await outcome(call(createSale, 'seller', { saleId: 'E1', items: [{ productId: 'big', quantity: 1 }], discountCents: 2000,
            payments: [{ method: 'giftcard', amountCents: 95000, giftCardId: 'GC-1', giftCardCycleId: 'cy1' }] }));
        check('tarjeta 1000, total 950 → aplica 950', r.ok && sale('E1').giftCardCents === 95000 && sale('E1').totalCents === 95000, r.message);
        if (r.ok) {
            check('sobrante 50 (forfeit) en el pago y en el resumen', sale('E1').payments[0].giftCardForfeitedCents === 5000 && summary().giftCardForfeitedCents === 5000);
            check('tarjeta → AVAILABLE, ciclo redimido', store.get('giftCards/GC-1').status === 'AVAILABLE' && store.get('giftCardIssues/cy1').status === 'redeemed');
            const mv = [...store].filter(([k]) => k.startsWith('giftCardMovements/')).map(([, v]) => [v.type, v.amountCents]);
            check('movimientos REDEEMED 95000 + FORFEITED 5000', JSON.stringify(mv) === JSON.stringify([['REDEEMED', 95000], ['FORFEITED', 5000]]), JSON.stringify(mv));
            check('el resumen NO suma la rebaja como cobro (cash+qr+gift == total)', summary().cashCents + summary().qrCents + summary().giftCardCents === summary().totalCents);
        }
        reset(); seedGiftCard(50000);
        r = await outcome(call(createSale, 'seller', { saleId: 'E2', items: [{ productId: 'big', quantity: 1 }], discountCents: 2000,
            payments: [{ method: 'giftcard', amountCents: 50000, giftCardId: 'GC-1', giftCardCycleId: 'cy1' }, { method: 'cash', amountCents: 45000 }] }));
        check('tarjeta 500 + efectivo 450 sobre total 950', r.ok && sale('E2').giftCardCents === 50000 && sale('E2').cashCents === 45000 && sale('E2').totalCents === 95000, r.message);
        reset(); seedGiftCard(50000);
        r = await outcome(call(createSale, 'seller', { saleId: 'E3', items: [{ productId: 'big', quantity: 1 }], discountCents: 2000,
            payments: [{ method: 'giftcard', amountCents: 50000, giftCardId: 'GC-1', giftCardCycleId: 'cy1' }, { method: 'cash', amountCents: 47000 }] }));
        check('complemento calculado sobre el subtotal (470) rechazado', !r.ok && !sale('E3'), r.message);

        // F. cancelSale
        console.log('\nF. cancelSale');
        reset();
        await call(createSale, 'seller', { saleId: 'F1', items: bear2, payments: [{ method: 'cash', amountCents: 14000 }], discountCents: 1000 });
        await call(createSale, 'seller', { saleId: 'F2', items: bear2, payments: [{ method: 'cash', amountCents: 15000 }] });
        let d = summary();
        check('antes: 2 ventas, total 29000, rebajas 1000, stock 6', d.salesCount === 2 && d.totalCents === 29000 && d.discountCents === 1000 && store.get('products/bear').stock === 6, JSON.stringify(d));
        r = await outcome(call(cancelSale, 'admin', { saleId: 'F1', reason: 'prueba' }));
        d = summary();
        check('anular F1: ventas 1, total 15000, cash 15000, rebajas 0, stock 8', r.ok && d.salesCount === 1 && d.totalCents === 15000 && d.cashCents === 15000 && d.discountCents === 0 && store.get('products/bear').stock === 8, r.message + JSON.stringify(d));
        check('F1 queda cancelled y conserva sus 3 importes', sale('F1').status === 'cancelled' && sale('F1').subtotalCents === 15000 && sale('F1').discountCents === 1000 && sale('F1').totalCents === 14000);
        check('producto en resumen revertido a precio de lista (15000 → qty 2)', d.products.bear.totalCents === 15000 && d.products.bear.qty === 2);

        // G. venta histórica (sin campos nuevos) + resumen histórico sin discountCents
        console.log('\nG. Venta y resumen HISTÓRICOS (sin campos de rebaja)');
        reset();
        store.set('sales/H', { sellerId: 'seller', sellerName: 'V', status: 'completed', dateKey: todayKey, monthKey: 'x', year: 2026,
            items: [{ productId: 'bear', code: 'MP000010', name: 'BEAR', unitPriceCents: 7500, quantity: 2, subtotalCents: 15000 }],
            totalCents: 15000, cashCents: 15000, qrCents: 0, giftCardCents: 0, payments: [{ method: 'cash', amountCents: 15000 }], paymentMethods: ['cash'] });
        store.set(`dailySummaries/${todayKey}`, { dateKey: todayKey, monthKey: 'x', year: 2026, salesCount: 1, itemsCount: 2, totalCents: 15000, cashCents: 15000, qrCents: 0,
            giftCardCents: 0, giftCardsIssuedCents: 0, giftCardForfeitedCents: 0, products: { bear: { code: 'MP000010', name: 'BEAR', qty: 2, totalCents: 15000 } } });
        r = await outcome(call(createSale, 'seller', { saleId: 'G1', items: bear2, payments: [{ method: 'cash', amountCents: 14000 }], discountCents: 1000 }));
        d = summary();
        check('venta con rebaja sobre resumen sin el campo: discountCents = 1000, total 29000', r.ok && d.discountCents === 1000 && d.totalCents === 29000, r.message + JSON.stringify(d));
        r = await outcome(call(cancelSale, 'admin', { saleId: 'H', reason: 'histórica' }));
        d = summary();
        check('anular la histórica: total 14000, rebajas intactas (1000), sin NaN', r.ok && d.totalCents === 14000 && d.discountCents === 1000 && d.cashCents === 14000, r.message + JSON.stringify(d));
    }


    // ---------- H. Pago mixto Efectivo + QR y endurecimiento de payments[] (Ajuste de Ventas, obs. 2) ----------
    console.log('\nH. Efectivo + QR (total Bs 140 = 150 − rebaja 10)');
    const attempt = async (id, payments, { gift } = {}) => {
        reset();
        if (gift) seedGiftCard(gift);
        const r = await outcome(call(createSale, 'seller', { saleId: id, items: bear2, payments, discountCents: 1000 }));
        return { r, doc: sale(id) ? clone(sale(id)) : null, sum: summary() ? clone(summary()) : null, stock: store.get('products/bear').stock };
    };
    const rejected = (name, x, code, part) =>
        check(name, !x.r.ok && x.r.code === code && (!part || x.r.message.includes(part)) && !x.doc && x.stock === 10, x.r.ok ? 'fue ACEPTADA' : x.r.code + ': ' + x.r.message);
    const cash = (n) => ({ method: 'cash', amountCents: n });
    const qr = (n) => ({ method: 'qr', amountCents: n });
    const gc = (n) => ({ method: 'giftcard', amountCents: n, giftCardId: 'GC-1', giftCardCycleId: 'cy1' });

    let m1 = await attempt('H1', [cash(10000), qr(4000)]);
    check('efectivo 100 + QR 40: aceptada; total 14000, cash 10000, qr 4000, rebaja 1000',
        m1.r.ok && m1.doc.totalCents === 14000 && m1.doc.cashCents === 10000 && m1.doc.qrCents === 4000 && m1.doc.giftCardCents === 0 && m1.doc.discountCents === 1000, JSON.stringify(m1.doc));
    check('Σ payments == totalCents y el QR nace pending', m1.doc.payments.reduce((s, p) => s + p.amountCents, 0) === m1.doc.totalCents && m1.doc.payments[1].voucherStatus === 'pending');
    check('resumen: total 14000, cash 10000, qr 4000, giftcard 0, rebajas 1000, 1 venta (sin duplicar)',
        m1.sum.totalCents === 14000 && m1.sum.cashCents === 10000 && m1.sum.qrCents === 4000 && m1.sum.giftCardCents === 0 && m1.sum.discountCents === 1000 && m1.sum.salesCount === 1, JSON.stringify(m1.sum));
    check('resumen: cash + qr + giftcard == total', m1.sum.cashCents + m1.sum.qrCents + m1.sum.giftCardCents === m1.sum.totalCents);

    let m2 = await attempt('H2', [qr(4000), cash(10000)]);
    check('QR 40 + efectivo 100 (orden inverso): mismos importes y mismo resumen',
        m2.r.ok && m2.doc.cashCents === 10000 && m2.doc.qrCents === 4000 && m2.doc.totalCents === 14000 && JSON.stringify({ ...m2.sum, updatedAt: 0 }) === JSON.stringify({ ...m1.sum, updatedAt: 0 }));
    check('el orden de payments[] se conserva TAL CUAL (el voucher se resuelve por su índice real)',
        JSON.stringify(m1.doc.payments.map((p) => p.method)) === '["cash","qr"]' && JSON.stringify(m2.doc.payments.map((p) => p.method)) === '["qr","cash"]');
    let m3 = await attempt('H3', [cash(4000), qr(10000)]);
    check('QR 100 + efectivo 40: aceptada', m3.r.ok && m3.doc.cashCents === 4000 && m3.doc.qrCents === 10000);

    rejected('suma distinta al total (100 + 30) rechazada', await attempt('H4', [cash(10000), qr(3000)]), 'failed-precondition', 'no coincide');
    rejected('cobrar el subtotal (100 + 50) ignorando la rebaja, rechazado', await attempt('H4b', [cash(10000), qr(5000)]), 'failed-precondition', 'no coincide');
    rejected('efectivo + efectivo rechazado', await attempt('H5', [cash(7000), cash(7000)]), 'invalid-argument', 'repetir');
    rejected('QR + QR rechazado', await attempt('H5b', [qr(7000), qr(7000)]), 'invalid-argument', 'repetir');
    rejected('dos gift cards rechazadas', await attempt('H5c', [gc(5000), gc(5000)], { gift: 5000 }), 'invalid-argument', 'gift card');
    rejected('tres pagos (gift card + efectivo + QR) rechazados con mensaje claro', await attempt('H6', [gc(5000), cash(5000), qr(4000)], { gift: 5000 }), 'invalid-argument', 'máximo dos');
    rejected('tres pagos (cash + qr + cash) rechazados', await attempt('H6b', [cash(5000), qr(4000), cash(5000)]), 'invalid-argument', 'máximo dos');
    rejected('lista vacía rechazada', await attempt('H6c', []), 'invalid-argument', 'al menos una');
    rejected('QR de 0 rechazado', await attempt('H7', [cash(14000), qr(0)]), 'invalid-argument', 'inválido');
    rejected('QR negativo rechazado', await attempt('H7b', [cash(15000), qr(-1000)]), 'invalid-argument', 'inválido');
    rejected('importe decimal rechazado', await attempt('H7c', [cash(10000.5), qr(3999.5)]), 'invalid-argument', 'inválido');
    rejected('método desconocido rechazado', await attempt('H7d', [cash(10000), { method: 'debit', amountCents: 4000 }]), 'invalid-argument');

    console.log('\nH-bis. Combinaciones ya existentes, sin regresión');
    let g1 = await attempt('H8', [gc(5000), cash(9000)], { gift: 5000 });
    check('Gift Card + efectivo: aceptada (gift 50 + cash 90)', g1.r.ok && g1.doc.giftCardCents === 5000 && g1.doc.cashCents === 9000 && g1.doc.qrCents === 0 && g1.doc.totalCents === 14000, g1.r.message);
    let g2 = await attempt('H9', [gc(5000), qr(9000)], { gift: 5000 });
    check('Gift Card + QR: aceptada; el QR está en el índice 1 y nace pending', g2.r.ok && g2.doc.qrCents === 9000 && g2.doc.payments[1].method === 'qr' && g2.doc.payments[1].voucherStatus === 'pending', g2.r.message);
    let g3 = await attempt('H10', [gc(14000)], { gift: 14000 });
    check('Gift Card que cubre exacto el total: aceptada (giftCardCents 14000)', g3.r.ok && g3.doc.giftCardCents === 14000 && g3.doc.cashCents === 0, g3.r.message);
    let s1 = await attempt('H11', [cash(14000)]);
    check('solo efectivo: aceptada', s1.r.ok && s1.doc.cashCents === 14000 && s1.doc.qrCents === 0);
    let s2 = await attempt('H12', [qr(14000)]);
    check('solo QR: aceptada; QR en el índice 0', s2.r.ok && s2.doc.qrCents === 14000 && s2.doc.payments[0].method === 'qr');

    console.log('\nH-ter. Anulación de ventas mixtas: cada importe se revierte UNA sola vez');
    reset();
    await call(createSale, 'seller', { saleId: 'X1', items: bear2, payments: [cash(10000), qr(4000)], discountCents: 1000 });
    await call(createSale, 'seller', { saleId: 'X2', items: bear2, payments: [qr(4000), cash(11000)] });
    let dsum = summary();
    check('antes: 2 ventas, total 29000, cash 21000, qr 8000, rebajas 1000, stock 6',
        dsum.salesCount === 2 && dsum.totalCents === 29000 && dsum.cashCents === 21000 && dsum.qrCents === 8000 && dsum.discountCents === 1000 && store.get('products/bear').stock === 6, JSON.stringify(dsum));
    let rc1 = await outcome(call(cancelSale, 'admin', { saleId: 'X1', reason: 'prueba' }));
    dsum = summary();
    check('anular X1: queda solo X2 (total 15000, cash 11000, qr 4000, rebajas 0, 1 venta, stock 8)',
        rc1.ok && dsum.salesCount === 1 && dsum.totalCents === 15000 && dsum.cashCents === 11000 && dsum.qrCents === 4000 && dsum.discountCents === 0 && store.get('products/bear').stock === 8, JSON.stringify(dsum));
    let rc2 = await outcome(call(cancelSale, 'admin', { saleId: 'X1', reason: 'otra vez' }));
    check('anular X1 dos veces se rechaza y no revierte de nuevo', !rc2.ok && summary().totalCents === 15000 && summary().qrCents === 4000 && store.get('products/bear').stock === 8);
    check('X1 conserva sus pagos y sus importes tras anularse', sale('X1').status === 'cancelled' && sale('X1').cashCents === 10000 && sale('X1').qrCents === 4000 && sale('X1').payments.length === 2);

    console.log(`\n${label}: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
