import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { GiftCard, GiftCardIssue, GiftCardMovement, resolveGiftCardBalance, resolveGiftCardIssueBalance } from './gift-card.model';

/** `withConverter` de `giftCards` (CLAUDE.md, "Datos"). `cardCode` = ID del documento. */
export const giftCardConverter: FirestoreDataConverter<GiftCard> = {
    toFirestore(card: GiftCard): DocumentData {
        const { cardCode, ...data } = card;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): GiftCard {
        const data = snapshot.data(options);
        // Saldo persistente — adopción progresiva, SIN backfill masivo
        // (ajuste posterior, plan §16.18): un documento anterior a este
        // ajuste no tiene `balanceCents` — `resolveGiftCardBalance` lo
        // reconstruye por `status` (nunca un `?? 0` a ciegas: una
        // ACTIVE/SUSPENDED legacy que jamás se redimió tiene saldo real =
        // `amountCents`, no cero — ver el comentario largo del helper).
        return {
            ...data,
            cardCode: snapshot.id,
            balanceCents: resolveGiftCardBalance({
                status: data['status'],
                amountCents: data['amountCents'] as number,
                balanceCents: data['balanceCents'] as number | undefined,
                pendingReplacement: data['pendingReplacement'] as boolean | undefined,
            }),
        } as GiftCard;
    },
};

export const giftCardIssueConverter: FirestoreDataConverter<GiftCardIssue> = {
    toFirestore(issue: GiftCardIssue): DocumentData {
        const { id, ...data } = issue;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): GiftCardIssue {
        const data = snapshot.data(options);
        // Mismo criterio que `giftCardConverter` arriba (plan §16.18), pero
        // por `status` de CICLO: un ciclo abierto (`active`/`suspended`)
        // histórico reconstruye desde `amountCents`; uno cerrado
        // (`redeemed`/`cancelled`) nunca necesitó saldo, su efectivo es `0`.
        return {
            ...data,
            id: snapshot.id,
            balanceCents: resolveGiftCardIssueBalance({
                status: data['status'],
                amountCents: data['amountCents'] as number,
                balanceCents: data['balanceCents'] as number | undefined,
            }),
        } as GiftCardIssue;
    },
};

export const giftCardMovementConverter: FirestoreDataConverter<GiftCardMovement> = {
    toFirestore(movement: GiftCardMovement): DocumentData {
        const { id, ...data } = movement;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): GiftCardMovement {
        const data = snapshot.data(options);
        return { ...data, id: snapshot.id } as GiftCardMovement;
    },
};
