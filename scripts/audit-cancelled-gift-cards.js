/**
 * AUDITORÍA DE SOLO LECTURA — Gift Cards vendidas que terminaron canceladas.
 *
 * Contexto: hasta el cambio de regla ("la venta de una Gift Card es ingreso
 * definitivo"), `cancelGiftCard` RESTABA la emisión de `dailySummaries` del día
 * en que se vendió la tarjeta. Este script responde, sin escribir nada:
 *
 *   - ¿cuántos ciclos (`giftCardIssues`) terminaron `cancelled`?
 *   - ¿el resumen de su día ya les descontó la emisión (deuda histórica)?
 *   - por cada ciclo RESTADO: código, cycleNumber, fecha de emisión, dateKey,
 *     importe, efectivo/QR, vendedor, cancelación y los CAMPOS EXACTOS del
 *     dailySummary que se descontaron;
 *   - el total monetario afectado.
 *
 * SOLO LEE (`get()`): no importa ni usa ninguna operación de escritura. Rechaza
 * cualquier proyecto que no sea `mi-pimpollito-dev`.
 *
 * Uso (credenciales de TU cuenta, por navegador — nunca se pasan al asistente):
 *   gcloud auth application-default login          (una vez)
 *   node scripts/audit-cancelled-gift-cards.js
 */
const path = require('path');
const { createRequire } = require('module');
const requireFromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const PROJECT_ID = 'mi-pimpollito-dev';
const bs = (cents) => (cents / 100).toLocaleString('es-BO', { minimumFractionDigits: 2 });
const sum = (issues, pick) => issues.reduce((s, i) => s + pick(i), 0);
const byMethod = (issue, method) =>
    (issue.payments || []).filter((p) => p.method === method).reduce((s, p) => s + p.amountCents, 0);

(async () => {
    if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID) {
        throw new Error(`Solo se audita ${PROJECT_ID} (GCLOUD_PROJECT=${process.env.GCLOUD_PROJECT}).`);
    }
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
    const db = getFirestore();

    const cancelledSnap = await db.collection('giftCardIssues').where('status', '==', 'cancelled').get();
    const cancelled = cancelledSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    console.log(`\nCiclos de Gift Card con status "cancelled": ${cancelled.length}`);
    if (!cancelled.length) {
        console.log('No hay casos reales afectados: no existe deuda histórica.');
        return;
    }

    const dateKeys = [...new Set(cancelled.map((i) => i.dateKey))].sort();
    let debt = { issued: 0, cash: 0, qr: 0 };
    let unknown = 0;

    for (const dateKey of dateKeys) {
        const summarySnap = await db.doc(`dailySummaries/${dateKey}`).get();
        const allSnap = await db.collection('giftCardIssues').where('dateKey', '==', dateKey).get();
        const all = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const kept = all.filter((i) => i.status !== 'cancelled');
        const cancelledOfDay = all.filter((i) => i.status === 'cancelled');

        const s = summarySnap.exists ? summarySnap.data() : null;
        const fmt = (f) => (s ? s[f] ?? 0 : null);
        const allIssued = sum(all, (i) => i.amountCents);
        const keptIssued = sum(kept, (i) => i.amountCents);
        let verdict;
        if (!s) verdict = 'SIN resumen ese día';
        else if (fmt('giftCardsIssuedCents') === keptIssued && keptIssued !== allIssued) verdict = 'RESTADO (deuda histórica)';
        else if (fmt('giftCardsIssuedCents') === allIssued) verdict = 'no restado';
        else verdict = 'INCONSISTENTE (revisar a mano)';

        console.log(`\n=== ${dateKey} — ${verdict}`);
        console.log(`    resumen: emitidas ${s ? bs(fmt('giftCardsIssuedCents')) : '—'} | efectivo emisiones ${s ? bs(fmt('giftCardIssuesCashCents')) : '—'} | QR emisiones ${s ? bs(fmt('giftCardIssuesQrCents')) : '—'}`);
        console.log(`    Σ ciclos del día: todos ${bs(allIssued)} | sin cancelados ${bs(keptIssued)}`);
        const iso = (t) => t?.toDate?.().toISOString?.() ?? '?';
        for (const i of cancelledOfDay) {
            console.log(
                `    - ${i.cardCode}  ciclo #${i.cycleNumber}  emitida ${iso(i.activatedAt)} (dateKey ${i.dateKey})\n` +
                    `      importe ${bs(i.amountCents)} Bs = efectivo ${bs(byMethod(i, 'cash'))} + QR ${bs(byMethod(i, 'qr'))}\n` +
                    `      vendedor ${i.activatedByName ?? '?'} (${i.activatedBy})  |  cancelada ${iso(i.cancelledAt)}  motivo: ${i.cancelReason ?? '—'}`,
            );
            if (verdict.startsWith('RESTADO')) {
                console.log(
                    `      descontado de dailySummaries/${dateKey}: giftCardsIssuedCents −${i.amountCents}, ` +
                        `giftCardIssuesCashCents −${byMethod(i, 'cash')}, giftCardIssuesQrCents −${byMethod(i, 'qr')}  (centavos)`,
                );
            }
        }
        if (verdict.startsWith('RESTADO')) {
            debt.issued += sum(cancelledOfDay, (i) => i.amountCents);
            debt.cash += sum(cancelledOfDay, (i) => byMethod(i, 'cash'));
            debt.qr += sum(cancelledOfDay, (i) => byMethod(i, 'qr'));
        } else if (verdict.startsWith('INCONSISTENTE') || verdict.startsWith('SIN')) unknown += 1;
    }

    console.log('\n================ RESUMEN ================');
    console.log(`Ciclos cancelados: ${cancelled.length} en ${dateKeys.length} día(s): ${dateKeys.join(', ')}`);
    console.log(`Deuda histórica (ingreso ya RESTADO de dailySummaries):`);
    console.log(`  TOTAL MONETARIO AFECTADO: ${bs(debt.issued)} Bs  =  efectivo ${bs(debt.cash)} + QR ${bs(debt.qr)}`);
    console.log(`  (centavos: giftCardsIssuedCents ${debt.issued}, giftCardIssuesCashCents ${debt.cash}, giftCardIssuesQrCents ${debt.qr})`);
    if (unknown) console.log(`Días a revisar a mano (inconsistentes / sin resumen): ${unknown}`);
    console.log('Este script NO corrige nada. Una corrección sería una decisión aparte.\n');
})().catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
});
