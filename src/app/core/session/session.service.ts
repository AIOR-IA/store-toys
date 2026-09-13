import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
    Auth,
    EmailAuthProvider,
    User,
    authState,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updatePassword,
} from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, from, of, throwError } from 'rxjs';
import {
    catchError,
    distinctUntilChanged,
    filter,
    map,
    shareReplay,
    startWith,
    switchMap,
    take,
} from 'rxjs/operators';
import {
    ANONYMOUS,
    AppUser,
    LOADING,
    RejectReason,
    Session,
    rejected,
    sameSession,
} from './session.model';

/**
 * Única fuente de verdad de sesión (plan §6.2).
 *
 * `authState(auth) → switchMap → docData(users/{uid}) → Session`.
 *
 * Nada más en la aplicación debe leer `auth.currentUser` ni suscribirse
 * directamente a Firestore para saber quién es el usuario o si está activo:
 * todo pasa por aquí. Es lo que hace imposible, por construcción, el bug de
 * recarga en frío (plan §6.1): el guard no responde hasta que `ready$` emite,
 * y `ready$` no emite mientras Firebase Auth todavía está restaurando su
 * estado desde IndexedDB.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
    private readonly auth = inject(Auth);
    private readonly firestore = inject(Firestore);

    readonly session$: Observable<Session> = authState(this.auth).pipe(
        switchMap((fbUser) => this.resolveSession(fbUser)),
        startWith(LOADING),
        distinctUntilChanged(sameSession),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    readonly session = toSignal(this.session$, { initialValue: LOADING });

    readonly isAdmin = computed(() => {
        const s = this.session();
        return s.status === 'active' && s.role === 'admin';
    });

    readonly isAuthenticated = computed(
        () => this.session().status === 'active',
    );

    /**
     * Emite solo cuando el estado ya es conocido (nunca `loading`). Es lo que
     * consumen los guards: `ready$.pipe(take(1))` deja que el router de
     * Angular espere la primera emisión en lugar de adivinar.
     */
    readonly ready$: Observable<Session> = this.session$.pipe(
        filter((s) => s.status !== 'loading'),
    );

    private resolveSession(fbUser: User | null): Observable<Session> {
        if (!fbUser) return of(ANONYMOUS);

        const ref = doc(this.firestore, 'users', fbUser.uid);
        return docData(ref, { idField: 'uid' }).pipe(
            map((profile) => this.toSession(fbUser, profile as AppUser | undefined)),
            // Red de seguridad: un permission-denied de las Rules (o un fallo
            // de red) se trata igual que "sin perfil" — nunca se deja pasar.
            catchError(() => of(rejected(fbUser.uid, 'no-profile' as RejectReason))),
        );
    }

    private toSession(fbUser: User, profile: AppUser | undefined): Session {
        if (!profile) return rejected(fbUser.uid, 'no-profile');
        // isActive !== true cubre false, null y undefined a la vez.
        if (profile.isActive !== true) return rejected(fbUser.uid, 'inactive');

        return {
            status: 'active',
            uid: fbUser.uid,
            email: fbUser.email ?? profile.email,
            role: profile.role,
            firstName: profile.firstName,
            lastName: profile.lastName,
            profile,
        };
    }

    /**
     * Inicia sesión y espera a que la cadena de sesión resuelva, para ESTE
     * intento en concreto, en `active` o `rejected`.
     *
     * No basta con esperar "la próxima emisión no-loading" de `session$`: por
     * el `shareReplay`, el buffer puede seguir mostrando el estado ANTERIOR
     * (p. ej. `anonymous`) en el instante justo después de que
     * `signInWithEmailAndPassword` resuelva, antes de que el `switchMap`
     * termine de leer el nuevo `users/{uid}`. Filtrar por `uid === cred.user.uid`
     * descarta cualquier valor viejo del buffer y espera específicamente la
     * resolución de este login, sin `setTimeout` ni sondeo.
     */
    login(
        email: string,
        password: string,
    ): Observable<Extract<Session, { uid: string }>> {
        return from(signInWithEmailAndPassword(this.auth, email, password)).pipe(
            switchMap((cred) =>
                this.session$.pipe(
                    filter(
                        (s): s is Extract<Session, { uid: string }> =>
                            (s.status === 'active' || s.status === 'rejected') &&
                            s.uid === cred.user.uid,
                    ),
                    take(1),
                ),
            ),
        );
    }

    logout(): Observable<void> {
        return from(signOut(this.auth));
    }

    resetPassword(email: string): Observable<void> {
        return from(sendPasswordResetEmail(this.auth, email));
    }

    /**
     * Cambio de contraseña por el propio usuario autenticado (plan §7, Fase
     * 2 — `features/profile`). Firebase exige reautenticar antes de una
     * operación sensible como esta si la sesión no es "reciente".
     *
     * Es la única operación de la app que lee `auth.currentUser` fuera del
     * flujo de `session$` — y lo hace aquí, no en el componente, porque
     * `SessionService` es el único lugar permitido para tocar `auth.*`
     * directamente (CLAUDE.md, "Sesión y autorización").
     */
    changePassword(
        currentPassword: string,
        newPassword: string,
    ): Observable<void> {
        const user = this.auth.currentUser;
        if (!user?.email) {
            return throwError(() => new Error('no-active-session'));
        }

        const credential = EmailAuthProvider.credential(
            user.email,
            currentPassword,
        );

        return from(reauthenticateWithCredential(user, credential)).pipe(
            switchMap(() => from(updatePassword(user, newPassword))),
        );
    }
}
