import { QueryDocumentSnapshot } from '@angular/fire/firestore';
import { giftCardConverter, giftCardIssueConverter, giftCardMovementConverter } from './gift-card.converter';

/**
 * Saldo persistente — adopción progresiva, SIN backfill masivo (ajuste
 * posterior sobre la Fase A, plan §16.18): `balanceCents` es nuevo en
 * `giftCards`/`giftCardIssues`, pero las 80 Gift Cards físicas existentes
 * (ya impresas) NO se tocan en bloque. Un documento histórico sin el campo
 * se resuelve con `resolveGiftCardBalance`/`resolveGiftCardIssueBalance`
 * (nunca `?? 0` a ciegas): una `ACTIVE`/`SUSPENDED` legacy que jamás se
 * redimió tiene saldo real = `amountCents`, no cero — mostrar `0` ahí sería
 * una pérdida de dinero inventada (caso real: `GC000002`/`GC000003`).
 * `GiftCardMovement.balanceBeforeCents`/`balanceAfterCents` siguen siendo
 * opcionales: un movimiento histórico sin ellos sigue siendo legible tal
 * cual, sin que el converter los invente.
 */
describe('gift-card.converter — saldo efectivo legacy, sin backfill masivo (plan §16.18)', () => {
    const snapOf = (id: string, data: Record<string, unknown>): QueryDocumentSnapshot =>
        ({ id, data: () => data }) as unknown as QueryDocumentSnapshot;

    describe('giftCardConverter', () => {
        it('AVAILABLE legacy sin balanceCents: efectivo 0 (nunca tuvo nada pendiente)', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-AVAIL-LEGACY', { amountCents: 10000, status: 'AVAILABLE', cycleNumber: 0 }),
            );
            expect(card.balanceCents).toBe(0);
        });

        it('ACTIVE legacy sin balanceCents (caso real GC000002/GC000003): efectivo = amountCents, NUNCA 0', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC000002', { amountCents: 25000, status: 'ACTIVE', cycleNumber: 1 }),
            );
            expect(card.balanceCents).toBe(25000);
            expect(card.amountCents).toBe(25000); // amountCents nunca se tocó
        });

        it('SUSPENDED legacy sin balanceCents: efectivo = amountCents (compatibilidad histórica, suspender nunca pierde saldo)', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-SUSP-LEGACY', { amountCents: 50000, status: 'SUSPENDED', cycleNumber: 2 }),
            );
            expect(card.balanceCents).toBe(50000);
        });

        it('CANCELLED legacy CON pendingReplacement: efectivo = amountCents (valor pagado todavía sin transferir)', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-CANC-PENDING', { amountCents: 25000, status: 'CANCELLED', pendingReplacement: true, cycleNumber: 1 }),
            );
            expect(card.balanceCents).toBe(25000);
        });

        it('CANCELLED legacy SIN pendingReplacement: efectivo 0 (nunca tuvo valor pendiente de transferir)', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-CANC-SIN', { amountCents: 10000, status: 'CANCELLED', pendingReplacement: false }),
            );
            expect(card.balanceCents).toBe(0);
        });

        it('documento ya adoptado (balanceCents persistido): se respeta tal cual, sin recalcular por status', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-ADOPTED', { amountCents: 25000, balanceCents: 5000, status: 'ACTIVE', cycleNumber: 1 }),
            );
            expect(card.balanceCents).toBe(5000);
        });

        it('balanceCents = 0 YA PERSISTIDO sobre una ACTIVE (consumo total futuro) no se confunde con "campo ausente"', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-ZERO-REAL', { amountCents: 25000, balanceCents: 0, status: 'ACTIVE', cycleNumber: 1 }),
            );
            expect(card.balanceCents).toBe(0);
        });

        it('cardCode sigue viniendo del ID del documento, no del balance nuevo', () => {
            const card = giftCardConverter.fromFirestore(snapOf('GC-ID', { amountCents: 5000, status: 'AVAILABLE' }));
            expect(card.cardCode).toBe('GC-ID');
        });

        it('ENDURECIDO (Fase E, espejo de la Fase D backend): AVAILABLE con balanceCents residual != 0 → efectivo 0 igual, el status manda', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-AVAIL-RESIDUAL', { amountCents: 10000, balanceCents: 7000, status: 'AVAILABLE', cycleNumber: 1 }),
            );
            expect(card.balanceCents).toBe(0);
        });

        it('ENDURECIDO: CANCELLED sin pendingReplacement con balanceCents residual != 0 → efectivo 0 igual', () => {
            const card = giftCardConverter.fromFirestore(
                snapOf('GC-CANC-RESIDUAL', {
                    amountCents: 10000,
                    balanceCents: 4000,
                    status: 'CANCELLED',
                    pendingReplacement: false,
                }),
            );
            expect(card.balanceCents).toBe(0);
        });
    });

    describe('giftCardIssueConverter', () => {
        it('ciclo CERRADO histórico (redeemed) sin balanceCents: efectivo 0, amountCents (snapshot inicial) queda intacto', () => {
            const issue = giftCardIssueConverter.fromFirestore(
                snapOf('iss-old', { cardCode: 'GC-1', amountCents: 25000, status: 'redeemed' }),
            );
            expect(issue.balanceCents).toBe(0);
            expect(issue.amountCents).toBe(25000);
        });

        it('ciclo ABIERTO legacy (active) sin balanceCents: efectivo = amountCents, NUNCA 0', () => {
            const issue = giftCardIssueConverter.fromFirestore(
                snapOf('iss-active-legacy', { cardCode: 'GC000002', amountCents: 25000, status: 'active' }),
            );
            expect(issue.balanceCents).toBe(25000);
        });

        it('ciclo ABIERTO legacy (suspended) sin balanceCents: efectivo = amountCents', () => {
            const issue = giftCardIssueConverter.fromFirestore(
                snapOf('iss-susp-legacy', { cardCode: 'GC-2', amountCents: 50000, status: 'suspended' }),
            );
            expect(issue.balanceCents).toBe(50000);
        });

        it('ciclo ya adoptado (balanceCents persistido): se respeta tal cual', () => {
            const issue = giftCardIssueConverter.fromFirestore(
                snapOf('iss-new', { cardCode: 'GC-2', amountCents: 25000, balanceCents: 20000, status: 'active' }),
            );
            expect(issue.balanceCents).toBe(20000);
        });

        it('id sigue viniendo del ID del documento', () => {
            const issue = giftCardIssueConverter.fromFirestore(snapOf('iss-id', { cardCode: 'GC-3', amountCents: 1000 }));
            expect(issue.id).toBe('iss-id');
        });

        it('ENDURECIDO (Fase E): ciclo cerrado (redeemed) con balanceCents residual != 0 → efectivo 0 igual, el status manda', () => {
            const issue = giftCardIssueConverter.fromFirestore(
                snapOf('iss-redeemed-residual', { cardCode: 'GC-1', amountCents: 25000, balanceCents: 9000, status: 'redeemed' }),
            );
            expect(issue.balanceCents).toBe(0);
        });

        it('ENDURECIDO: ciclo cerrado (cancelled) con balanceCents residual != 0 → efectivo 0 igual', () => {
            const issue = giftCardIssueConverter.fromFirestore(
                snapOf('iss-cancelled-residual', { cardCode: 'GC-1', amountCents: 25000, balanceCents: 9000, status: 'cancelled' }),
            );
            expect(issue.balanceCents).toBe(0);
        });
    });

    describe('giftCardMovementConverter', () => {
        it('movimiento histórico sin balanceBeforeCents/balanceAfterCents sigue siendo legible (campos ausentes, no inventados)', () => {
            const movement = giftCardMovementConverter.fromFirestore(
                snapOf('mv-old', { giftCardId: 'GC-1', codeSnapshot: 'GC-1', amountCents: 25000, type: 'ACTIVATED' }),
            );
            expect(movement.type).toBe('ACTIVATED');
            expect(movement.balanceBeforeCents).toBeUndefined();
            expect(movement.balanceAfterCents).toBeUndefined();
        });

        it('movimiento nuevo con balance before/after: se conserva tal cual (tipos preparados en Fase A, sin lógica propia todavía)', () => {
            const movement = giftCardMovementConverter.fromFirestore(
                snapOf('mv-new', {
                    giftCardId: 'GC-1',
                    codeSnapshot: 'GC-1',
                    amountCents: 3000,
                    type: 'TOP_UP',
                    balanceBeforeCents: 2000,
                    balanceAfterCents: 5000,
                }),
            );
            expect(movement.balanceBeforeCents).toBe(2000);
            expect(movement.balanceAfterCents).toBe(5000);
        });
    });
});
