import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';

/**
 * Contrato de las Functions privilegiadas (plan §7.3).
 *
 * El rol se lee **del documento de Firestore**, no del custom claim: el
 * documento es la verdad inmediata. Si un admin degrada a alguien, el claim
 * puede tardar hasta una hora en propagarse al token, y una operación
 * privilegiada no puede depender de eso.
 */
export async function assertActive(auth: CallableRequest['auth']) {
    if (!auth) {
        throw new HttpsError('unauthenticated', 'Sesión requerida.');
    }

    const snap = await db.doc(`users/${auth.uid}`).get();

    if (!snap.exists) {
        throw new HttpsError('permission-denied', 'Sin perfil.');
    }
    if (snap.get('isActive') !== true) {
        throw new HttpsError('permission-denied', 'Cuenta desactivada.');
    }

    return snap;
}

export async function assertAdmin(auth: CallableRequest['auth']) {
    const snap = await assertActive(auth);

    if (snap.get('role') !== 'admin') {
        throw new HttpsError('permission-denied', 'Solo administradores.');
    }

    return snap;
}
