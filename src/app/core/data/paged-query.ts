import {
    getCountFromServer,
    getDocs,
    limit,
    Query,
    QueryConstraint,
    QueryDocumentSnapshot,
    startAfter,
} from '@angular/fire/firestore';

export type PageSize = 10 | 20 | 50;

export interface PageResult<T> {
    rows: T[];
    hasNext: boolean;
    hasPrev: boolean;
    total: number;
}

/**
 * Paginador por cursores, sin `OFFSET` (plan §12.1).
 *
 * Firestore no permite pedir "la página 7" sin leer las seis anteriores: un
 * cursor (`startAfter`) tiene coste constante por página, así que se guarda
 * una pila en memoria (`cursors[i]` = último documento de la página `i`).
 * Avanzar hace `push`; retroceder es un `pop()` sin releer nada.
 *
 * Cada página cuesta `pageSize + 1` lecturas (la de más, para saber si hay
 * página siguiente sin gastar otra consulta). El total se calcula aparte con
 * `getCountFromServer()` — 1 lectura por cada 1 000 documentos, sin
 * transferirlos — y **solo se refresca al cambiar filtros o tamaño de
 * página**, nunca al avanzar o retroceder.
 *
 * Genérico a propósito: lo reutilizan tal cual Productos y Ventas en las
 * fases siguientes (plan, condición para avanzar de la Fase 2).
 */
export class CursorPager<T> {
    private cursors: QueryDocumentSnapshot<T>[] = [];
    private pageIndex = 0;
    private total = 0;

    constructor(
        private readonly buildQuery: (
            constraints: QueryConstraint[],
        ) => Query<T>,
        private readonly buildCountQuery: () => Query<T>,
        public pageSize: PageSize = 20,
    ) {}

    async first(): Promise<PageResult<T>> {
        this.cursors = [];
        this.pageIndex = 0;
        this.total = (await getCountFromServer(this.buildCountQuery())).data().count;
        return this.fetchCurrentPage();
    }

    async next(): Promise<PageResult<T>> {
        this.pageIndex += 1;
        return this.fetchCurrentPage();
    }

    async prev(): Promise<PageResult<T>> {
        if (this.pageIndex > 0) this.pageIndex -= 1;
        return this.fetchCurrentPage();
    }

    /** Cambia el tamaño de página y vuelve a la primera (plan §12.1). */
    async setPageSize(pageSize: PageSize): Promise<PageResult<T>> {
        this.pageSize = pageSize;
        return this.first();
    }

    private async fetchCurrentPage(): Promise<PageResult<T>> {
        const constraints: QueryConstraint[] = [];
        if (this.pageIndex > 0) {
            constraints.push(startAfter(this.cursors[this.pageIndex - 1]));
        }
        constraints.push(limit(this.pageSize + 1));

        const snapshot = await getDocs(this.buildQuery(constraints));
        const docs = snapshot.docs.slice(0, this.pageSize);
        const hasNext = snapshot.docs.length > this.pageSize;

        if (docs.length) {
            this.cursors[this.pageIndex] = docs[docs.length - 1];
        }

        return {
            rows: docs.map((doc) => doc.data()),
            hasNext,
            hasPrev: this.pageIndex > 0,
            total: this.total,
        };
    }
}
