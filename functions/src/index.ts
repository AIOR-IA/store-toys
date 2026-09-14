/**
 * Cloud Functions de Mi Pimpollito.
 *
 * Región: southamerica-west1, la misma que Firestore (§5.4, §7.3).
 *
 * `@google-cloud/firestore` está declarado como dependencia directa en
 * `package.json`: desde `firebase-admin@13`, los SDKs de cada servicio
 * (Firestore, Storage, etc.) dejaron de venir incluidos — hay que instalar
 * explícitamente el de cada servicio que se use, o el contenedor falla al
 * arrancar con `Cannot find module '@google-cloud/firestore'`.
 */

// FASE 2 — Users
export { createUser, setUserActive, setUserRole, updateUserAuth } from './users';

// FASE 3 — utilidad de bootstrap: resincroniza el custom claim propio con
// Firestore (necesaria porque el primer admin se siembra a mano, sin pasar
// por createUser/setUserRole — las únicas Functions que hoy escriben el
// claim). Ver el comentario en functions/src/users.ts.
export { syncMyRoleClaim } from './users';

// FASE 4 — Ventas: createSale, cancelSale
// FASE 5 — Voucher QR: attachVoucher
// FASE 6 — Gift Cards: issueGiftCard, cancelGiftCardIssue
