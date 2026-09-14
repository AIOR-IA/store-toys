import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { auth as adminAuth, db } from './admin';
import { assertActive, assertAdmin } from './guards';
import { buildSearchName, buildSearchTokens, normalize } from './normalize';

/**
 * Cloud Functions de administración de usuarios (plan §7).
 *
 * Región: `southamerica-west1`, la misma que Firestore — la Function y la
 * base tienen que estar juntas para que las lecturas/escrituras que hace cada
 * una no paguen un salto de región (plan §7.3).
 */
const REGION = 'southamerica-west1';

const ROLES = ['admin', 'user'] as const;
type Role = (typeof ROLES)[number];

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MIN_PASSWORD_LENGTH = 8;

function requireNonEmptyString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new HttpsError(
            'invalid-argument',
            `El campo "${field}" es requerido.`,
        );
    }
    return value.trim();
}

function requireEmail(value: unknown): string {
    const email = requireNonEmptyString(value, 'email').toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
        throw new HttpsError('invalid-argument', 'Correo inválido.');
    }
    return email;
}

function requireRole(value: unknown): Role {
    if (typeof value !== 'string' || !ROLES.includes(value as Role)) {
        throw new HttpsError('invalid-argument', 'Rol inválido.');
    }
    return value as Role;
}

/**
 * El Admin SDK lanza sus propios errores (`auth/email-already-exists`, etc.)
 * con mensajes en inglés. Nunca se muestra ese texto crudo al usuario
 * (CLAUDE.md): se traduce al mismo contrato `HttpsError` que ya usa el resto
 * de la Function.
 */
function mapAuthCreationError(error: unknown): HttpsError {
    const code = (error as { code?: string })?.code;

    switch (code) {
        case 'auth/email-already-exists':
            return new HttpsError(
                'already-exists',
                'Ya existe un usuario registrado con este correo electrónico.',
            );
        case 'auth/invalid-email':
            return new HttpsError('invalid-argument', 'Correo inválido.');
        case 'auth/invalid-password':
            return new HttpsError(
                'invalid-argument',
                `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
            );
        default:
            return new HttpsError(
                'internal',
                'No se pudo crear el usuario. Intenta nuevamente.',
            );
    }
}

interface CreateUserData {
    firstName: string;
    lastName: string;
    ci: string;
    email: string;
    password: string;
    role: Role;
    phoneNumber?: string;
    address?: string;
}

/**
 * Crea un empleado: cuenta de Authentication + documento `users/{uid}`.
 *
 * El orden importa (plan §7.4): Auth primero, Firestore después con
 * `.create()` (falla si ya existe). Si el paso de Firestore falla, se
 * **compensa** borrando la cuenta de Auth recién creada — así nunca queda una
 * cuenta huérfana sin perfil ocupando un correo.
 */
export const createUser = onCall<CreateUserData>(
    { region: REGION },
    async (request) => {
        await assertAdmin(request.auth);

        const firstName = requireNonEmptyString(
            request.data.firstName,
            'firstName',
        );
        const lastName = requireNonEmptyString(
            request.data.lastName,
            'lastName',
        );
        const ci = requireNonEmptyString(request.data.ci, 'ci');
        const email = requireEmail(request.data.email);
        const role = requireRole(request.data.role);
        const password = request.data.password;
        const phoneNumber = request.data.phoneNumber?.trim() || undefined;
        const address = request.data.address?.trim() || undefined;

        if (
            typeof password !== 'string' ||
            password.length < MIN_PASSWORD_LENGTH
        ) {
            throw new HttpsError(
                'invalid-argument',
                `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
            );
        }

        let uid: string;
        try {
            const userRecord = await adminAuth.createUser({
                email,
                password,
                displayName: `${firstName} ${lastName}`.trim(),
            });
            uid = userRecord.uid;
        } catch (error) {
            throw mapAuthCreationError(error);
        }

        try {
            const profile: Record<string, unknown> = {
                firstName,
                lastName,
                ci,
                email,
                role,
                isActive: true,
                searchName: buildSearchName(firstName, lastName),
                searchTokens: buildSearchTokens(firstName, lastName),
                emailLower: normalize(email),
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };
            if (phoneNumber) profile['phoneNumber'] = phoneNumber;
            if (address) profile['address'] = address;

            await db.doc(`users/${uid}`).create(profile);
        } catch (error) {
            // Compensación (plan §7.4): sin esto, un fallo aquí deja una
            // cuenta de Auth sin perfil, con el correo ocupado para siempre.
            await adminAuth.deleteUser(uid).catch(() => undefined);
            throw new HttpsError(
                'internal',
                'No se pudo crear el perfil del usuario. Intenta nuevamente.',
            );
        }

        // Custom claim (plan §7.6): solo lo consumirán las Storage Rules en
        // una fase futura. El documento de Firestore sigue siendo la verdad
        // para las Rules de Firestore y para las Functions.
        await adminAuth.setCustomUserClaims(uid, { role });

        return { uid };
    },
);

interface UpdateUserAuthData {
    uid: string;
    email: string;
}

/**
 * Cambia el correo de un usuario existente.
 *
 * El correo vive en dos lugares y el cliente no puede escribir el espejo de
 * Firestore por ninguna vía (Rules): Authentication manda, y esta Function
 * cambia primero Auth —si falla, nada cambió— y después el espejo (plan §7.5).
 */
export const updateUserAuth = onCall<UpdateUserAuthData>(
    { region: REGION },
    async (request) => {
        await assertAdmin(request.auth);

        const uid = requireNonEmptyString(request.data.uid, 'uid');
        const email = requireEmail(request.data.email);

        const snap = await db.doc(`users/${uid}`).get();
        if (!snap.exists) {
            throw new HttpsError('not-found', 'Usuario no encontrado.');
        }

        try {
            await adminAuth.updateUser(uid, { email });
        } catch (error) {
            throw mapAuthCreationError(error);
        }

        await db.doc(`users/${uid}`).update({
            email,
            emailLower: normalize(email),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return { uid };
    },
);

interface SetUserActiveData {
    uid: string;
    isActive: boolean;
}

/**
 * Activa o desactiva una cuenta: `isActive` en Firestore **y** `disabled` en
 * Authentication, para que un usuario desactivado no pueda ni siquiera
 * completar `signInWithEmailAndPassword` (plan §7.3).
 *
 * Un admin no puede desactivarse a sí mismo — de lo contrario, la última
 * sesión de administrador podría dejar el sistema sin nadie que pueda
 * reactivarla (el plan no resuelve este caso explícitamente; es una
 * salvaguarda añadida en la Fase 2).
 */
export const setUserActive = onCall<SetUserActiveData>(
    { region: REGION },
    async (request) => {
        await assertAdmin(request.auth);

        const uid = requireNonEmptyString(request.data.uid, 'uid');
        const isActive = request.data.isActive;

        if (typeof isActive !== 'boolean') {
            throw new HttpsError(
                'invalid-argument',
                'isActive debe ser un valor booleano.',
            );
        }
        if (request.auth?.uid === uid) {
            throw new HttpsError(
                'failed-precondition',
                'No puedes activar o desactivar tu propia cuenta.',
            );
        }

        const snap = await db.doc(`users/${uid}`).get();
        if (!snap.exists) {
            throw new HttpsError('not-found', 'Usuario no encontrado.');
        }

        await adminAuth.updateUser(uid, { disabled: !isActive });
        await db.doc(`users/${uid}`).update({
            isActive,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return { uid, isActive };
    },
);

interface SetUserRoleData {
    uid: string;
    role: Role;
}

/**
 * Cambia el rol de un usuario: `role` en Firestore **y** el custom claim en
 * Authentication, en la misma operación — así el claim nunca queda
 * desincronizado del documento (deuda detectada tras la Fase 2 inicial: antes
 * el rol se escribía directo a Firestore desde el cliente y el claim se
 * quedaba con el valor de la creación).
 *
 * Un admin no puede cambiar su propio rol — la misma razón que
 * `setUserActive`: la última sesión de administrador no puede quitarse a sí
 * misma el único permiso que le permite corregir un error.
 */
export const setUserRole = onCall<SetUserRoleData>(
    { region: REGION },
    async (request) => {
        await assertAdmin(request.auth);

        const uid = requireNonEmptyString(request.data.uid, 'uid');
        const role = requireRole(request.data.role);

        if (request.auth?.uid === uid) {
            throw new HttpsError(
                'failed-precondition',
                'No puedes cambiar tu propio rol.',
            );
        }

        const snap = await db.doc(`users/${uid}`).get();
        if (!snap.exists) {
            throw new HttpsError('not-found', 'Usuario no encontrado.');
        }
        const previousRole = snap.get('role');

        // Firestore y Authentication no forman una transacción atómica.
        // Firestore va primero porque es la verdad que leen las Rules y el
        // resto de las Functions (§7.3) — pero si el segundo paso (el claim)
        // falla, NO se deja el desfase en silencio: se compensa restaurando
        // el rol anterior en Firestore, y se informa el error a quien llamó
        // en vez de devolver éxito.
        await db.doc(`users/${uid}`).update({
            role,
            updatedAt: FieldValue.serverTimestamp(),
        });

        try {
            await adminAuth.setCustomUserClaims(uid, { role });
        } catch (error) {
            try {
                await db.doc(`users/${uid}`).update({
                    role: previousRole,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            } catch (rollbackError) {
                // Peor caso: ni el claim ni la compensación funcionaron.
                // Queda un desfase real entre Firestore y Authentication —
                // se deja constancia explícita en los logs para revisión
                // manual, en vez de fallar en silencio.
                console.error(
                    `setUserRole: compensación fallida para uid=${uid}. ` +
                        `Firestore quedó en role="${role}", el custom claim ` +
                        `no se actualizó, y restaurar a role="${previousRole}" ` +
                        `también falló. Revisar manualmente.`,
                    rollbackError,
                );
            }
            throw new HttpsError(
                'internal',
                'No se pudo actualizar el rol. Intenta nuevamente.',
            );
        }

        return { uid, role };
    },
);

/**
 * Resincroniza el custom claim de rol del propio usuario autenticado con el
 * valor que ya tiene en Firestore.
 *
 * Segura por construcción: solo puede actuar sobre `request.auth.uid` — el
 * propio llamante —, nunca sobre otro uid, así que no abre ninguna vía para
 * escalar privilegios; el rol que aplica es exactamente el que ya está
 * guardado en su documento, no uno enviado por el cliente.
 *
 * Hace falta porque `createUser` y `setUserRole` son las dos únicas
 * Functions que escriben el claim, y el primer administrador se siembra a
 * mano directo en Firestore (plan §7.1) sin pasar por ninguna de las dos:
 * nace sin custom claim. Las Storage Rules (Fase 3) solo pueden leer el
 * claim —no Firestore (plan §10.4)— así que sin este claim, cualquier
 * cuenta sembrada a mano no puede subir imágenes de producto aunque su
 * documento diga `role: 'admin'`.
 */
export const syncMyRoleClaim = onCall(
    { region: REGION },
    async (request) => {
        const snap = await assertActive(request.auth);
        const role = snap.get('role');
        await adminAuth.setCustomUserClaims(request.auth!.uid, { role });
        return { role };
    },
);
