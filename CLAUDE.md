# Mi Pimpollito

## Proyecto

Sistema administrativo para juguetería (Oruro, Bolivia). Una sola tienda, 1–2 usuarios,
10–20 ventas/día (40–90 en Navidad), 500–1 000 productos.

## Fuente de verdad arquitectónica

**Antes de implementar una fase, leer `docs/architecture/mi-pimpollito-plan.md`.**

Ese documento contiene la arquitectura completa, el modelo de datos, las Security Rules, el
roadmap con criterios de aceptación y las 37 decisiones aprobadas. Este archivo es solo la
guía rápida. Si algo de aquí y algo de allí se contradicen, **manda el plan** — y hay que
corregir este archivo.

Si una decisión cambia: se cambia **primero en el plan**, luego en el código.

## Stack

Angular 18 (standalone, Signals + RxJS) · PrimeNG 17 · Tailwind · SCSS · FontAwesome
Firebase: Authentication · Cloud Firestore · Storage · Functions (solo lo privilegiado) · Hosting
`@angular/fire@^18` sobre `firebase@^10.7+` · dayjs (utc + timezone) · pdfmake · jsbarcode

**No hay API REST propia ni NestJS.** El cliente habla directo con Firestore donde las Rules
pueden validarlo; lo demás pasa por Cloud Functions.

## Ambientes

| | Project ID | Hosting | Estado |
|---|---|---|---|
| **DEV** | `mi-pimpollito-dev` | `https://mi-pimpollito-dev.web.app` | **creado y configurado** |
| **PROD** | `mi-pimpollito` | `https://mi-pimpollito.web.app` | **NO CREADO** — límite de proyectos de la cuenta |

### DEV — configuración real (detalle en el plan, §5.4)

| | |
|---|---|
| Web App | Mi Pimpollito Web DEV |
| Authentication | **solo Email/Password**. Google Sign-In, email link y MFA **deshabilitados** |
| Firestore | Standard · `(default)` · **`southamerica-west1`** (Santiago) · production mode |
| Storage | bucket `mi-pimpollito-dev.firebasestorage.app` · **`US-CENTRAL1`** · Standard · production mode |
| Billing | **Blaze** + alerta de **USD 5** (es una alerta, **no un límite duro**) |
| CLI | `firebase-tools` 15.3.0 · login hecho · `projects:list` reconoce el proyecto |

- **Cloud Functions van en `southamerica-west1`**, la misma región que Firestore.
- El bucket está en `US-CENTRAL1` a propósito (cuota gratuita): por eso la **compresión de
  imágenes en el cliente no es negociable**.

### PROD — bloqueado (detalle en el plan, §5.5 y §22.1)

- **`mi-pimpollito` no existe todavía.** La cuenta alcanzó el límite de proyectos de Firebase.
- **DEV NO se usa como PROD.** Ni temporalmente.
- **No se crea `environment.production.ts`**, y **nunca** apuntará a `mi-pimpollito-dev`.
- `.firebaserc` lleva **solo el alias `dev`** (+ `default: dev`) hasta que PROD exista.
- Por eso **`ng build` a secas (configuración `production`) no es ejecutable**: durante todo
  el desarrollo se usa `ng build --configuration development`.
- Cuando PROD se pueda crear: misma región de Firestore (`southamerica-west1`), mismo
  criterio de Storage (`US-CENTRAL1`), solo Email/Password, production mode, Blaze + alerta.
  Se configura y se despliega **por separado**.
- No bloquea las Fases 0A–5, que se construyen contra DEV. **Sí bloquea el despliegue a
  producción al cerrar la Fase 5**: hay que desbloquear la cuota antes de llegar ahí.

### Reglas de ambiente

- `ng serve` → **DEV** (`environment.ts` es la base, sin reemplazo).
- `environment.ts` implementa la interfaz `AppEnvironment`: **comentar un campo rompe la
  compilación**. Nunca se comenta ni descomenta configuración.
- Un `firebase deploy` sin `-P` apunta a DEV.
- **No mezclar ambientes.** Badge `DEV` visible en el topbar cuando `environment.name !== 'prod'`.

## Roles

```ts
export type RoleUser = 'admin' | 'user';
```

| Rol | Ve en el menú | Puede |
|---|---|---|
| `admin` | Inicio · Ventas · Productos · Gift Cards · Usuarios · Reportes | todo |
| `user` | Inicio · Ventas · Productos · Gift Cards | vender · crear productos · emitir gift cards |

Un `user` **no** ve reportes, **no** cambia precios y **solo ve sus propias ventas del día**.

## Reglas de desarrollo

### Proceso

- **Respetar el roadmap por fases.** Una fase por sesión, en orden.
  **No implementar una fase futura por adelantado**, ni "de paso".
- Cerrar cada fase con sus criterios de aceptación verificados (están en el plan).
- **Las Security Rules se escriben junto a cada fase**, nunca al final.
- Los índices compuestos van en `firestore.indexes.json` y se despliegan con el código.
  Nunca se crean por consola: DEV y PROD no deben divergir.
- **Nunca pedir** contraseñas, tokens personales, claves privadas ni service account JSON.
  `firebase login` y `firebase init hosting:github` los ejecuta el desarrollador por navegador.

### Sesión y autorización

- **Una sola fuente de verdad de sesión:** `authState → switchMap → docData(users/{uid})`
  con `shareReplay({bufferSize:1, refCount:false})`, en `core/session/session.service.ts`.
- **Nunca leer `auth.currentUser`** fuera de `SessionService`.
- Los guards **devuelven el Observable** (`ready$.pipe(take(1), map(...))`). El router espera.
- **Prohibido:** `setTimeout`, `setInterval`, polling, `subscribe` anidados, `APP_INITIALIZER`
  bloqueante y `location.href`. Son la causa del bug de recarga en frío que hay que evitar.
- Tras cada fase, repetir la prueba: **`F5` en una ruta protegida no debe llevar al login.**
- `users/{uid}` — el ID del documento es el UID de Auth. El campo `uid` **no se almacena**
  (se hidrata con `idField`).
- `isActive` es obligatorio y se comprueba en **tres** capas: sesión, Rules y Functions.
- **La autorización real son las Rules y las Functions.** Esconder el menú no es seguridad;
  el guard tampoco.

### Datos

- **Paginación por cursores** siempre (`orderBy` + `limit` + `startAfter`, pila de cursores
  en memoria). Tamaños 10/20/50, sin salto de página. Total con `getCountFromServer()`.
- **Nunca `getDocs()` sin `limit()`**, ni en desarrollo ni para depurar.
- **No descargar colecciones completas.** No filtrar ni sumar en el cliente lo que se puede
  consultar o agregar en el servidor.
- **`onSnapshot` solo donde el tiempo real aporta**: hoy únicamente la cadena de sesión.
  Todo lo demás con `getDoc`/`getDocs`.
- Búsquedas por **prefijo** sobre campos normalizados (`nameLower`, `searchName`,
  `emailLower`) con `startAt`/`endAt`. Sin Algolia.
- **Dinero: enteros en centavos** (`priceCents`, `totalCents`, `amountCents`). Nunca
  decimales. `toCents()`/`fromCents()` en el borde del formulario y un `MoneyPipe` para mostrar.
- **Fechas:** `createdAt` con `serverTimestamp()`. `dateKey`/`monthKey`/`year` los calcula la
  Cloud Function en **`America/La_Paz`** (UTC−4: una venta de las 20:00 es del día anterior
  en UTC). Nunca con la hora del navegador.
- **Soft delete** con `isActive` en `users` y `products`; `delete` denegado en las Rules.
  Las ventas **nunca** se borran ni se editan: `status: 'cancelled'`.
- **Compatibilidad histórica:** cada `SaleItem` guarda snapshot de `code`, `name` y
  `unitPriceCents`; la venta guarda `sellerName`. Ningún reporte lee `products`.
- **Nunca imágenes en base64 en Firestore.** Todo archivo va a Storage
  (`products/`, `qr-vouchers/`, `users/`), comprimido en el cliente a WebP/JPEG.
- **Nunca contraseñas en Firestore.** Viven solo en Authentication.
- Un `withConverter` por colección. Nada de improvisar la forma de los datos en un componente.

### Productos y códigos

- `products/{autoId}` — el código de barras **no** es el ID del documento.
- Índice `barcodes/{code} → { productId, kind }`: el código es el ID, lo que garantiza
  unicidad y permite varios códigos por producto. Producto + índices en un `writeBatch`.
- **Imagen obligatoria**: la Rule exige `imagePath` no vacío.
- Códigos internos: `MP` + secuencial desde `counters/internalCode` (solo `seq + 1`).
  Simbología **Code 128**. Nunca inventar EAN-13.
- El vendedor **crea** productos y edita lo no sensible; **solo el admin** cambia
  `priceCents`, `code` e `isActive`.
- El formulario de producto debe ser **usable en un celular** (es la herramienta de carga
  del catálogo, con la cámara).

### Ventas

- **`sales` tiene `allow write: if false`.** Solo la Function `createSale` escribe, con
  `runTransaction` y `.create()` idempotente sobre un `saleId` pre-generado en el cliente.
  El servidor **recalcula, no confía**: valida `unitPriceCents` contra el producto.
- **`payments: Payment[]`**, nunca un único `paymentMethod`. Además
  `paymentMethods: PaymentMethod[]` (para consultar) y `cashCents`/`qrCents`/`giftCardCents`
  (para agregar). Invariante: `Σ payments[].amountCents === totalCents`.
- `PaymentMethod = 'cash' | 'qr' | 'giftcard'`. **No hay tarjeta de débito/crédito.**
- **Se permite vender sin stock** (`settings.allowSaleWithoutStock`, inicial `true`):
  el stock **puede quedar negativo**, y por eso la Rule valida `stock is int` pero **no**
  `stock >= 0`.
- **No hay devoluciones ni cambios.** La única corrección es `cancelSale` (solo admin), que
  devuelve stock y ajusta el resumen del día.
- Voucher QR: `voucherStatus: 'pending' | 'uploaded'`. Se adjunta después vía `attachVoucher`
  (la foto está en un celular y el POS es una laptop). El voucher es **inmutable**.
- El POS se diseña para **teclado y lector USB HID** (monitores no táctiles): un `<input>`
  visible y siempre enfocado que dispara con `Enter`.

### Gift Cards

- Tres colecciones: `giftCards` (el plástico, ID = código impreso) ·
  `giftCardIssues` (el saldo, con `remainingAmountCents`) ·
  `giftCardMovements` (el libro mayor). Puntero `activeIssueId` para consultar saldo en 2 lecturas.
- **Emitir una gift card NO es una venta.** No crea documento en `sales`. Es un pasivo.
  Es lo que hace imposible la doble contabilización.
- **Consumo total, sin saldo remanente** (`giftCardAllowsPartial: false`). Si la compra es
  menor, el sobrante se extingue con un movimiento **`forfeit`** — así se mantiene
  `Σ payments == totalCents` sin perder el rastro del dinero.
- Si la compra supera el valor de la tarjeta, la diferencia va en efectivo o QR: es el
  **único** pago mixto que la UI ofrece.
- No caducan, no se recargan, el plástico se reutiliza. Emiten admin y vendedor; registrar
  plástico nuevo es solo del admin.
- Todo cambio de saldo nace con su movimiento **en la misma transacción**.

### Reportes

- **Solo admin**, en guard **y** en Rules.
- Se leen de `dailySummaries/{dateKey}` (escrito por `createSale`/`cancelSale` en la misma
  transacción): un año son 365 lecturas por ID, no miles.
- El cierre de caja **compara** el resumen contra `sum()` sobre `sales` y avisa si difieren.
- Dos identidades que deben cuadrar en pantalla:
  `mercancía vendida == Σ pagos de las ventas` y
  `dinero recibido == (cash+qr de ventas) + (cash+qr de emisiones)`.
- Exportación solo a **PDF** (`pdfmake`, hoja carta). Sin Excel ni CSV.

## Estado actual

- **El proyecto heredado es un fork de SAHTOSO** (sistema GIS), no de CLIRE. ~221 de 301
  archivos de `features/` son de dominio ajeno, más ~18 dependencias GIS/editores/sockets.
  **La limpieza es la Fase 0A** y empieza con un commit de los cambios pendientes.
- **No hay nada de Firebase escrito todavía** (`firebase@^10` está en `package.json` sin usar).
  El proyecto DEV existe en la consola, pero el repositorio aún no tiene `firebase.json`,
  `.firebaserc`, reglas ni `environment` conectados: eso es la Fase 0B.
- `login.component.html` y `login.component.scss` **ya tienen el diseño aprobado: no se
  rediseñan.** Solo se reescribe el `.ts`.
- **Ninguna fase implementada.** Siguiente paso: **FASE 0A**.

## Comandos

```bash
npm start                      # ng serve → DEV
npm run build:dev              # ng build --configuration development → DEV
firebase deploy --only hosting -P dev
firebase deploy --only firestore:rules,firestore:indexes,storage -P dev

# NO ejecutable hasta que exista mi-pimpollito (PROD):
# npm run build                # ng build (configuración production)
# firebase deploy -P prod
```
