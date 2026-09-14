import {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
} from '@angular/fire/firestore';
import { Product } from './product.model';

/**
 * `withConverter` de `products` (CLAUDE.md, "Datos": *un `withConverter` por
 * colección*).
 *
 * `id` nunca se guarda en el documento — se hidrata al leer con el ID del
 * propio documento (plan §8.4, mismo patrón que `userConverter`).
 */
export const productConverter: FirestoreDataConverter<Product> = {
    toFirestore(product: Product): DocumentData {
        const { id, ...data } = product;
        return data;
    },
    fromFirestore(
        snapshot: QueryDocumentSnapshot,
        options?: SnapshotOptions,
    ): Product {
        const data = snapshot.data(options);
        return { ...data, id: snapshot.id } as Product;
    },
};
