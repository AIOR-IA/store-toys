import { Injectable, inject } from '@angular/core';
import {
    DocumentData,
    Firestore,
    QueryConstraint,
    UpdateData,
    collection,
    deleteField,
    doc,
    endAt,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    startAt,
    updateDoc,
    where,
} from '@angular/fire/firestore';
import {
    Storage,
    deleteObject,
    getDownloadURL,
    ref as storageRef,
    uploadBytes,
} from '@angular/fire/storage';
import { Observable, firstValueFrom, from } from 'rxjs';
import { SessionService } from '@core/session';
import { SettingsService } from '@core/services';
import { CursorPager, PageSize } from '@core/data';
import {
    CodeSource,
    detectBarcodeFormat,
    formatInternalCode,
    normalize,
    normalizeCode,
} from '@core/utils';
import { productConverter } from './product.converter';
import { Product } from './product.model';

export type ProductsFilter = 'all' | 'active' | 'inactive' | 'lowStock';

export interface CreateProductInput {
    name: string;
    description?: string;
    priceCents: number;
    stock: number;
    code: string;
    codeSource: CodeSource;
}

export interface UpdateProductInput {
    name: string;
    description?: string;
    stock: number;
    imageUrl?: string;
    imagePath?: string;
    /** Solo admin — la Rule rechaza el intento si lo envía un vendedor. */
    priceCents?: number;
}

/** Errores de dominio propios, para que la UI muestre el mensaje correcto sin adivinar. */
export type ProductsServiceErrorCode = 'duplicate-code' | 'counter-not-seeded';
export class ProductsServiceError extends Error {
    constructor(public readonly code: ProductsServiceErrorCode) {
        super(code);
    }
}

/**
 * Datos de `products`, `barcodes` y `counters/internalCode` (plan §8.4,
 * §8.5, §14).
 *
 * A diferencia de Usuarios, ninguna operación aquí necesita Cloud Functions:
 * la creación pasa por `runTransaction` (no `writeBatch`) porque el SDK de
 * cliente no tiene un `create()` que falle si el documento ya existe — la
 * única forma de garantizar que dos productos no compartan código sin una
 * condición de carrera es leer `barcodes/{code}` **dentro** de la misma
 * transacción que escribe ambos documentos: si dos pestañas compiten por el
 * mismo código, Firestore reintenta una de las dos transacciones con una
 * lectura fresca, y esa ve el código ya tomado.
 */
@Injectable({ providedIn: 'root' })
export class ProductsService {
    private readonly firestore = inject(Firestore);
    private readonly storage = inject(Storage);
    private readonly sessionService = inject(SessionService);
    private readonly settingsService = inject(SettingsService);

    private readonly productsCollection = collection(
        this.firestore,
        'products',
    ).withConverter(productConverter);

    /**
     * Paginador por cursores (plan §12.1) con dos caminos de búsqueda sobre
     * el nombre (plan §12.2):
     *
     * - Sin término → `orderBy('nameLower')`, con o sin filtro de estado.
     * - Con término → prefijo sobre `nameLower` (`startAt`/`endAt` con el
     *   sentinel ``, el último carácter del rango Unicode básico).
     *
     * La búsqueda **por código** no pasa por aquí: se resuelve con una sola
     * lectura en `lookupByCode()` (plan §14.1), nunca contra esta colección.
     *
     * El filtro `lowStock` usa un `orderBy('stock')` distinto porque
     * Firestore exige que el primer `orderBy` sea el mismo campo que un
     * filtro de rango (`stock <= umbral`) — por eso no se combina con la
     * búsqueda por nombre: no hay un índice que sirva a la vez un rango de
     * `stock` y un rango de `nameLower`.
     */
    createPager(
        filter: ProductsFilter,
        searchTerm: string,
        pageSize: PageSize,
        lowStockThreshold: number,
    ): CursorPager<Product> {
        const term = normalize(searchTerm);

        const baseConstraints = (): QueryConstraint[] => {
            if (filter === 'lowStock') {
                return [
                    where('isActive', '==', true),
                    where('stock', '<=', lowStockThreshold),
                    orderBy('stock'),
                ];
            }

            const constraints: QueryConstraint[] = [];
            if (filter !== 'all') {
                constraints.push(where('isActive', '==', filter === 'active'));
            }
            constraints.push(orderBy('nameLower'));
            if (term) {
                constraints.push(startAt(term));
                constraints.push(endAt(term + ''));
            }
            return constraints;
        };

        return new CursorPager<Product>(
            (extra) => query(this.productsCollection, ...baseConstraints(), ...extra),
            () => query(this.productsCollection, ...baseConstraints()),
            pageSize,
        );
    }

    /**
     * Lista acotada para la hoja de etiquetas (plan §14.2): a la escala de
     * la tienda (500–1 000 productos, ~10% sin código de fábrica) 200
     * productos activos cubren con margen cualquier selección real para una
     * hoja. Sigue siendo una consulta con `limit()` — nunca la colección
     * completa (CLAUDE.md, "Datos").
     */
    listForLabelSheet(): Observable<Product[]> {
        return from(
            getDocs(
                query(
                    this.productsCollection,
                    where('isActive', '==', true),
                    orderBy('nameLower'),
                    limit(200),
                ),
            ).then((snap) => snap.docs.map((d) => d.data())),
        );
    }

    /** Resuelve un escaneo o un código tecleado a su producto (plan §14.1). 1-2 lecturas. */
    lookupByCode(code: string): Observable<Product | null> {
        return from(this.doLookupByCode(normalizeCode(code)));
    }

    private async doLookupByCode(code: string): Promise<Product | null> {
        const barcodeSnap = await getDoc(doc(this.firestore, 'barcodes', code));
        if (!barcodeSnap.exists()) return null;

        const productId = barcodeSnap.get('productId') as string;
        const productSnap = await getDoc(doc(this.productsCollection, productId));
        return productSnap.exists() ? productSnap.data() : null;
    }

    /** `MP000001`, `MP000002`… — transacción sobre `counters/internalCode` (plan §14.2). */
    generateInternalCode(): Observable<string> {
        return from(this.doGenerateInternalCode());
    }

    private async doGenerateInternalCode(): Promise<string> {
        const settings = await firstValueFrom(this.settingsService.getSettings());
        const counterRef = doc(this.firestore, 'counters', 'internalCode');

        const seq = await runTransaction(this.firestore, async (tx) => {
            const snap = await tx.get(counterRef);
            if (!snap.exists()) {
                // Rule: create de counters es `false` a propósito — se siembra
                // una sola vez a mano, igual que el primer admin (plan §7.1).
                throw new ProductsServiceError('counter-not-seeded');
            }
            const next = (snap.get('seq') as number) + 1;
            tx.update(counterRef, { seq: next, updatedAt: serverTimestamp() });
            return next;
        });

        return formatInternalCode(settings.internalCodePrefix, seq);
    }

    /**
     * Crea el producto y su índice de código en una sola transacción (plan
     * §14.1). La imagen se sube ANTES de la transacción porque `imagePath`
     * es obligatorio en la Rule de creación; si la transacción falla —código
     * duplicado por una carrera real con otra pestaña, casi siempre— la
     * imagen recién subida se borra: es un archivo que esta misma llamada
     * acaba de crear, no el tipo de resto huérfano preexistente que exige
     * avisar antes de borrar.
     */
    createProduct(
        input: CreateProductInput,
        image: Blob,
    ): Observable<{ productId: string }> {
        return from(this.doCreateProduct(input, image));
    }

    private async doCreateProduct(
        input: CreateProductInput,
        image: Blob,
    ): Promise<{ productId: string }> {
        const session = this.sessionService.session();
        if (session.status !== 'active') {
            throw new Error('Sesión requerida.');
        }

        const normalizedCode = normalizeCode(input.code);
        const barcodeRef = doc(this.firestore, 'barcodes', normalizedCode);

        // Chequeo temprano (1 lectura): evita subir la imagen cuando el
        // código ya existe en el caso común. La garantía real la da la
        // transacción de abajo.
        const precheck = await getDoc(barcodeRef);
        if (precheck.exists()) {
            throw new ProductsServiceError('duplicate-code');
        }

        const productsRef = collection(this.firestore, 'products');
        const productRef = doc(productsRef);
        const imagePath = `products/${productRef.id}/${Date.now()}.webp`;
        const imageRef = storageRef(this.storage, imagePath);

        await uploadBytes(imageRef, image, { contentType: 'image/webp' });
        const imageUrl = await getDownloadURL(imageRef);

        try {
            await runTransaction(this.firestore, async (tx) => {
                const barcodeSnap = await tx.get(barcodeRef);
                if (barcodeSnap.exists()) {
                    throw new ProductsServiceError('duplicate-code');
                }

                const now = serverTimestamp();
                tx.set(productRef, {
                    name: input.name,
                    ...(input.description ? { description: input.description } : {}),
                    priceCents: input.priceCents,
                    stock: input.stock,
                    code: normalizedCode,
                    codeSource: input.codeSource,
                    barcodeFormat: detectBarcodeFormat(normalizedCode),
                    imageUrl,
                    imagePath,
                    isActive: true,
                    nameLower: normalize(input.name),
                    createdBySellerId: session.uid,
                    createdBySellerName: `${session.firstName} ${session.lastName}`,
                    createdAt: now,
                    updatedAt: now,
                });
                tx.set(barcodeRef, {
                    code: normalizedCode,
                    productId: productRef.id,
                    kind: input.codeSource === 'internal' ? 'internal' : 'ean',
                    createdAt: now,
                });
            });
        } catch (error) {
            await deleteObject(imageRef).catch(() => undefined);
            throw error;
        }

        return { productId: productRef.id };
    }

    /**
     * Edición directa (Rule-protegida): `priceCents` solo se incluye en el
     * payload cuando quien edita es admin — si se omite, `updateDoc` no toca
     * ese campo y la Rule de vendedor (que exige `priceCents` intacto) lo ve
     * como no modificado, en vez de rechazar la escritura.
     */
    updateProduct(id: string, input: UpdateProductInput): Observable<void> {
        const ref = doc(this.firestore, 'products', id);
        const payload: UpdateData<DocumentData> = {
            name: input.name,
            nameLower: normalize(input.name),
            description: input.description || deleteField(),
            stock: input.stock,
            updatedAt: serverTimestamp(),
        };
        if (input.imageUrl !== undefined) payload['imageUrl'] = input.imageUrl;
        if (input.imagePath !== undefined) payload['imagePath'] = input.imagePath;
        if (input.priceCents !== undefined) payload['priceCents'] = input.priceCents;

        return from(updateDoc(ref, payload));
    }

    /** Admin-only por Rules: activar/inactivar (soft delete, plan §13.2). */
    setActive(id: string, isActive: boolean): Observable<void> {
        const ref = doc(this.firestore, 'products', id);
        return from(updateDoc(ref, { isActive, updatedAt: serverTimestamp() }));
    }

    /**
     * Cambio de código (admin-only por Rules, prompt §10): reserva el nuevo
     * código, actualiza el producto, crea el nuevo índice y retira el
     * anterior — todo en una transacción para que nunca quede
     * `barcodes/{codigoViejo}` apuntando a un producto que ya usa otro.
     */
    changeCode(id: string, code: string, codeSource: CodeSource): Observable<void> {
        return from(this.doChangeCode(id, code, codeSource));
    }

    private async doChangeCode(
        id: string,
        code: string,
        codeSource: CodeSource,
    ): Promise<void> {
        const normalizedCode = normalizeCode(code);
        const productRef = doc(this.firestore, 'products', id);
        const newBarcodeRef = doc(this.firestore, 'barcodes', normalizedCode);

        await runTransaction(this.firestore, async (tx) => {
            const productSnap = await tx.get(productRef);
            if (!productSnap.exists()) {
                throw new Error('Producto no encontrado.');
            }
            const oldCode = productSnap.get('code') as string;

            if (oldCode !== normalizedCode) {
                const newBarcodeSnap = await tx.get(newBarcodeRef);
                if (newBarcodeSnap.exists()) {
                    throw new ProductsServiceError('duplicate-code');
                }
            }

            const now = serverTimestamp();
            tx.update(productRef, {
                code: normalizedCode,
                codeSource,
                barcodeFormat: detectBarcodeFormat(normalizedCode),
                updatedAt: now,
            });

            if (oldCode !== normalizedCode) {
                tx.set(newBarcodeRef, {
                    code: normalizedCode,
                    productId: id,
                    kind: codeSource === 'internal' ? 'internal' : 'ean',
                    createdAt: now,
                });
                if (oldCode) {
                    tx.delete(doc(this.firestore, 'barcodes', oldCode));
                }
            }
        });
    }

    /** Sube y comprime-ya la imagen de un producto EXISTENTE, y borra la anterior (plan §9.3). */
    async replaceImage(
        productId: string,
        image: Blob,
        previousImagePath: string | undefined,
    ): Promise<{ imageUrl: string; imagePath: string }> {
        const imagePath = `products/${productId}/${Date.now()}.webp`;
        const imageRef = storageRef(this.storage, imagePath);
        await uploadBytes(imageRef, image, { contentType: 'image/webp' });
        const imageUrl = await getDownloadURL(imageRef);

        // Primero la nueva, después la anterior: si el borrado fallara, el
        // producto se queda con una imagen de más en Storage, nunca sin
        // ninguna (plan §9.3).
        if (previousImagePath) {
            await deleteObject(storageRef(this.storage, previousImagePath)).catch(
                () => undefined,
            );
        }

        return { imageUrl, imagePath };
    }
}
