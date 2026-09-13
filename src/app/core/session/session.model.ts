import { Timestamp } from '@angular/fire/firestore';

/**
 * Modelo de datos de `users/{uid}` (plan §8.2).
 *
 * El ID del documento es exactamente el UID de Firebase Auth. El campo `uid`
 * de esta interfaz **no se almacena** en el documento: se hidrata al leer con
 * `docData(ref, { idField: 'uid' })`, así el código siempre ve `user.uid` sin
 * que exista la posibilidad de que el campo y el ID del documento discrepen.
 */
export type RoleUser = 'admin' | 'user';

export interface AppUser {
    uid: string;
    firstName: string;
    lastName: string;
    ci: string;
    email: string; // espejo de Auth · en fases futuras, solo escribible por Cloud Function
    phoneNumber?: string;
    address?: string;
    role: RoleUser;
    isActive: boolean;
    photoUrl?: string;
    photoPath?: string;

    /** "apellidos nombres" normalizado → búsqueda por prefijo (Fase 2). */
    searchName: string;
    /** Búsqueda exacta insensible a mayúsculas (Fase 2). */
    emailLower: string;

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/**
 * Estado de la sesión — la cadena única de autorización (plan §6.2).
 *
 * `loading`   — Firebase Auth todavía no restauró su estado. Es el estado que
 *               hace posible resolver el bug de recarga en frío: nadie decide
 *               nada mientras estemos aquí.
 * `anonymous` — no hay cuenta de Firebase Auth.
 * `rejected`  — hay cuenta de Auth, pero no está autorizada a usar el sistema
 *               (sin documento en `users`, o `isActive !== true`).
 * `active`    — cuenta de Auth + perfil de Firestore + `isActive === true`.
 */
export type SessionStatus = 'loading' | 'anonymous' | 'active' | 'rejected';

export type RejectReason = 'no-profile' | 'inactive';

export type Session =
    | { status: 'loading' }
    | { status: 'anonymous' }
    | { status: 'rejected'; uid: string; reason: RejectReason }
    | {
          status: 'active';
          uid: string;
          email: string;
          role: RoleUser;
          firstName: string;
          lastName: string;
          profile: AppUser;
      };

export const LOADING: Session = { status: 'loading' };
export const ANONYMOUS: Session = { status: 'anonymous' };

export function rejected(uid: string, reason: RejectReason): Session {
    return { status: 'rejected', uid, reason };
}

/**
 * Comparador para `distinctUntilChanged`.
 *
 * Ignora deliberadamente cambios que no afectan a la autorización (por
 * ejemplo, una escritura de `updatedAt` en el propio perfil): solo una
 * diferencia de `status`, `uid`, `role` o `isActive` cuenta como una sesión
 * distinta. Evita reevaluar guards y repintar el menú sin necesidad
 * (plan §6.2).
 */
export function sameSession(a: Session, b: Session): boolean {
    if (a.status !== b.status) return false;
    if (a.status === 'active' && b.status === 'active') {
        return (
            a.uid === b.uid &&
            a.role === b.role &&
            a.profile.isActive === b.profile.isActive
        );
    }
    if (a.status === 'rejected' && b.status === 'rejected') {
        return a.uid === b.uid && a.reason === b.reason;
    }
    return true; // 'loading' === 'loading' · 'anonymous' === 'anonymous'
}
