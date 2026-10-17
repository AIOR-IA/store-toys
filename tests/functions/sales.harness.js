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
const {
    activateGiftCard, cancelGiftCard, suspendGiftCard, reactivateGiftCard,
    registerGiftCard, registerGiftCardBatch, updateGiftCardAmount, replaceGiftCard,
} = require(path.join(libDir, 'giftcards.js'));

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

    // B2. «Sin rebaja» como lo envía el frontend corregido: discountCents = 0 EXPLÍCITO.
    // (El SDK de callable serializa `undefined` como `null`, que se rechaza: ver D.)
    console.log('\nB2. «Sin rebaja»: discountCents = 0 explícito (efectivo, QR, Efectivo + QR)');
    for (const [id, payments] of [
        ['B2a', [{ method: 'cash', amountCents: 15000 }]],
        ['B2b', [{ method: 'qr', amountCents: 15000 }]],
        ['B2c', [{ method: 'cash', amountCents: 5000 }, { method: 'qr', amountCents: 10000 }]],
    ]) {
        reset();
        r = await outcome(call(createSale, 'seller', { saleId: id, items: bear2, payments, discountCents: 0 }));
        console.log(`  ${id}:`, r.ok ? 'OK' : `${r.code}: ${r.message}`);
        check(`${id}: acepta discountCents=0 → subtotal 15000, rebaja 0, total 15000`, r.ok && sale(id).subtotalCents === 15000 && sale(id).discountCents === 0 && sale(id).totalCents === 15000, r.message);
        if (r.ok) check(`${id}: resumen sin rebaja (0) y Σ pagos = total`, summary().discountCents === 0 && sale(id).payments.reduce((s, p) => s + p.amountCents, 0) === 15000);
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


    // ---- Regla: la Gift Card es ingreso al VENDERSE; el canje no es dinero nuevo ----
    console.log('\nI. Canjes de Gift Card: qué entra (y qué NO) en cashCents / qrCents del resumen');
    const gcPay = (amount) => ({ method: 'giftcard', amountCents: amount, giftCardId: 'GC-1', giftCardCycleId: 'cy1' });
    const seedProducts = () => {
        store.set('products/p1000', { isActive: true, stock: 10, priceCents: 100000, code: 'MP000101', name: 'Mil' });
        store.set('products/p700', { isActive: true, stock: 10, priceCents: 70000, code: 'MP000102', name: 'Setecientos' });
        store.set('products/p1080', { isActive: true, stock: 10, priceCents: 108000, code: 'MP000103', name: 'Mil ochenta' });
        store.set('products/p800', { isActive: true, stock: 10, priceCents: 80000, code: 'MP000104', name: 'Ochocientos' });
    };
    // Cobros reales del resumen (misma fórmula que Reportes: ventas + emisiones).
    const received = (d) => ({ cash: d.cashCents + (d.giftCardIssuesCashCents ?? 0), qr: d.qrCents + (d.giftCardIssuesQrCents ?? 0) });
    const scenario = async (id, product, payments, discountCents) => {
        reset(); seedProducts(); seedGiftCard(100000);
        const r = await outcome(call(createSale, 'seller', { saleId: id, items: [{ productId: product, quantity: 1 }], payments, ...(discountCents ? { discountCents } : { discountCents: 0 }) }));
        return { r, s: sale(id), d: summary() };
    };
    const idsHold = (d) => d.totalCents === d.cashCents + d.qrCents + d.giftCardCents;

    let sc = await scenario('I3', 'p1000', [gcPay(100000)]);
    check('3. canje exacto: mercadería 1000, GC aplicada 1000, efectivo 0, QR 0, sobrante 0',
        sc.r.ok && sc.d.totalCents === 100000 && sc.d.giftCardCents === 100000 && sc.d.cashCents === 0 && sc.d.qrCents === 0 && sc.d.giftCardForfeitedCents === 0, sc.r.message);
    check('3. entrada nueva = 0 (cash+qr de ventas)', received(sc.d).cash === 0 && received(sc.d).qr === 0);

    sc = await scenario('I4', 'p700', [gcPay(70000)]);
    check('4. canje menor: mercadería 700, GC aplicada 700, sobrante 300 SOLO como dato (nunca en cash/qr)',
        sc.r.ok && sc.d.totalCents === 70000 && sc.d.giftCardCents === 70000 && sc.d.giftCardForfeitedCents === 30000 && sc.d.cashCents === 0 && sc.d.qrCents === 0, sc.r.message);
    check('4. entrada nueva = 0 y cash+qr+gc == total (el sobrante no entra en la identidad)', received(sc.d).cash === 0 && received(sc.d).qr === 0 && idsHold(sc.d));

    sc = await scenario('I5', 'p1080', [gcPay(100000), { method: 'cash', amountCents: 8000 }]);
    check('5. mayor + efectivo: mercadería 1080, GC 1000, efectivo nuevo 80, QR 0',
        sc.r.ok && sc.d.totalCents === 108000 && sc.d.giftCardCents === 100000 && sc.d.cashCents === 8000 && sc.d.qrCents === 0 && idsHold(sc.d), sc.r.message);

    sc = await scenario('I6', 'p1080', [gcPay(100000), { method: 'qr', amountCents: 8000 }]);
    check('6. mayor + QR: mercadería 1080, GC 1000, QR nuevo 80, efectivo 0',
        sc.r.ok && sc.d.totalCents === 108000 && sc.d.giftCardCents === 100000 && sc.d.qrCents === 8000 && sc.d.cashCents === 0 && idsHold(sc.d), sc.r.message);

    sc = await scenario('I7', 'p1080', [gcPay(100000), { method: 'cash', amountCents: 5000 }], 3000);
    check('7. subtotal 1080, rebaja 30, total 1050 = GC 1000 + efectivo 50',
        sc.r.ok && sc.s.subtotalCents === 108000 && sc.s.discountCents === 3000 && sc.s.totalCents === 105000 && sc.s.cashCents === 5000 && sc.s.giftCardCents === 100000 && sc.d.discountCents === 3000 && idsHold(sc.d), sc.r.message);
    check('7. entrada nueva del día = 50 (no 1000)', received(sc.d).cash === 5000 && received(sc.d).qr === 0);

    // (El negocio dijo «rebaja 100», pero el máximo vigente es Bs 30 — createSale rechaza 100. Mismo principio con la rebaja máxima.)
    sc = await scenario('I8', 'p800', [gcPay(77000)], 3000);
    check('8. subtotal 800, rebaja 30, total 770, GC 1000: aplica 770, sobrante 230, efectivo/QR 0',
        sc.r.ok && sc.s.totalCents === 77000 && sc.d.giftCardCents === 77000 && sc.d.giftCardForfeitedCents === 23000 && sc.d.cashCents === 0 && sc.d.qrCents === 0 && idsHold(sc.d), sc.r.message);
    check('8. entrada nueva = 0', received(sc.d).cash === 0 && received(sc.d).qr === 0);
    sc = await scenario('I8b', 'p800', [gcPay(70000)], 10000);
    check('8b. rebaja Bs 100 (fuera de la lista) sigue rechazada', !sc.r.ok && !sale('I8b'), sc.r.message);

    console.log('\nJ. cancelSale de una venta pagada con Gift Card NO toca el ingreso de la EMISIÓN');
    reset(); seedProducts(); seedGiftCard(100000);
    // La emisión (activateGiftCard) ya dejó su rastro en el resumen del día: 1000 cobrados en efectivo.
    store.set(`dailySummaries/${todayKey}`, { dateKey: todayKey, monthKey: 'x', year: 2026, salesCount: 0, itemsCount: 0, totalCents: 0, discountCents: 0, cashCents: 0, qrCents: 0,
        giftCardCents: 0, giftCardsIssuedCents: 100000, giftCardForfeitedCents: 0, giftCardIssuesCashCents: 100000, giftCardIssuesQrCents: 0, products: {} });
    r = await outcome(call(createSale, 'seller', { saleId: 'J1', items: [{ productId: 'p700', quantity: 1 }], payments: [gcPay(70000)], discountCents: 0 }));
    d = summary();
    check('canje menor sobre un día con emisión: cobros = solo la emisión (1000), no 1700', r.ok && received(d).cash === 100000 && received(d).qr === 0 && d.giftCardCents === 70000, r.message + JSON.stringify(d));
    r = await outcome(call(cancelSale, 'admin', { saleId: 'J1', reason: 'prueba' }));
    d = summary();
    check('anular: la GC aplicada y el sobrante se revierten', r.ok && d.giftCardCents === 0 && d.giftCardForfeitedCents === 0 && d.totalCents === 0, r.message + JSON.stringify(d));
    check('anular: la emisión sigue INTACTA (emitidas 1000, efectivo de emisión 1000, cobros 1000)',
        d.giftCardsIssuedCents === 100000 && d.giftCardIssuesCashCents === 100000 && d.giftCardIssuesQrCents === 0 && received(d).cash === 100000, JSON.stringify(d));


    // ---- Gift Card: la venta es ingreso definitivo; cancelar la tarjeta NO es devolución ----
    console.log('\nK. cancelGiftCard / suspender / reactivar / canjear NO tocan el ingreso de la emisión');
    const gcCard = (code, status = 'AVAILABLE', amountCents = 100000) =>
        store.set(`giftCards/${code}`, { status, amountCents, cycleNumber: 0, activeCycleId: null, currentBuyerName: null });
    const issuesOf = (d) => ({ issued: d.giftCardsIssuedCents, cash: d.giftCardIssuesCashCents, qr: d.giftCardIssuesQrCents });
    const freezeSummary = () => JSON.stringify(Object.fromEntries(Object.entries(summary() ?? {}).filter(([k]) => k !== 'updatedAt')));
    const movs = (type) => [...store].filter(([k, v]) => k.startsWith('giftCardMovements/') && v.type === type).length;
    const base = () => { reset(); seedProducts(); store.set('users/seller2', { isActive: true, role: 'user', firstName: 'Otro', lastName: 'Vendedor' }); };

    // A. AVAILABLE nunca vendida
    base(); gcCard('GCA00001');
    r = await outcome(call(cancelGiftCard, 'admin', { code: 'GCA00001', reason: 'dañada' }));
    check('A. AVAILABLE nunca vendida: cancelar → CANCELLED y no existe ningún ingreso que afectar',
        r.ok && store.get('giftCards/GCA00001').status === 'CANCELLED' && !summary() && movs('CANCELLED') === 1, r.message);

    // B. ACTIVE vendida en efectivo
    base(); gcCard('GCB00001');
    r = await outcome(call(activateGiftCard, 'seller', { code: 'GCB00001', buyerName: 'Ana', payments: [{ method: 'cash', amountCents: 100000 }] }));
    check('B. emisión: +1000 emitidas, +1000 efectivo de emisión', r.ok && JSON.stringify(issuesOf(summary())) === JSON.stringify({ issued: 100000, cash: 100000, qr: 0 }), r.message);
    let before = freezeSummary();
    r = await outcome(call(cancelGiftCard, 'admin', { code: 'GCB00001', reason: 'baja administrativa' }));
    check('B. ACTIVE vendida: cancelar → tarjeta CANCELLED, ciclo cancelled, movimiento CANCELLED',
        r.ok && store.get('giftCards/GCB00001').status === 'CANCELLED' && [...store].some(([k, v]) => k.startsWith('giftCardIssues/') && v.cardCode === 'GCB00001' && v.status === 'cancelled') && movs('CANCELLED') === 1, r.message);
    check('B. la emisión histórica PERMANECE: emitidas 1000, efectivo 1000 (dailySummary idéntico)', freezeSummary() === before && issuesOf(summary()).issued === 100000 && issuesOf(summary()).cash === 100000);

    // C. ACTIVE vendida por QR
    base(); gcCard('GCC00001', 'AVAILABLE', 50000);
    await call(activateGiftCard, 'seller', { code: 'GCC00001', payments: [{ method: 'qr', amountCents: 50000 }] });
    before = freezeSummary();
    r = await outcome(call(cancelGiftCard, 'admin', { code: 'GCC00001', reason: 'x' }));
    check('C. ACTIVE vendida por QR: cancelar → el QR de la emisión permanece', r.ok && freezeSummary() === before && issuesOf(summary()).qr === 50000 && issuesOf(summary()).issued === 50000, r.message);

    // D. SUSPENDED previamente vendida
    base(); gcCard('GCD00001');
    await call(activateGiftCard, 'seller', { code: 'GCD00001', payments: [{ method: 'cash', amountCents: 60000 }, { method: 'qr', amountCents: 40000 }] });
    r = await outcome(call(suspendGiftCard, 'seller', { code: 'GCD00001', reason: 'perdida' }));
    check('D. suspender: no toca los ingresos', r.ok && store.get('giftCards/GCD00001').status === 'SUSPENDED' && JSON.stringify(issuesOf(summary())) === JSON.stringify({ issued: 100000, cash: 60000, qr: 40000 }), r.message);
    before = freezeSummary();
    r = await outcome(call(cancelGiftCard, 'admin', { code: 'GCD00001', reason: 'no apareció' }));
    check('D. SUSPENDED vendida: cancelar mantiene el ingreso original (1000 = 600 efectivo + 400 QR)', r.ok && store.get('giftCards/GCD00001').status === 'CANCELLED' && freezeSummary() === before, r.message);

    // E. suspender / reactivar
    base(); gcCard('GCE00001');
    await call(activateGiftCard, 'seller', { code: 'GCE00001', payments: [{ method: 'cash', amountCents: 100000 }] });
    before = freezeSummary();
    await call(suspendGiftCard, 'seller', { code: 'GCE00001', reason: 'x' });
    r = await outcome(call(reactivateGiftCard, 'seller', { code: 'GCE00001' }));
    check('E. suspender + reactivar: ACTIVE de nuevo, mismo ciclo, ingresos intactos', r.ok && store.get('giftCards/GCE00001').status === 'ACTIVE' && store.get('giftCards/GCE00001').cycleNumber === 1 && freezeSummary() === before, r.message);

    // F. canjear no genera ingreso nuevo (y la emisión queda intacta)
    base(); gcCard('GCF00001');
    await call(activateGiftCard, 'seller', { code: 'GCF00001', payments: [{ method: 'cash', amountCents: 100000 }] });
    const cycleF = store.get('giftCards/GCF00001').activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'K-F', items: [{ productId: 'p700', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: 'GCF00001', giftCardCycleId: cycleF }] }));
    d = summary();
    check('F. canjear: cobros del día siguen siendo SOLO la emisión (1000); la GC aplicada no es dinero nuevo',
        r.ok && received(d).cash === 100000 && received(d).qr === 0 && d.giftCardCents === 70000 && issuesOf(d).issued === 100000, r.message + JSON.stringify(d));

    // G. cancelar la venta de mercadería pagada con GC no toca la emisión
    r = await outcome(call(cancelSale, 'admin', { saleId: 'K-F', reason: 'prueba' }));
    d = summary();
    check('G. cancelSale de una venta pagada con GC: emisión intacta (1000) y la GC aplicada vuelve a 0',
        r.ok && issuesOf(d).issued === 100000 && issuesOf(d).cash === 100000 && d.giftCardCents === 0 && received(d).cash === 100000, r.message + JSON.stringify(d));

    // H. atribución: cada emisión guarda quién la hizo (activatedBy) — base del filtro por vendedor
    base(); gcCard('GCH00001'); gcCard('GCH00002', 'AVAILABLE', 50000);
    await call(activateGiftCard, 'seller', { code: 'GCH00001', payments: [{ method: 'cash', amountCents: 100000 }] });
    await call(activateGiftCard, 'seller2', { code: 'GCH00002', payments: [{ method: 'qr', amountCents: 50000 }] });
    const byCode = (c) => [...store].find(([k, v]) => k.startsWith('giftCardIssues/') && v.cardCode === c)[1];
    check('H. emisiones atribuidas: GCH00001 → seller, GCH00002 → seller2 (activatedBy + dateKey + payments)',
        byCode('GCH00001').activatedBy === 'seller' && byCode('GCH00002').activatedBy === 'seller2' && byCode('GCH00001').dateKey === todayKey
        && byCode('GCH00002').payments[0].method === 'qr', JSON.stringify([byCode('GCH00001'), byCode('GCH00002')]));
    check('H. general = 1500 (1000 efectivo + 500 QR)', JSON.stringify(issuesOf(summary())) === JSON.stringify({ issued: 150000, cash: 100000, qr: 50000 }), JSON.stringify(summary()));

    // ---- Identidad ≠ monto: código GLOBAL generado, independiente de la denominación ----
    console.log('\nL. Códigos generados: contador global (NO por denominación)');
    base();
    let rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 10000, codeMode: 'generated' }));
    check('L1. primer código generado: GC-000001', rg.ok && rg.value.cardCode === 'GC-000001', JSON.stringify(rg));
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 100000, codeMode: 'generated' }));
    check('L2. segundo código (denominación DISTINTA) sigue la MISMA secuencia: GC-000002',
        rg.ok && rg.value.cardCode === 'GC-000002', JSON.stringify(rg));
    let rb = await outcome(call(registerGiftCardBatch, 'admin', { amountCents: 50000, codeMode: 'generated', quantity: 3 }));
    check('L3. lote de 3: GC-000003..GC-000005, continuando la secuencia',
        rb.ok && JSON.stringify(rb.value.cardCodes) === JSON.stringify(['GC-000003', 'GC-000004', 'GC-000005']), JSON.stringify(rb));
    check('L4. ningún código generado contiene el monto (ni "100", ni "500", ni "1000")',
        [rg, rb].every(() => true) && !['GC-000001', 'GC-000002', ...rb.value.cardCodes].some((c) => /GC(100|500|1000)/.test(c)));
    let rm = await outcome(call(registerGiftCard, 'admin', { code: 'GC500-ANT', amountCents: 50000, codeMode: 'manual' }));
    check('L5. código manual (formato viejo, con denominación en el texto) sigue funcionando sin cambios',
        rm.ok && rm.value.cardCode === 'GC500-ANT', JSON.stringify(rm));
    // Colisión: alguien registró a mano justo el siguiente candidato de la secuencia.
    await call(registerGiftCard, 'admin', { code: 'GC-000006', amountCents: 99900, codeMode: 'manual' });
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 20000, codeMode: 'generated' }));
    check('L6. candidato ocupado (GC-000006, manual) se salta sin pisarlo: siguiente generado es GC-000007',
        rg.ok && rg.value.cardCode === 'GC-000007' && store.get('giftCards/GC-000006').amountCents === 99900, JSON.stringify(rg));
    rg = await outcome(call(registerGiftCard, 'admin', { code: 'x', amountCents: 10000 }));
    check('L7. como vendedor (no admin), registrar se rechaza', !(await outcome(call(registerGiftCard, 'seller', { code: 'y', amountCents: 100 }))).ok);

    // Contador global TODAVÍA NO EXISTE, pero YA hay códigos GC-000001/GC-000002
    // registrados a mano (datos previos a este ajuste, o una imprenta que
    // coincidió con el formato nuevo) — el generador debe arrancar en 0,
    // detectar la colisión en el PRIMER candidato (no solo en uno intermedio
    // como L6) y saltar hasta encontrar uno libre, sin sobreescribir nada.
    console.log('\nL8. Contador global nuevo + GC-000001/GC-000002 ya existentes (manual): sin colisión, sin sobreescritura');
    base();
    await call(registerGiftCard, 'admin', { code: 'GC-000001', amountCents: 30000, codeMode: 'manual' });
    await call(registerGiftCard, 'admin', { code: 'GC-000002', amountCents: 40000, codeMode: 'manual' });
    check('L8a. el contador global aún no existe', !store.has('giftCardCodeCounters/global'));
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 10000, codeMode: 'generated' }));
    check('L8b. el generado NO es GC-000001 ni GC-000002 (ambos ocupados): es GC-000003',
        rg.ok && rg.value.cardCode === 'GC-000003', JSON.stringify(rg));
    check('L8c. los códigos manuales preexistentes NO se sobreescribieron (conservan su propio monto)',
        store.get('giftCards/GC-000001').amountCents === 30000 && store.get('giftCards/GC-000002').amountCents === 40000);

    // ---- Monto configurado: editable solo ADMIN + AVAILABLE (caso integral §45) ----
    console.log('\nM. Monto editable (solo admin + AVAILABLE) — caso integral');
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 10000, codeMode: 'generated' }));
    const M1 = rg.value.cardCode;
    check('M1. tarjeta nueva AVAILABLE, Bs 100', store.get(`giftCards/${M1}`).status === 'AVAILABLE' && store.get(`giftCards/${M1}`).amountCents === 10000);

    r = await outcome(call(updateGiftCardAmount, 'seller', { code: M1, amountCents: 50000 }));
    check('M2. vendedor NO puede cambiar el monto', !r.ok && store.get(`giftCards/${M1}`).amountCents === 10000, r.message);

    r = await outcome(call(updateGiftCardAmount, 'admin', { code: M1, amountCents: 50000 }));
    check('M3. admin cambia 100 → 500: permitido, AVAILABLE, sin ingreso',
        r.ok && store.get(`giftCards/${M1}`).amountCents === 50000 && store.get(`giftCards/${M1}`).status === 'AVAILABLE' && !summary(), r.message);
    check('M3b. historial: AMOUNT_CHANGED con previousAmountCents=10000, amountCents=50000',
        [...store].some(([k, v]) => k.startsWith('giftCardMovements/') && v.giftCardId === M1 && v.type === 'AMOUNT_CHANGED' && v.previousAmountCents === 10000 && v.amountCents === 50000));

    r = await outcome(call(activateGiftCard, 'seller', { code: M1, payments: [{ method: 'qr', amountCents: 50000 }] }));
    check('M4. vendedor vende Bs 500 por QR: ACTIVE, issue snapshot 500, ingreso QR 500',
        r.ok && store.get(`giftCards/${M1}`).status === 'ACTIVE' && issuesOf(summary()).issued === 50000 && issuesOf(summary()).qr === 50000, r.message);

    r = await outcome(call(updateGiftCardAmount, 'admin', { code: M1, amountCents: 100000 }));
    check('M5. admin intenta 500 → 1000 estando ACTIVE: rechazado', !r.ok && store.get(`giftCards/${M1}`).amountCents === 50000, r.message);

    await call(suspendGiftCard, 'seller', { code: M1, reason: 'perdida' });
    r = await outcome(call(updateGiftCardAmount, 'admin', { code: M1, amountCents: 100000 }));
    check('M6. admin intenta cambiar el monto estando SUSPENDED: rechazado', !r.ok, r.message);
    await call(reactivateGiftCard, 'seller', { code: M1 });
    check('M7. reactivada: ACTIVE Bs 500', store.get(`giftCards/${M1}`).status === 'ACTIVE' && store.get(`giftCards/${M1}`).amountCents === 50000);

    seedProducts();
    const cycleM1 = store.get(`giftCards/${M1}`).activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'M-sale', items: [{ productId: 'p700', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 50000, giftCardId: M1, giftCardCycleId: cycleM1 }, { method: 'cash', amountCents: 20000 }] }));
    check('M8. canjeada (Bs 500 de GC + Bs 200 efectivo sobre un producto de Bs 700): AVAILABLE de nuevo',
        r.ok && store.get(`giftCards/${M1}`).status === 'AVAILABLE', r.message);

    r = await outcome(call(updateGiftCardAmount, 'admin', { code: M1, amountCents: 100000 }));
    check('M9. AVAILABLE de nuevo: admin cambia 500 → 1000, permitido', r.ok && store.get(`giftCards/${M1}`).amountCents === 100000, r.message);

    r = await outcome(call(activateGiftCard, 'seller', { code: M1, payments: [{ method: 'cash', amountCents: 100000 }] }));
    const dM = summary();
    check('M10. se vende de nuevo por Bs 1000 en efectivo: nuevo issue (ciclo 2), nuevo ingreso cash 1000',
        r.ok && store.get(`giftCards/${M1}`).cycleNumber === 2 && issuesOf(dM).cash === 100000, r.message + JSON.stringify(dM));
    check('M10b. historial financiero real: QR 500 (M4) + efectivo 1000 (M10) = Bs 1500, nunca Bs 2000',
        issuesOf(dM).qr === 50000 && issuesOf(dM).issued === 150000 && issuesOf(dM).cash + issuesOf(dM).qr === 150000, JSON.stringify(dM));

    // ---- Reemplazo: caso integral (tarjeta ACTIVE dañada) — §46 ----
    console.log('\nN. Reemplazo de una tarjeta ACTIVE (dañada) — caso integral');
    base(); seedProducts();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 100000, codeMode: 'generated' }));
    const N1 = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: N1, payments: [{ method: 'cash', amountCents: 100000 }] });
    let before2 = freezeSummary();
    check('N1. GC vendida Bs 1000 en efectivo: ingreso cash 1000', issuesOf(summary()).cash === 100000);

    // Regla de flujo definitiva (ajuste posterior): el reemplazo YA NO es
    // directo desde ACTIVE — primero hay que cancelar definitivamente.
    r = await outcome(call(replaceGiftCard, 'admin', { code: N1, reason: 'intento directo' }));
    check('N1b. reemplazo DIRECTO desde ACTIVE: RECHAZADO (hay que cancelar primero)',
        !r.ok && store.get(`giftCards/${N1}`).status === 'ACTIVE' && store.get(`giftCards/${N1}`).replacedByCode === null, r.message);

    r = await outcome(call(cancelGiftCard, 'admin', { code: N1, reason: 'tarjeta dañada' }));
    check('N1c. cancelGiftCard: CANCELLED + pendingReplacement=true (tenía un ciclo pagado abierto)',
        r.ok && store.get(`giftCards/${N1}`).status === 'CANCELLED' && store.get(`giftCards/${N1}`).pendingReplacement === true, r.message);

    r = await outcome(call(replaceGiftCard, 'admin', { code: N1, reason: 'tarjeta dañada' }));
    check('N2. ahora SÍ (ya CANCELLED + pendingReplacement): código nuevo ACTIVE Bs 1000, SIN ingreso nuevo',
        r.ok && store.get(`giftCards/${N1}`).status === 'CANCELLED' && store.get(`giftCards/${N1}`).replacedByCode === r.value.newCardCode
        && store.get(`giftCards/${r.value.newCardCode}`).status === 'ACTIVE' && store.get(`giftCards/${r.value.newCardCode}`).amountCents === 100000
        && freezeSummary() === before2, r.message);
    const N2 = r.value.newCardCode;
    check('N2b. giftCardIssues nuevos NO financieros: el ciclo nuevo tiene origin "replacement" y payments vacío',
        store.get(`giftCards/${N2}`).activeCycleId && store.get(`giftCardIssues/${store.get(`giftCards/${N2}`).activeCycleId}`).origin === 'replacement'
        && store.get(`giftCardIssues/${store.get(`giftCards/${N2}`).activeCycleId}`).payments.length === 0);

    r = await outcome(call(createSale, 'seller', { saleId: 'N-old', items: [{ productId: 'p700', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: N1, giftCardCycleId: store.get(`giftCards/${N1}`).activeCycleId || 'none' }] }));
    check('N3. escanear/usar el código VIEJO (ya CANCELLED): no se puede usar', !r.ok, r.message);

    const cycleN2 = store.get(`giftCards/${N2}`).activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'N-new', items: [{ productId: 'p1000', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 100000, giftCardId: N2, giftCardCycleId: cycleN2 }] }));
    check('N4. usar el código NUEVO: funciona normalmente, vuelve a AVAILABLE', r.ok && store.get(`giftCards/${N2}`).status === 'AVAILABLE', r.message);

    r = await outcome(call(replaceGiftCard, 'admin', { code: N1, reason: 'otra vez' }));
    check('N5. intentar reemplazar el código viejo OTRA VEZ: rechazado', !r.ok, r.message);

    await call(updateGiftCardAmount, 'admin', { code: N2, amountCents: 50000 });
    r = await outcome(call(activateGiftCard, 'seller', { code: N2, payments: [{ method: 'qr', amountCents: 50000 }] }));
    const dN = summary();
    check('N6. AVAILABLE: admin baja a Bs 500 y se vende de nuevo por QR: ESTA venta SÍ genera ingreso nuevo (500)',
        r.ok && issuesOf(dN).cash === 100000 && issuesOf(dN).qr === 50000 && issuesOf(dN).issued === 150000, JSON.stringify(dN));
    check('N7. total histórico real = 1000 (venta original) + 0 (reemplazo) + 500 (reventa) = Bs 1500, NO Bs 2500',
        issuesOf(dN).cash + issuesOf(dN).qr === 150000);

    // ---- Reemplazo tras una cancelación previa (sin reabrir el código viejo) — §47 ----
    console.log('\nO. Reemplazo de una tarjeta ya CANCELLED con valor pendiente — caso integral');
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 50000, codeMode: 'generated' }));
    const O1 = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: O1, payments: [{ method: 'cash', amountCents: 50000 }] });
    r = await outcome(call(cancelGiftCard, 'admin', { code: O1, reason: 'se perdió' }));
    check('O1. ACTIVE cancelada definitivamente: queda CANCELLED con valor pendiente (pendingReplacement)',
        r.ok && store.get(`giftCards/${O1}`).status === 'CANCELLED' && store.get(`giftCards/${O1}`).pendingReplacement === true, r.message);

    before2 = freezeSummary();
    r = await outcome(call(replaceGiftCard, 'admin', { code: O1 }));
    check('O2. reemplazo de una tarjeta YA cancelada (con valor pendiente): permitido, nueva ACTIVE Bs 500, sin ingreso nuevo',
        r.ok && store.get(`giftCards/${r.value?.newCardCode}`)?.status === 'ACTIVE' && store.get(`giftCards/${r.value?.newCardCode}`)?.amountCents === 50000 && freezeSummary() === before2, r.message);

    r = await outcome(call(replaceGiftCard, 'admin', { code: O1 }));
    check('O3. intentar reemplazar GC-O1 otra vez: rechazado (ya fue reemplazada)', !r.ok, r.message);

    // ---- AVAILABLE cancelada SIN venta: no hay nada que transferir — §48 ----
    console.log('\nP. AVAILABLE cancelada sin haberse vendido nunca: reemplazo rechazado');
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 50000, codeMode: 'generated' }));
    const P1 = rg.value.cardCode;
    await call(cancelGiftCard, 'admin', { code: P1, reason: 'nunca se usó' });
    check('P1. AVAILABLE cancelada: pendingReplacement queda false (esos Bs eran solo configuración)',
        store.get(`giftCards/${P1}`).status === 'CANCELLED' && store.get(`giftCards/${P1}`).pendingReplacement === false);
    r = await outcome(call(replaceGiftCard, 'admin', { code: P1 }));
    check('P2. intentar "transferir" ese monto a una tarjeta nueva: RECHAZADO', !r.ok, r.message);

    // ---- cancelSale + cadena de reemplazo: auditoría de integridad financiera ----
    console.log('\nQ. cancelSale (A): tarjeta redimida → reactivada → cancelada → reemplazada; anular la venta ORIGINAL se rechaza');
    base(); seedProducts();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 100000, codeMode: 'generated' }));
    const Q1 = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: Q1, payments: [{ method: 'cash', amountCents: 100000 }] });
    const cycleQ1a = store.get(`giftCards/${Q1}`).activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'Q-sale1', items: [{ productId: 'p1000', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 100000, giftCardId: Q1, giftCardCycleId: cycleQ1a }] }));
    check('Q1. venta original redime la tarjeta: AVAILABLE, ciclo 1 redeemed', r.ok && store.get(`giftCards/${Q1}`).status === 'AVAILABLE');

    await call(activateGiftCard, 'seller', { code: Q1, payments: [{ method: 'qr', amountCents: 100000 }] });
    check('Q2. se reactiva (ciclo 2, ACTIVE)', store.get(`giftCards/${Q1}`).status === 'ACTIVE' && store.get(`giftCards/${Q1}`).cycleNumber === 2);

    await call(cancelGiftCard, 'admin', { code: Q1, reason: 'dañada en ciclo 2' });
    r = await outcome(call(replaceGiftCard, 'admin', { code: Q1 }));
    const Q2 = r.value?.newCardCode;
    check('Q3. cancelada con ciclo 2 abierto y reemplazada: CANCELLED, replacedByCode fijado', r.ok && store.get(`giftCards/${Q1}`).status === 'CANCELLED' && store.get(`giftCards/${Q1}`).replacedByCode === Q2);

    const beforeQ = freezeSummary();
    r = await outcome(call(cancelSale, 'admin', { saleId: 'Q-sale1', reason: 'intento de anular la venta original' }));
    check('Q4. anular la venta ORIGINAL (ciclo 1, ya consumido hace mucho) se RECHAZA: la tarjeta ya no está AVAILABLE',
        !r.ok && freezeSummary() === beforeQ && sale('Q-sale1').status === 'completed', r.message);
    check('Q5. la tarjeta vieja sigue CANCELLED (no se revivió) y conserva su lineage', store.get(`giftCards/${Q1}`).status === 'CANCELLED' && store.get(`giftCards/${Q1}`).replacedByCode === Q2);

    console.log('\nR. cancelSale (B): venta que redime un ciclo de REEMPLAZO (origin replacement)');
    base(); seedProducts();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 70000, codeMode: 'generated' }));
    const R0 = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: R0, payments: [{ method: 'cash', amountCents: 70000 }] });
    await call(cancelGiftCard, 'admin', { code: R0, reason: 'dañada' }); // regla de flujo definitiva: cancelar antes de reemplazar
    r = await outcome(call(replaceGiftCard, 'admin', { code: R0, reason: 'dañada' }));
    const R1 = r.value.newCardCode; // R1 = tarjeta de reemplazo, ACTIVE, origin: 'replacement' en su ciclo 1

    const cycleR1 = store.get(`giftCards/${R1}`).activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'R-sale', items: [{ productId: 'p700', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: R1, giftCardCycleId: cycleR1 }] }));
    check('R1. la venta redime el ciclo DE REEMPLAZO sin problema: AVAILABLE', r.ok && store.get(`giftCards/${R1}`).status === 'AVAILABLE', r.message);

    // B-i) si se reutiliza antes de anular, la anulación se rechaza (protección genérica, sin cambios).
    await call(activateGiftCard, 'seller', { code: R1, payments: [{ method: 'cash', amountCents: 70000 }] });
    r = await outcome(call(cancelSale, 'admin', { saleId: 'R-sale', reason: 'intento tras reutilizar' }));
    check('R2. reutilizada (ciclo 2 ACTIVE) antes de anular: RECHAZADO, sin revertir nada', !r.ok, r.message);

    // B-ii) si NO se reutiliza, la anulación revierte con seguridad (mismo camino que un ciclo normal).
    base(); seedProducts();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 70000, codeMode: 'generated' }));
    const R0b = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: R0b, payments: [{ method: 'cash', amountCents: 70000 }] });
    await call(cancelGiftCard, 'admin', { code: R0b, reason: 'dañada' });
    r = await outcome(call(replaceGiftCard, 'admin', { code: R0b }));
    const R1b = r.value.newCardCode;
    const cycleR1b = store.get(`giftCards/${R1b}`).activeCycleId;
    await call(createSale, 'seller', { saleId: 'R-sale-b', items: [{ productId: 'p700', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: R1b, giftCardCycleId: cycleR1b }] });
    r = await outcome(call(cancelSale, 'admin', { saleId: 'R-sale-b', reason: 'cliente cambió de opinión' }));
    check('R3. NO reutilizada: anular la venta revierte el ciclo de reemplazo con seguridad (ACTIVE de nuevo, mismo ciclo)',
        r.ok && store.get(`giftCards/${R1b}`).status === 'ACTIVE' && store.get(`giftCards/${R1b}`).activeCycleId === cycleR1b, r.message);
    check('R4. el lineage (replacesCode) de la tarjeta de reemplazo NO se tocó al revertir', store.get(`giftCards/${R1b}`).replacesCode === R0b);
    check('R5. la tarjeta vieja (origen) sigue intacta: CANCELLED, replacedByCode sin cambios', store.get(`giftCards/${R0b}`).status === 'CANCELLED' && store.get(`giftCards/${R0b}`).replacedByCode === R1b);

    console.log('\nS. cancelSale (C): reemplazo encadenado + canje + anulación no revive ninguna tarjeta vieja');
    base(); seedProducts();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 70000, codeMode: 'generated' }));
    const S0 = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: S0, payments: [{ method: 'qr', amountCents: 70000 }] });
    await call(cancelGiftCard, 'admin', { code: S0, reason: 'dañada' });
    let rS = await outcome(call(replaceGiftCard, 'admin', { code: S0 }));
    const S1 = rS.value.newCardCode;
    const cycleS1 = store.get(`giftCards/${S1}`).activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'S-sale', items: [{ productId: 'p700', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 70000, giftCardId: S1, giftCardCycleId: cycleS1 }] }));
    check('S0b. la venta del reemplazo se acepta (monto exacto, sin forfeit)', r.ok, r.message);
    r = await outcome(call(cancelSale, 'admin', { saleId: 'S-sale', reason: 'anulación normal' }));
    check('S1. anular la venta del reemplazo revierte SOLO esa tarjeta (S1), no toca S0', r.ok && store.get(`giftCards/${S1}`).status === 'ACTIVE' && store.get(`giftCards/${S0}`).status === 'CANCELLED', r.message);
    check('S2. S0 (tarjeta vieja, origen) nunca se revive ni cambia de estado: sigue CANCELLED con su replacedByCode',
        store.get(`giftCards/${S0}`).status === 'CANCELLED' && store.get(`giftCards/${S0}`).replacedByCode === S1 && store.get(`giftCards/${S0}`).activeCycleId === null);
    check('S3. sin doble entitlement: nunca S0 y S1 ambos usables a la vez (S0 CANCELLED mientras S1 ACTIVE)',
        store.get(`giftCards/${S0}`).status === 'CANCELLED' && store.get(`giftCards/${S1}`).status === 'ACTIVE');

    // ---- Cadena de reemplazos (prompt §8, §18-19): A → B → C ----
    console.log('\nT. Cadena de reemplazos: GC-A → GC-B → GC-C, ingreso 0 en ambos saltos, lineage completo');
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 100000, codeMode: 'generated' }));
    const TA = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: TA, payments: [{ method: 'cash', amountCents: 100000 }] });
    const beforeT = freezeSummary();
    await call(cancelGiftCard, 'admin', { code: TA, reason: 'primer daño' }); // regla de flujo definitiva: cancelar antes de reemplazar

    let rT = await outcome(call(replaceGiftCard, 'admin', { code: TA, reason: 'primer daño' }));
    const TB = rT.value.newCardCode;
    check('T1. A → B: A CANCELLED, B ACTIVE Bs 1000, ingreso = 0', rT.ok && store.get(`giftCards/${TA}`).status === 'CANCELLED' && store.get(`giftCards/${TB}`).status === 'ACTIVE' && store.get(`giftCards/${TB}`).amountCents === 100000 && freezeSummary() === beforeT, rT.message);
    check('T2. A.replacedByCode = B, B.replacesCode = A', store.get(`giftCards/${TA}`).replacedByCode === TB && store.get(`giftCards/${TB}`).replacesCode === TA);

    // B sigue ACTIVE (todavía no se canjeó): se cancela y se reemplaza OTRA VEZ, encadenado.
    await call(cancelGiftCard, 'admin', { code: TB, reason: 'segundo daño, antes de usarla' });
    rT = await outcome(call(replaceGiftCard, 'admin', { code: TB, reason: 'segundo daño, antes de usarla' }));
    const TC = rT.value.newCardCode;
    check('T3. B → C: B CANCELLED, C ACTIVE Bs 1000, ingreso SIGUE siendo 0', rT.ok && store.get(`giftCards/${TB}`).status === 'CANCELLED' && store.get(`giftCards/${TC}`).status === 'ACTIVE' && freezeSummary() === beforeT, rT.message);
    check('T4. cadena completa: B.replacedByCode = C, C.replacesCode = B (y A.replacedByCode sigue = B)',
        store.get(`giftCards/${TB}`).replacedByCode === TC && store.get(`giftCards/${TC}`).replacesCode === TB && store.get(`giftCards/${TA}`).replacedByCode === TB);
    check('T5. B ya no puede usarse ni reemplazarse de nuevo (está CANCELLED y ya tiene replacedByCode)',
        store.get(`giftCards/${TB}`).activeCycleId === null);
    r = await outcome(call(replaceGiftCard, 'admin', { code: TB }));
    check('T6. intentar reemplazar B otra vez (ya fue reemplazada por C): RECHAZADO', !r.ok, r.message);
    r = await outcome(call(replaceGiftCard, 'admin', { code: TA }));
    check('T7. intentar reemplazar A otra vez (ya fue reemplazada por B, aunque la cadena siguió): RECHAZADO', !r.ok, r.message);

    // El derecho financiero original (A, Bs 1000 cash) puede rastrearse hasta C.
    check('T8. trazabilidad completa C → B → A: C.replacesCode=B, B.replacesCode=A, y A conserva su monto/ciclo original',
        store.get(`giftCards/${TC}`).replacesCode === TB && store.get(`giftCards/${TB}`).replacesCode === TA
        && store.get(`giftCards/${TA}`).amountCents === 100000 && store.get(`giftCards/${TA}`).cycleNumber === 1);

    // Finalmente C se canjea: ESO sí es historia real de uso (compra menor, sobrante se pierde), sin ingreso nuevo.
    const cycleTC = store.get(`giftCards/${TC}`).activeCycleId;
    r = await outcome(call(createSale, 'seller', { saleId: 'T-sale', items: [{ productId: 'bear', quantity: 1 }], discountCents: 0,
        payments: [{ method: 'giftcard', amountCents: 7500, giftCardId: TC, giftCardCycleId: cycleTC }] }));
    const dT = summary();
    check('T9. C se canjea (compra 75, sobrante 925 perdido): AVAILABLE, giftCardCents=7500, giftCardForfeitedCents=92500',
        r.ok && store.get(`giftCards/${TC}`).status === 'AVAILABLE' && dT.giftCardCents === 7500 && dT.giftCardForfeitedCents === 92500, r.message + JSON.stringify(dT));
    check('T9b. ingreso total histórico de la cadena completa = Bs 1000 (la venta ORIGINAL de A), NO Bs 3000 por los dos reemplazos',
        dT.giftCardsIssuedCents === 100000);

    // ---- Regla de flujo DEFINITIVA: reemplazo SOLO tras cancelación definitiva (A-H) ----
    console.log('\nU. Reemplazo solo después de cancelar definitivamente (regla de flujo definitiva)');

    // A) ACTIVE + replaceGiftCard → rechazado.
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 25000, codeMode: 'generated' }));
    const UA = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: UA, payments: [{ method: 'cash', amountCents: 25000 }] });
    r = await outcome(call(replaceGiftCard, 'admin', { code: UA }));
    check('UA. ACTIVE + replaceGiftCard directo: RECHAZADO', !r.ok && store.get(`giftCards/${UA}`).status === 'ACTIVE' && store.get(`giftCards/${UA}`).replacedByCode === null, r.message);

    // B) SUSPENDED + replaceGiftCard → rechazado.
    await call(suspendGiftCard, 'seller', { code: UA, reason: 'perdida' });
    r = await outcome(call(replaceGiftCard, 'admin', { code: UA }));
    check('UB. SUSPENDED + replaceGiftCard directo: RECHAZADO', !r.ok && store.get(`giftCards/${UA}`).status === 'SUSPENDED' && store.get(`giftCards/${UA}`).replacedByCode === null, r.message);

    // C) AVAILABLE + replaceGiftCard → rechazado.
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 25000, codeMode: 'generated' }));
    const UC = rg.value.cardCode;
    r = await outcome(call(replaceGiftCard, 'admin', { code: UC }));
    check('UC. AVAILABLE + replaceGiftCard directo: RECHAZADO', !r.ok && store.get(`giftCards/${UC}`).status === 'AVAILABLE', r.message);

    // D) ACTIVE → cancelGiftCard → CANCELLED + pendingReplacement=true → replaceGiftCard → éxito.
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 25000, codeMode: 'generated' }));
    const UD = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: UD, payments: [{ method: 'cash', amountCents: 25000 }] });
    await call(cancelGiftCard, 'admin', { code: UD, reason: 'dañada' });
    check('UD1. ACTIVE cancelada: CANCELLED + pendingReplacement=true', store.get(`giftCards/${UD}`).status === 'CANCELLED' && store.get(`giftCards/${UD}`).pendingReplacement === true);
    r = await outcome(call(replaceGiftCard, 'admin', { code: UD }));
    check('UD2. replaceGiftCard tras cancelar: ÉXITO', r.ok && store.get(`giftCards/${r.value?.newCardCode}`)?.status === 'ACTIVE', r.message);

    // E) SUSPENDED → cancelGiftCard → CANCELLED + pendingReplacement=true → replaceGiftCard → éxito.
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 25000, codeMode: 'generated' }));
    const UE = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: UE, payments: [{ method: 'qr', amountCents: 25000 }] });
    await call(suspendGiftCard, 'seller', { code: UE, reason: 'perdida' });
    await call(cancelGiftCard, 'admin', { code: UE, reason: 'nunca apareció' });
    check('UE1. SUSPENDED cancelada: CANCELLED + pendingReplacement=true', store.get(`giftCards/${UE}`).status === 'CANCELLED' && store.get(`giftCards/${UE}`).pendingReplacement === true);
    r = await outcome(call(replaceGiftCard, 'admin', { code: UE }));
    check('UE2. replaceGiftCard tras cancelar: ÉXITO', r.ok && store.get(`giftCards/${r.value?.newCardCode}`)?.status === 'ACTIVE', r.message);

    // F) AVAILABLE → cancelGiftCard → pendingReplacement=false → replaceGiftCard → rechazado.
    base();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 25000, codeMode: 'generated' }));
    const UF = rg.value.cardCode;
    await call(cancelGiftCard, 'admin', { code: UF, reason: 'nunca se usó' });
    check('UF1. AVAILABLE cancelada: pendingReplacement=false', store.get(`giftCards/${UF}`).status === 'CANCELLED' && store.get(`giftCards/${UF}`).pendingReplacement === false);
    r = await outcome(call(replaceGiftCard, 'admin', { code: UF }));
    check('UF2. replaceGiftCard sobre CANCELLED sin entitlement: RECHAZADO', !r.ok, r.message);

    // G) CANCELLED ya reemplazada → segundo replace → rechazado.
    r = await outcome(call(replaceGiftCard, 'admin', { code: UD }));
    check('UG. UD ya fue reemplazada (paso UD2): segundo replaceGiftCard RECHAZADO', !r.ok, r.message);

    // H) replacement correcto (flujo completo cancelar → reemplazar) → nuevo income = 0.
    base(); seedProducts();
    rg = await outcome(call(registerGiftCard, 'admin', { amountCents: 25000, codeMode: 'generated' }));
    const UH1 = rg.value.cardCode;
    await call(activateGiftCard, 'seller', { code: UH1, payments: [{ method: 'cash', amountCents: 25000 }] });
    const beforeU = freezeSummary();
    await call(cancelGiftCard, 'admin', { code: UH1, reason: 'dañada' });
    check('UH1. cancelar no genera ingreso (resumen intacto)', freezeSummary() === beforeU);
    r = await outcome(call(replaceGiftCard, 'admin', { code: UH1 }));
    check('UH2. reemplazo correcto (tras cancelar): ÉXITO, SIN ingreso nuevo (resumen intacto)',
        r.ok && freezeSummary() === beforeU, r.message);
    check('UH3. sin incrementar giftCardsIssuedCents/giftCardIssuesCashCents/giftCardIssuesQrCents',
        issuesOf(summary()).issued === 25000 && issuesOf(summary()).cash === 25000 && issuesOf(summary()).qr === 0);

    console.log(`\n${label}: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
