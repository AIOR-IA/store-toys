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
`@ngx-translate/core@15` + `http-loader@8` — catálogo de textos, **solo español**

**No hay API REST propia ni NestJS.** El cliente habla directo con Firestore donde las Rules
pueden validarlo; lo demás pasa por Cloud Functions.

## Ambientes

> ⚠️ **Decisión temporal vigente desde 2026-09-12** (reemplaza la regla anterior de que
> "production queda bloqueado hasta que exista `mi-pimpollito`"): Google no deja crear el
> proyecto Firebase de PROD hasta dentro de ~30 días. Mientras tanto, **el build de
> producción de Angular también habla con el Firebase de DEV.** Detalle: plan §5.5.

| Build de Angular | Firebase real | Estado |
|---|---|---|
| `development` (`ng serve`, `ng build --configuration development`) | `mi-pimpollito-dev` | normal |
| `production` (`ng build`, `ng build --configuration production`) | `mi-pimpollito-dev` **(TEMPORAL)** | hasta que exista `mi-pimpollito` |
| — futuro — `production` | `mi-pimpollito` | cuando la cuenta permita crearlo |

**`mi-pimpollito` (PROD) no existe todavía** — límite de proyectos de la cuenta.

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

### PROD — temporalmente apunta a DEV (detalle en el plan, §5.5 y §22.1)

- **`environment.production.ts` existe** y satisface `AppEnvironment`
  (`name: 'prod'`, `production: true`), pero su bloque `firebase` es —**a propósito y de
  forma temporal**— una copia exacta del de `environment.ts`: mismo `projectId`
  (`mi-pimpollito-dev`), mismo `authDomain`, mismo `storageBucket`. Lleva un comentario en
  mayúsculas en el propio archivo que no se puede pasar por alto.
- `angular.json` → `production` tiene `fileReplacements: environment.ts → environment.production.ts`.
  Esto es justo lo que faltaba: `ng build` (por defecto usa `production`) **ya compila**.
- `.firebaserc` sigue con **solo el alias `dev`** (+ `default: dev`). No se inventa un alias
  `prod` ni un segundo proyecto Firebase: solo existe uno.
- **El badge del topbar no se basa en `environment.name` ni en `environment.production`** —
  esos solo describen la configuración de Angular. Se basa en
  `environment.firebase.projectId === FIREBASE_DEV_PROJECT_ID`
  (`environment.model.ts`): por eso sigue viéndose **incluso en el build de producción**,
  mientras el Firebase real siga siendo DEV. El día que `environment.production.ts` tenga el
  `projectId` de `mi-pimpollito`, el badge desaparece solo, sin tocar el componente.
- **Cuando `mi-pimpollito` pueda crearse**, la lista completa de lo que cambia (nada de esto
  toca la arquitectura, solo datos y un alias):
  1. registrar su Web App;
  2. habilitar Authentication;
  3. crear Firestore;
  4. crear Storage;
  5. configurar Functions;
  6. copiar/desplegar Rules e índices;
  7. reemplazar el bloque `firebase` de `environment.production.ts` con los datos reales;
  8. añadir el alias `prod` en `.firebaserc`;
  9. validar y desplegar de forma independiente.

### Reglas de ambiente

- `ng serve` → **DEV** (`environment.ts` es la base, sin reemplazo).
- Ambos environments implementan `AppEnvironment`: **comentar un campo rompe la
  compilación** (verificado en los dos archivos). Nunca se comenta ni descomenta configuración.
- Un `firebase deploy` sin `-P` apunta a DEV — es el único proyecto que existe.
- **No mezclar ambientes.** El badge de Firebase se deriva del `projectId`, no del nombre de
  la configuración de Angular — ver arriba.

## Textos e i18n

**Mi Pimpollito conserva `ngx-translate` con `es.json` como catálogo central de textos,
aunque inicialmente solo exista idioma español.**

- Todo texto de la aplicación vive en `src/assets/i18n/es.json`. **No hardcodear strings
  en componentes ni plantillas.**
- Se consume con el **pipe**: `{{ 'app.users.title' | translate }}`. Cada componente
  standalone importa `TranslateModule`.
- **PROHIBIDO construir modelos dentro de `translate.get(...).subscribe(...)`.** Es el
  patrón heredado de SAHTOSO que dejaba el sidebar vacío en el arranque. Si un modelo necesita
  etiquetas (el menú, por ejemplo), guarda **claves** y la plantilla las resuelve con el pipe.
- Infraestructura en `core/config/translate.config.ts`, inyectada con `provideTranslation()`
  en `app.config.ts`. `defaultLanguage: 'es'` carga `es.json` solo: **no llamar
  `translate.use()` en el arranque**.
- **Solo español.** Sin selector de idiomas, sin detección del navegador, sin segundo archivo.
- La traducción de **PrimeNG es estática** (`core/config/primeng-es.config.ts`): es
  configuración de librería, no texto de la aplicación.
- Detalle y motivos: plan §4.5.

### Antes de añadir un texto nuevo

Aplica a título, subtítulo, etiqueta, botón, opción de menú, mensaje de validación,
mensaje de éxito/error, tooltip, placeholder, estado vacío, texto de diálogo, confirmación,
encabezado de tabla o campo de formulario:

1. Busca primero en `es.json` una clave ya existente que sirva. **Reutilízala.**
2. Si no existe, añade una clave nueva — nunca hardcodees el texto.
3. Organiza las claves por dominio bajo `app.*`, siguiendo lo ya establecido:
   `app.common.*`, `app.menu.*`, `app.users.*`. Fases futuras añaden
   `app.products.*`, `app.sales.*`, `app.giftCards.*`, etc. — un bloque por feature,
   igual que `app.users` hoy.
4. No dupliques una clave para un texto que ya existe en otro lado del catálogo.
5. No restaures claves antiguas de SAHTOSO/CLIRE salvo que sean genuinamente
   reutilizables para Mi Pimpollito (ver la poda de la Fase 0A/corrección de i18n).
6. No introduzcas otra librería de i18n.

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

- **Fase 0A COMPLETADA** (`master`). El fork de SAHTOSO quedó limpio: 398 archivos
  eliminados, identidad de Mi Pimpollito aplicada.
- **Corrección posterior a la Fase 0A:** `ngx-translate` y `es.json` se **conservan** por
  decisión del cliente — ver *Textos e i18n* arriba y plan §4.5.
- **Fase 0B COMPLETADA** (rama `phase-0b-firebase`, sin commit). El SDK de Firebase está
  conectado a `mi-pimpollito-dev`:
  - `@angular/fire@18.0.1` instalado; `firebase` fijado a `^10.14.1`.
  - `src/environments/environment.ts` con la config real de DEV, tipada por
    `environment.model.ts` (`AppEnvironment`). Sin restos de SAHTOSO/ABT.
  - `core/firebase/firebase.providers.ts` — `provideFirebase()` con App, Auth, Firestore,
    Storage y Functions (región `southamerica-west1`), inyectado en `app.config.ts`.
    **Nada lo consume todavía**: es infraestructura para la Fase 1.
  - `.firebaserc` (solo alias `dev`), `firebase.json`, `firestore.rules` y `storage.rules`
    **deny-by-default**, `firestore.indexes.json` vacío, `functions/` como esqueleto sin
    lógica de negocio. **Nada de esto se ha desplegado** (`firebase deploy`) — ver riesgos.
  - Badge **Firebase DEV** visible en el topbar, en desarrollo y en producción.
- **Corrección posterior a la Fase 0B (2026-09-12):** `environment.production.ts` **sí
  existe**, con `fileReplacements` en `angular.json`, pero **apunta temporalmente a
  `mi-pimpollito-dev`** — el proyecto PROD real (`mi-pimpollito`) tarda ~30 días más por el
  límite de proyectos de Google. Ver la sección *Ambientes* arriba, es la fuente de verdad.
- `login.component.html` y `login.component.scss` **siguen con el diseño aprobado, intacto**
  (verificado en navegador: byte-idéntico). El `.ts` ya tiene lógica real de autenticación.
- **Fase 1 IMPLEMENTADA (rama `phase-1-auth`, sin commit); verificación en vivo BLOQUEADA.**
  - `core/session/` (`session.model.ts`, `session.service.ts`, `session.guards.ts`) —
    `SessionService` con la cadena `authState → docData(users/{uid}) → session$`,
    `shareReplay(1)`, `distinctUntilChanged`, `ready$`; `login()`, `logout()`,
    `resetPassword()`. Guards `authGuard` y `guestGuard` (`roleGuard` se pospuso a Fase 2 por
    instrucción explícita: con un solo rol sembrado a mano, no hay nada que proteja todavía).
  - `login.component.ts`/`forgot-password.component.ts` conectados a Firebase real.
    `app.component`/`AppLayoutComponent`/`topbar` reaccionan a la sesión (splash, expulsión
    en caliente si `isActive` cambia a `false`, iniciales + logout real).
  - **`firestore.rules` con Rules reales de `users`, desplegadas a `mi-pimpollito-dev`**:
    un usuario autenticado lee únicamente su propio documento; `list`/`create`/`update`/
    `delete` denegados por completo desde el cliente en esta fase (más estricto que el
    §10.2 completo del plan — el resto llega en Fase 2, cuando exista la UI que lo necesite).
  - **⚠️ BLOQUEO ACTIVO — no es un bug de código:** Firebase Authentication rechaza toda
    llamada (`signInWithEmailAndPassword`, `sendPasswordResetEmail`) con
    `auth/api-key-not-valid`. Confirmado con `curl` directo contra
    `identitytoolkit.googleapis.com`, fuera de Angular. La misma key sí funciona contra
    Firestore. Diagnóstico y pasos de revisión en Google Cloud Console: plan §22.2.
    **Hasta que esto se resuelva, no se puede verificar en vivo ningún flujo de login real**
    (hard reload autenticado, logout, `isActive`, forgot password) — sí se verificó, con
    Firebase real, el redirect de `/` sin sesión, el mensaje de credenciales inválidas, y
    que las Rules deniegan una lectura sin sesión.
  - Dos bugs encontrados y corregidos durante la propia conexión (ver plan, registro de
    ejecución de la Fase 1): el campo de correo tenía un `maxLength(20)` heredado que
    bloqueaba cualquier email real, y la contraseña exigía mínimo 8 mientras el mensaje ya
    dibujado decía 6 (que es además el mínimo real de Firebase Auth) — ambos corregidos.
- **Qué existe hoy en `src/app`**: `layout/` completo, reactivo a la sesión ·
  `shared/` podado, con i18n restaurado · `core/{config,firebase,session,models,services/toast,utils}` ·
  `features/authentication` (login + forgot-password, con Firebase real) · `features/home`
  (**placeholder temporal**, sin cambios — Fase 2 lo reemplaza).
- **Pendientes heredados** que las fases siguientes deben cerrar:
  - Assets sin convertir a WebP: 6,3 MB en `src/assets/images` (Angular avisa `NG0913`).
    No hay conversor en el entorno; requiere además tocar 4 rutas del login aprobado.
  - `core/models/attachment.interface.ts` quedó sin consumidores (lo usará la Fase 3).
  - `src/assets/custom-color.png` y `custom-hue.png` quedaron sin referencia al retirar el
    parche del colorpicker de PrimeNG de `styles.scss`.
  - `functions/` no tiene `node_modules` instalado (no se ejecutó `npm install` ahí):
    esqueleto sin dependencias descargadas hasta que haga falta compilar de verdad (Fase 2).
- **Deshabilitar la auto-creación de cuentas** en Authentication → Settings → *User actions*
  quedó **verificado por el cliente** al describir la configuración de consola (registro
  público deshabilitado); no requiere acción de código.
- **Siguiente paso:** resolver el bloqueo de la API key (plan §22.2), sembrar el primer
  admin a mano (§7.1 abajo), y verificar en vivo lo que la Fase 1 no pudo probar. Después:
  **FASE 2** — Usuarios, roles, guards y sidebar.

## Comandos

```bash
npm start                      # ng serve → DEV
npm run build:dev              # ng build --configuration development → DEV
npm run build                  # ng build (production) → TEMPORALMENTE también DEV
firebase use dev               # selecciona mi-pimpollito-dev (ya es el default)
firebase deploy --only hosting -P dev
firebase deploy --only firestore:rules,firestore:indexes,storage -P dev

# NO ejecutable hasta que exista mi-pimpollito (PROD real):
# firebase deploy -P prod
```
