import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { Sale } from './sale.model';

/**
 * `withConverter` de `sales` (CLAUDE.md, "Datos": *un `withConverter` por
 * colección*). Solo de LECTURA en la práctica: el cliente nunca escribe en
 * `sales` (plan §10.2) — `toFirestore` existe únicamente porque el tipo del
 * SDK lo exige.
 */
export const saleConverter: FirestoreDataConverter<Sale> = {
    toFirestore(sale: Sale): DocumentData {
        const { id, ...data } = sale;
        return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): Sale {
        const data = snapshot.data(options);
        return { ...data, id: snapshot.id } as Sale;
    },
};
