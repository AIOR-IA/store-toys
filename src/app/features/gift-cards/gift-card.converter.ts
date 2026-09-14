import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { GiftCard, GiftCardIssue, GiftCardMovement } from './gift-card.model';

/** `withConverter` de `giftCards` (CLAUDE.md, "Datos"). `cardCode` = ID del documento. */
export const giftCardConverter: FirestoreDataConverter<GiftCard> = {
    toFirestore(card: GiftCard): DocumentData {
        const { cardCode, ...data } = card;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): GiftCard {
        const data = snapshot.data(options);
        return { ...data, cardCode: snapshot.id } as GiftCard;
    },
};

export const giftCardIssueConverter: FirestoreDataConverter<GiftCardIssue> = {
    toFirestore(issue: GiftCardIssue): DocumentData {
        const { id, ...data } = issue;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): GiftCardIssue {
        const data = snapshot.data(options);
        return { ...data, id: snapshot.id } as GiftCardIssue;
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
