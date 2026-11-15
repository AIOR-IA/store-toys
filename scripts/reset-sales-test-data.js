/**
 * RESET CONTROLADO de datos de prueba — Fase G (auditoría/preparación, plan
 * §16.19, §22.1).
 *
 * Alcance HARDCODEADO, sin excepción, sin flags para ampliarlo:
 *   - borra únicamente `sales` (todos los documentos);
 *   - borra únicamente `dailySummaries` (todos los documentos);
 *   - borra SOLO los objetos de Storage en `qr-vouchers/` cuya ruta esté
 *     referenciada por `voucherPath` en uno de los pagos de una de esas
 *     `sales` que se está borrando — nunca un wildcard sobre todo el
 *     prefijo `qr-vouchers/`, para no arrastrar un archivo sin relación
 *     demostrable con una venta de prueba.
 *
 * NUNCA toca (ni siquiera se intenta leer para borrar):
 *   products, barcodes, stock, counters, users, Firebase Auth,
 *   giftCards, giftCardCodeCounters, giftCardIssues, giftCardMovements,
 *   giftCardTopUps, Storage `products/`.
 *
 * DRY-RUN por defecto: solo lista qué se borraría (colección, cantidad,
 * IDs, objetos de Storage candidatos). Nunca borra nada sin `--apply`.
 *
 * Protecciones (plan §22, Fase G):
 *   - rechaza cualquier proyecto que no sea `mi-pimpollito-dev` antes de
 *     permitir `--apply` (y también en dry-run, para no auditar el
 *     proyecto equivocado por error);
 *   - imprime PROJECT + conteos de cada colección/Storage ANTES de borrar
 *     nada, incluso en modo `--apply`.
 *
 * Uso (credenciales de tu cuenta, por navegador — nunca se pasan al asistente):
 *   gcloud auth application-default login          (una vez)
 *   node scripts/reset-sales-test-data.js                 # dry-run (default)
 *   node scripts/reset-sales-test-data.js --apply          # borra de verdad
 */
const path = require('path');
const { createRequire } = require('module');
const requireFromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');
const { getStorage } = requireFromFunctions('firebase-admin/storage');

const PROJECT_ID = 'mi-pimpollito-dev';
const STORAGE_BUCKET = 'mi-pimpollito-dev.firebasestorage.app';
const APPLY = process.argv.includes('--apply');

const bs = (cents) => ((cents ?? 0) / 100).toLocaleString('es-BO', { minimumFractionDigits: 2 });

/** Borra documentos en lotes de <= 450 (margen sobre el límite de 500 de un `writeBatch`). */
async function deleteDocsInBatches(db, docRefs) {
    const CHUNK = 450;
    let deleted = 0;
    for (let i = 0; i < docRefs.length; i += CHUNK) {
        const batch = db.batch();
        for (const ref of docRefs.slice(i, i + CHUNK)) batch.delete(ref);
        await batch.commit();
        deleted += Math.min(CHUNK, docRefs.length - i);
    }
    return deleted;
}

(async () => {
    const resolvedProjectId =
        process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || PROJECT_ID;
    if (resolvedProjectId !== PROJECT_ID) {
        throw new Error(
            `ABORTADO: este script solo opera sobre "${PROJECT_ID}". Proyecto detectado: "${resolvedProjectId}".`,
        );
    }

    initializeApp({
        credential: applicationDefault(),
        projectId: PROJECT_ID,
        storageBucket: STORAGE_BUCKET,
    });
    const db = getFirestore();
    const bucket = getStorage().bucket();

    console.log('================ RESET sales + dailySummaries ================');
    console.log(`PROJECT: ${PROJECT_ID}`);
    console.log(`MODO: ${APPLY ? 'APPLY (borra de verdad)' : 'DRY-RUN (solo lectura, no borra nada)'}`);
    console.log('Alcance: SOLO sales, dailySummaries, y los qr-vouchers de esas ventas (si existen).');
    console.log('NUNCA toca: products, barcodes, stock, counters, users, Auth, giftCards,');
    console.log('giftCardCodeCounters, giftCardIssues, giftCardMovements, giftCardTopUps, Storage products/.');
    console.log('----------------------------------------------------------------');

    // ---- sales ----
    const salesSnap = await db.collection('sales').get();
    const sales = salesSnap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
    console.log(`\nsales: ${sales.length} documento(s)`);
    for (const s of sales) {
        console.log(
            `  - ${s.id}  dateKey=${s.data.dateKey}  status=${s.data.status}  totalCents=${s.data.totalCents} (${bs(s.data.totalCents)} Bs)`,
        );
    }

    // ---- dailySummaries ----
    const summariesSnap = await db.collection('dailySummaries').get();
    const summaries = summariesSnap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
    console.log(`\ndailySummaries: ${summaries.length} documento(s)`);
    for (const s of summaries) {
        console.log(`  - ${s.id}  totalCents=${s.data.totalCents} (${bs(s.data.totalCents)} Bs)`);
    }

    // ---- qr-vouchers referenciados por esas sales (relación demostrable, nunca un wildcard) ----
    const voucherPaths = new Set();
    for (const s of sales) {
        for (const payment of s.data.payments || []) {
            if (payment.method === 'qr' && payment.voucherStatus === 'uploaded' && payment.voucherPath) {
                voucherPaths.add(payment.voucherPath);
            }
        }
    }
    console.log(`\nStorage qr-vouchers referenciados por esas sales: ${voucherPaths.size} objeto(s)`);
    for (const p of voucherPaths) console.log(`  - ${p}`);
    if (voucherPaths.size === 0) {
        console.log('  (ninguna de las ventas de prueba tiene un voucher QR subido — nada que borrar en Storage)');
    }

    console.log('\n----------------------------------------------------------------');

    if (!APPLY) {
        console.log('\nDRY-RUN: no se borró nada. Ejecuta con --apply para borrar de verdad.');
        process.exit(0);
    }

    console.log('\n*** APPLY: borrando ahora ***');
    const deletedSales = await deleteDocsInBatches(db, sales.map((s) => s.ref));
    console.log(`sales borradas: ${deletedSales}`);
    const deletedSummaries = await deleteDocsInBatches(db, summaries.map((s) => s.ref));
    console.log(`dailySummaries borradas: ${deletedSummaries}`);

    let deletedVouchers = 0;
    for (const voucherPath of voucherPaths) {
        try {
            await bucket.file(voucherPath).delete();
            deletedVouchers++;
        } catch (err) {
            console.warn(`  no se pudo borrar ${voucherPath}: ${err.message}`);
        }
    }
    console.log(`Storage qr-vouchers borrados: ${deletedVouchers}/${voucherPaths.size}`);

    console.log('\nReset aplicado. giftCards/giftCardIssues/giftCardMovements/giftCardTopUps NO fueron tocados.');
})().catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
});
