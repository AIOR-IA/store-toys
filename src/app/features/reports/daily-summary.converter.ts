import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { DailySummary } from './daily-summary.model';

/**
 * `withConverter` de `dailySummaries` (CLAUDE.md, "Datos"). Solo lectura:
 * Reportes nunca escribe aquí.
 *
 * `giftCardIssuesCashCents`/`giftCardIssuesQrCents` son campos NUEVOS de la
 * Fase 6 (plan §8.7): un `dailySummaries/{dateKey}` creado por `createSale`
 * ANTES de que la Fase 6 existiera nunca los tuvo, y nada los retroactiva —
 * `createSale`/`cancelSale` solo tocan esos dos campos cuando además hay una
 * gift card de por medio, y un `update` de Firestore nunca agrega un campo
 * que no menciona. Verificado en vivo: `dailySummaries/2026-09-13` (un día
 * sin ninguna `giftCardIssues.dateKey == '2026-09-13'`) no tiene esos dos
 * campos en absoluto — no es un descuadre financiero, es un día sin
 * actividad de gift card, así que su valor real siempre fue 0. Coalescer a 0
 * aquí es el mismo criterio defensivo que ya usa el servidor
 * (`functions/src/sales.ts`, `assertSafeIntegerCents`) para leer un campo que
 * puede faltar en un documento antiguo — nunca un intento de maquillar un
 * total que no cuadra.
 */
export const dailySummaryConverter: FirestoreDataConverter<DailySummary> = {
    toFirestore(summary: DailySummary): DocumentData {
        return summary;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): DailySummary {
        const data = snapshot.data(options) as DailySummary;
        return {
            ...data,
            giftCardIssuesCashCents: data.giftCardIssuesCashCents ?? 0,
            giftCardIssuesQrCents: data.giftCardIssuesQrCents ?? 0,
        };
    },
};
