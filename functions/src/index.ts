/**
 * Cloud Functions de Mi Pimpollito.
 *
 * FASE 0B: esqueleto sin lógica de negocio. Aquí solo se registran las
 * privilegiadas que el cliente no puede ejecutar con seguridad —
 * administración de Auth, ventas, vouchers y gift cards
 * (docs/architecture/mi-pimpollito-plan.md §7.3) — cada una en su fase.
 *
 * Región: southamerica-west1, la misma que Firestore (§5.4, §7.3).
 */

// FASE 2 — Users: createUser, updateUserAuth, setUserActive
// FASE 4 — Ventas: createSale, cancelSale
// FASE 5 — Voucher QR: attachVoucher
// FASE 6 — Gift Cards: issueGiftCard, cancelGiftCardIssue
