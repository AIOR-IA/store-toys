import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    QueryConstraint,
    collection,
    deleteField,
    doc,
    endAt,
    orderBy,
    query,
    serverTimestamp,
    startAt,
    updateDoc,
    where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppUser, RoleUser } from '@core/session';
import { buildSearchName, buildSearchTokens, normalize } from '@core/utils';
import { CursorPager, PageSize } from '@core/data';
import { userConverter } from './user.converter';

export type UsersFilter = 'all' | 'active' | 'inactive';

export interface CreateUserInput {
    firstName: string;
    lastName: string;
    ci: string;
    email: string;
    password: string;
    role: RoleUser;
    phoneNumber?: string;
    address?: string;
}

export interface UpdateUserProfileInput {
    firstName: string;
    lastName: string;
    ci: string;
    phoneNumber?: string;
    address?: string;
}

/**
 * Datos de `users` y llamadas privilegiadas del módulo administrativo
 * (plan §7, §12).
 *
 * Toda operación privilegiada (crear, cambiar correo, rol o `isActive`) va
 * SIEMPRE por Cloud Functions — nunca `createUserWithEmailAndPassword` ni
 * escritura directa de esos campos, porque eso reemplazaría la sesión del
 * admin, dejaría Auth y Firestore desincronizados, o dejaría el custom claim
 * de rol desactualizado (plan §7.2, §7.5, §7.6). La Rule de `users` rechaza
 * cualquier intento de tocar `role`/`isActive`/`email`/`emailLower` desde el
 * cliente, incluso siendo admin — solo queda abierta la edición directa de
 * perfil (nombre, CI, contacto).
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
    private readonly firestore = inject(Firestore);
    private readonly functions = inject(Functions);

    private readonly usersCollection = collection(
        this.firestore,
        'users',
    ).withConverter(userConverter);

    /**
     * Crea un paginador por cursores para el filtro y término de búsqueda
     * dados (plan §12.1, §12.2).
     *
     * Dos caminos de búsqueda, según el término:
     * - **Contiene `@`** → se asume correo, prefijo sobre `emailLower`
     *   (`orderBy` + `startAt`/`endAt`) — un correo se escribe de una vez, de
     *   izquierda a derecha, así que el prefijo simple funciona bien.
     * - **Si no** → se asume nombre, `where('searchTokens', 'array-contains-any', palabras)`.
     *   `searchName` ("apellido nombre") solo permite prefijo de ESE string
     *   exacto: encuentra "santos" (primera palabra) pero no "mario" (segunda).
     *   `searchTokens` guarda cada palabra de nombre/apellido por separado,
     *   así que "mario", "santos", "mario santos" y "santos mario" encuentran
     *   al mismo usuario sin importar cuál campo era cada palabra ni el orden.
     *
     * Sin término, se ordena por `searchName` (alfabético) sin filtrar nada.
     * Ninguno de los dos caminos descarga la colección: siguen siendo
     * consultas acotadas por `limit()` dentro de `CursorPager`.
     */
    createPager(
        filter: UsersFilter,
        searchTerm: string,
        pageSize: PageSize,
    ): CursorPager<AppUser> {
        const term = normalize(searchTerm);
        const isEmailSearch = term.includes('@');
        // array-contains-any admite hasta 30 valores; una persona no escribe
        // más de un puñado de palabras en un buscador de nombre.
        const words = term.split(' ').filter(Boolean).slice(0, 30);

        const baseConstraints = (): QueryConstraint[] => {
            const constraints: QueryConstraint[] = [];
            if (filter !== 'all') {
                constraints.push(where('isActive', '==', filter === 'active'));
            }

            if (!term) {
                constraints.push(orderBy('searchName'));
            } else if (isEmailSearch) {
                constraints.push(orderBy('emailLower'));
                constraints.push(startAt(term));
                constraints.push(endAt(term + ''));
            } else {
                constraints.push(
                    where('searchTokens', 'array-contains-any', words),
                );
                constraints.push(orderBy('searchName'));
            }
            return constraints;
        };

        return new CursorPager<AppUser>(
            (extra) => query(this.usersCollection, ...baseConstraints(), ...extra),
            () => query(this.usersCollection, ...baseConstraints()),
            pageSize,
        );
    }

    /** `createUser` (Function): Auth + `users/{uid}`, con compensación (§7.4). */
    createUser(input: CreateUserInput): Observable<{ uid: string }> {
        const callable = httpsCallable<CreateUserInput, { uid: string }>(
            this.functions,
            'createUser',
        );
        return from(callable(input)).pipe(map((result) => result.data));
    }

    /**
     * Edición directa de perfil (Rule-protegida): nunca toca `role`,
     * `isActive`, `email` ni `emailLower` — la Rule los rechaza aunque se
     * envíen, pero ni siquiera se incluyen aquí.
     */
    updateProfile(uid: string, input: UpdateUserProfileInput): Observable<void> {
        const ref = doc(this.firestore, 'users', uid);
        return from(
            updateDoc(ref, {
                firstName: input.firstName,
                lastName: input.lastName,
                ci: input.ci,
                phoneNumber: input.phoneNumber || deleteField(),
                address: input.address || deleteField(),
                searchName: buildSearchName(input.firstName, input.lastName),
                searchTokens: buildSearchTokens(input.firstName, input.lastName),
                updatedAt: serverTimestamp(),
            }),
        );
    }

    /** `updateUserAuth` (Function): cambia Auth primero y el espejo después (§7.5). */
    updateEmail(uid: string, email: string): Observable<{ uid: string }> {
        const callable = httpsCallable<
            { uid: string; email: string },
            { uid: string }
        >(this.functions, 'updateUserAuth');
        return from(callable({ uid, email })).pipe(map((result) => result.data));
    }

    /** `setUserActive` (Function): `isActive` en Firestore y `disabled` en Auth. */
    setActive(
        uid: string,
        isActive: boolean,
    ): Observable<{ uid: string; isActive: boolean }> {
        const callable = httpsCallable<
            { uid: string; isActive: boolean },
            { uid: string; isActive: boolean }
        >(this.functions, 'setUserActive');
        return from(callable({ uid, isActive })).pipe(
            map((result) => result.data),
        );
    }

    /** `setUserRole` (Function): `role` en Firestore y el custom claim en Auth, juntos. */
    setRole(
        uid: string,
        role: RoleUser,
    ): Observable<{ uid: string; role: RoleUser }> {
        const callable = httpsCallable<
            { uid: string; role: RoleUser },
            { uid: string; role: RoleUser }
        >(this.functions, 'setUserRole');
        return from(callable({ uid, role })).pipe(map((result) => result.data));
    }
}
