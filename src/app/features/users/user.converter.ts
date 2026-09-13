import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { AppUser } from '@core/session';

/**
 * `withConverter` de `users` (CLAUDE.md, "Datos": *un `withConverter` por
 * colección*).
 *
 * `uid` nunca se guarda en el documento — se hidrata al leer con el ID del
 * propio documento (plan §8.2) — así que `toFirestore` lo descarta y
 * `fromFirestore` lo reconstruye desde `snapshot.id`.
 */
export const userConverter: FirestoreDataConverter<AppUser> = {
    toFirestore(user: AppUser): DocumentData {
        const { uid, ...data } = user;
        return data;
    },
    fromFirestore(
        snapshot: QueryDocumentSnapshot,
        options?: SnapshotOptions,
    ): AppUser {
        const data = snapshot.data(options);
        return { ...data, uid: snapshot.id } as AppUser;
    },
};
