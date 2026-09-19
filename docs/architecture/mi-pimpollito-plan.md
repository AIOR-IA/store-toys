# Mi Pimpollito — Plan técnico y arquitectura

> **Fuente de verdad técnica del proyecto.** Cualquier decisión de implementación
> se toma leyendo este documento. Si una decisión cambia, se cambia **aquí** y
> después en el código, nunca al revés.

| | |
|---|---|
| **Proyecto** | Mi Pimpollito — sistema administrativo para juguetería |
| **Negocio** | Artículos y accesorios para niños · Oruro, Bolivia |
| **Estado del documento** | Planificación cerrada · aprobada · **Fases 0A y 0B implementadas · Fase 1 implementada, verificación en vivo bloqueada** (§22.2) |
| **Última consolidación** | 2026-09-12 |
| **Fuentes consolidadas** | Plan técnico completo + cuestionario de 48 preguntas respondido por el cliente + **configuración real de Firebase DEV** (§5.4) |
| **Infraestructura** | DEV `mi-pimpollito-dev` **creado, configurado y conectado a Angular** (en `development` y, **temporalmente**, también en `production`) · PROD `mi-pimpollito` **pendiente**, ~30 días por límite de proyectos de la cuenta (§5.5) |
| **Bloqueante activo** | La Web API Key de `mi-pimpollito-dev` es rechazada por Firebase Authentication (§22.2) — pendiente de revisión en Google Cloud Console por el dueño de la cuenta |
| **Siguiente paso** | Resolver §22.2, luego sembrar el primer admin (§7.1) y verificar la Fase 1 en vivo. Después: FASE 2 |

---

## Cómo leer este documento

1. **§1 Contexto de negocio** y **§2 Qué cambió con las respuestas del cliente** son lo
   primero que hay que leer: ahí está lo que diferencia este plan de su versión anterior.
2. **§3 a §20** son las secciones técnicas. Cada una contiene las decisiones de su
   dominio con el formato *recomendación / por qué / descartadas / impacto futuro* cuando
   había alternativas reales.
3. **§21 Decisiones arquitectónicas aprobadas** es la tabla de consulta rápida.
4. **§23 Roadmap** es el contrato de trabajo: una fase por sesión, en orden.
5. **§25 Anexo** conserva las 48 respuestas del cliente, literales, como evidencia de
   por qué cada política es la que es.

**Regla de proporción que gobierna todo el documento.** El negocio hace 10–20 ventas
diarias (40–90 en campaña de Navidad), con un solo puesto de venta y 1–2 personas.
Toda decisión aquí se justifica por **seguridad, consistencia o mantenibilidad**, nunca
por escala. Donde una optimización solo se justificaría por volumen, está marcada como
*posponer* con la condición concreta que la reabriría.

---

## Índice

| § | Sección |
|---|---|
| 1 | [Contexto de negocio](#1-contexto-de-negocio) |
| 2 | [Qué cambió con las respuestas del cliente](#2-qué-cambió-con-las-respuestas-del-cliente) |
| 3 | [Auditoría del proyecto heredado](#3-auditoría-del-proyecto-heredado) |
| 4 | [Arquitectura objetivo](#4-arquitectura-objetivo) |
| 5 | [Ambientes DEV y PROD](#5-ambientes-dev-y-prod) |
| 6 | [Autenticación y sesión](#6-autenticación-y-sesión) |
| 7 | [Usuarios, roles y Cloud Functions](#7-usuarios-roles-y-cloud-functions) |
| 8 | [Modelo de datos Firestore](#8-modelo-de-datos-firestore) |
| 9 | [Cloud Storage](#9-cloud-storage) |
| 10 | [Security Rules](#10-security-rules) |
| 11 | [Navegación y layout](#11-navegación-y-layout) |
| 12 | [Paginación y búsquedas](#12-paginación-y-búsquedas) |
| 13 | [Productos e imágenes](#13-productos-e-imágenes) |
| 14 | [Códigos de barras y lector USB HID](#14-códigos-de-barras-y-lector-usb-hid) |
| 15 | [Ventas, pagos y stock](#15-ventas-pagos-y-stock) |
| 16 | [Gift Cards](#16-gift-cards) |
| 17 | [Dinero y fechas](#17-dinero-y-fechas) |
| 18 | [Reportes y comprobantes PDF](#18-reportes-y-comprobantes-pdf) |
| 19 | [Optimización de lecturas y costes](#19-optimización-de-lecturas-y-costes) |
| 20 | [Hosting y CI/CD](#20-hosting-y-cicd) |
| 21 | [Decisiones arquitectónicas aprobadas](#21-decisiones-arquitectónicas-aprobadas) |
| 22 | [Decisiones pendientes](#22-decisiones-pendientes) |
| 23 | [Roadmap por fases](#23-roadmap-por-fases) |
| 24 | [Riesgos](#24-riesgos) |
| 25 | [Anexo: respuestas del cliente](#25-anexo-respuestas-del-cliente) |

---

## 1. Contexto de negocio

Datos confirmados por el cliente. Todo lo que sigue en el documento se dimensiona
contra estas cifras.

| Hecho | Valor | Consecuencia técnica |
|---|---|---|
| Sucursales | **Una sola**, sin planes de abrir otra | `stock` es un entero por producto. Sin `branchId` en ningún modelo |
| Conectividad | Internet **estable** | El punto de venta puede exigir conexión. **No** se diseña modo offline |
| Facturación fiscal | **No se requiere** | Sin NIT, sin numeración fiscal, sin integración con Impuestos. Solo comprobante interno |
| Usuarios iniciales | **1**: Lenar Mario Lima Toledo · lenar.toledo@gmail.com | El primer admin se siembra a mano (§7) |
| Roles | **Dos**: `admin`, `user` | `export type RoleUser = 'admin' \| 'user'` |
| Catálogo | **500–1 000 productos**, sin lista previa, carga manual | Paginación por cursores obligatoria. La carga de datos es el camino crítico del proyecto (§24) |
| Ventas | **10–20/día**, **40–90/día en Navidad** | ~4 000–8 000 ventas/año. Agregaciones de servidor + un resumen diario (§19) |
| Puestos de venta | **1** | Sin concurrencia real. La transacción cubre el caso de todos modos |
| Formas de pago | **Efectivo, QR, gift card**. Sin tarjeta de débito/crédito | `PaymentMethod = 'cash' \| 'qr' \| 'giftcard'` |
| Moneda | **Solo bolivianos (BOB)** | Sin multi-moneda. Enteros en centavos |
| Devoluciones y cambios | **No se aceptan** (política de la empresa) | Sin módulo de devoluciones. La anulación por admin es el único mecanismo de corrección (§15) |
| Dispositivo del mostrador | Laptop/PC, **monitores no táctiles** | UI de venta orientada a teclado y lector, no a dedos |
| Horario | 08:00–20:00 (`America/La_Paz`) | Las ventas de la tarde caen en el día UTC siguiente: el cálculo de `dateKey` es crítico (§17) |
| Fecha objetivo | **Fin de septiembre de 2026** | Obliga a un corte explícito de MVP (§23) |
| Identidad | `logo.png` es el logo final | El resto de variantes se eliminan en Fase 0A |

**Datos de la tienda** (van a `settings/app`, no al código):

```
Mi Pimpollito — JUGUETERÍA
Artículos y accesorios para Niños
Calle Tomás Frias entre Av. Antofagasta y Pisagua Nº 100, Oruro
Tel. +591 77966329
@mipimpollito
```

**Proyectos Firebase.** La configuración completa y real de DEV está en **§5.4**; el estado
de PROD y sus reglas, en **§5.5**.

| Ambiente | Project ID | Hosting | Estado |
|---|---|---|---|
| **DEV** | `mi-pimpollito-dev` | `https://mi-pimpollito-dev.web.app` | **Creado y configurado** (§5.4) |
| **PROD** | `mi-pimpollito` | `https://mi-pimpollito.web.app` | **No creado todavía** — la cuenta alcanzó el límite de proyectos (§5.5) |

Cuenta: `lenar.toledo@gmail.com`. **Nunca se solicitan** contraseñas, tokens personales,
claves privadas ni service account JSON: la autenticación de Firebase CLI la ejecuta el
desarrollador manualmente por navegador.

---

## 2. Qué cambió con las respuestas del cliente

Las 48 respuestas resolvieron las 8 decisiones que estaban pendientes y, además,
**contradijeron cuatro decisiones del plan original**. Esta sección existe para que no
quede ninguna duda de cuál es la decisión vigente.

### 2.1 Decisiones del plan que las respuestas invirtieron

#### C-1 · Vender con stock insuficiente: ahora **permitido por defecto**

- **Plan original:** no permitirlo; un admin lo autoriza caso por caso.
- **Respuesta del cliente (C4):** *"de momento sí podemos permitir, podemos tener alguna
  opción o tipo variable de entorno para permitir o no, pero por defecto que deje vender"*.
- **Decisión vigente:** `createSale` **no bloquea** por stock insuficiente. El
  comportamiento lo gobierna `settings/app.allowSaleWithoutStock`, con valor inicial
  `true`. Con `false`, la Function rechaza la venta.
- **Consecuencia que hay que aceptar:** `stock` **puede quedar negativo**. Un stock de
  −3 significa "se vendieron 3 unidades que el sistema no sabía que existían", y es
  información útil, no un error. Por eso:
  - la Rule de `products` valida `stock is int` pero **no** `stock >= 0`
    (si lo validara, un producto con stock negativo no podría volver a guardarse);
  - la restricción de no-negatividad se aplica en el **formulario**, para la carga manual;
  - el POS muestra un aviso visible al vender sin stock, y el listado de productos
    marca en rojo el stock negativo.

#### C-2 · Gift card: ahora **consumo total, sin saldo remanente**

- **Plan original:** consumo parcial con saldo remanente (recomendación explícita).
- **Respuestas del cliente (E3, E4):** *"se gasta todo de una vez"* · vuelto en efectivo: *"no"*.
- **Decisión vigente:** `settings/app.giftCardAllowsPartial = false`. Una emisión se
  consume **en una sola venta** y queda `depleted`.
- **Derivación importante, y es la parte delicada.** Si la tarjeta es de Bs 100 y la
  compra es de Bs 80, la emisión se cierra completa pero **la venta no puede registrar
  un pago de Bs 100 contra un total de Bs 80**: rompería el invariante
  `Σ payments == totalCents`, que es lo que hace auditable la caja. La solución correcta
  y contablemente limpia:
  - el pago de la venta es `{ method: 'giftcard', amountCents: 8000 }` — lo que costó la mercancía;
  - los Bs 20 restantes se registran como un movimiento **`forfeit`** en
    `giftCardMovements`, que extingue el pasivo sin entregar mercancía;
  - el reporte gana una línea propia: *saldo no reclamado*. Es ingreso reconocido
    (*breakage* en la jerga de retail), y tenerlo separado evita que aparezca como
    mercancía vendida.
  - por eso `GiftCardMovement.type` incorpora `'forfeit'`, que no estaba en el plan original.
- **Si la compra supera el valor de la tarjeta** (Bs 100 de tarjeta contra Bs 150 de
  compra), la diferencia se cobra en efectivo o QR. Esto es un **pago mixto**, que la
  respuesta D4 dice que "generalmente no ocurre" — y es exactamente la razón por la que
  `payments[]` es un array desde el primer día (§15). La UI ofrece **solo** esa
  combinación: `[giftcard, cash]` o `[giftcard, qr]`. Nunca `cash + qr`.

#### C-3 · Productos: el **vendedor también los crea**

- **Plan original:** `products` escribible solo por `isAdmin()`.
- **Respuestas del cliente (A5, G3):** *"el vendedor … en caso que sea necesario crea un
  producto"* · quién carga el catálogo: *"el vendedor o administrador"*.
- **Decisión vigente:** el vendedor **crea** productos y **edita** los campos no
  sensibles; **solo el admin cambia el precio, el código y el estado**. En Rules:

  ```
  allow create: if isStaff() && <validaciones de forma>;
  allow update: if isAdmin() && <validaciones>;
  allow update: if isStaff() && untouched(['priceCents','code','isActive','createdAt']);
  ```

- **Por qué así y no `isStaff()` a secas:** si un vendedor pudiera editar `priceCents`,
  podría bajar el precio de un juguete, venderlo y devolverlo a su valor. La división
  crear/editar-precio cierra ese camino sin estorbar el trabajo real, que es cargar el
  catálogo. Queda un residuo: un vendedor puede **crear** un producto duplicado con
  precio bajo. Es trazable (el producto lleva `createdBySellerId`, y `createSale` valida
  el precio contra el documento del producto, así que la venta quedaría registrada con
  ese precio bajo y visible en el reporte) y, con una o dos personas de confianza en la
  tienda, es proporcional. Por eso `Product` incorpora `createdBySellerId` y
  `createdBySellerName`, que no estaban en el plan original.

#### C-4 · Voucher QR: ahora **se puede adjuntar después de la venta**

- **Plan original:** todo pago `qr` exige `voucherPath` **en el momento** de crear la
  venta; `createSale` lo valida y rechaza si falta.
- **Respuestas del cliente (D2, D3, G1):** el cliente muestra su comprobante de pago en
  el celular y *"le tomamos una foto a eso"*; la confirmación del banco *"llega al dueño
  o al celular que pueden dejar en la tienda"*; y el puesto de venta es *"laptop o
  computadora, no son táctiles los monitores"*.
- **El problema real:** en el instante de confirmar la venta, la foto está **en un
  celular** y el sistema corre **en una laptop**. Exigir el archivo para poder cobrar
  deja al vendedor bloqueado con el cliente delante.
- **Decisión vigente:** la venta se registra con el pago QR y
  `voucherStatus: 'pending'`; el archivo se adjunta después, desde cualquier dispositivo
  con sesión — incluido el navegador del celular que recibió la confirmación.
  - `Payment` incorpora `voucherStatus: 'pending' | 'uploaded'`.
  - Una Function `attachVoucher(saleId, paymentIndex, voucherPath)` es la única vía de
    escritura: valida que el pago sea `qr`, que el voucher no exista todavía
    (**inmutable**: no se reemplaza) y sella `voucherStatus: 'uploaded'`.
  - El **cierre de caja** del día no se puede marcar completo con vouchers pendientes, y
    el listado de ventas marca las que los tienen. Así la deuda es visible en lugar de
    silenciosa, que es lo único que el plan original garantizaba de verdad.
- **Descartadas:** *bloquear la venta* (inviable en el mostrador); *webcam de la laptop
  apuntando al celular* (muchos equipos no tienen cámara y la foto es ilegible);
  *no guardar voucher* (contradice D2, que pide explícitamente guardar el registro del pago).

### 2.2 Requisito derivado que ninguna de las dos fuentes había enunciado

**Dos flujos tienen que funcionar en el navegador de un celular**, aunque el punto de
venta sea de escritorio:

1. **Carga del catálogo.** B5 dice que alguien va a fotografiar los productos y que la
   imagen es obligatoria al crear el producto; G1 dice que la computadora no tiene
   cámara. La única forma de que eso funcione sin trasegar archivos es que la persona
   recorra los estantes **con el celular**, fotografíe y cree el producto ahí mismo
   (`<input type="file" accept="image/*" capture="environment">`).
2. **Adjuntar el voucher QR**, por lo explicado en C-4.

El resto de la aplicación —POS, usuarios, reportes— se diseña para laptop, teclado y
lector. Esto no obliga a una app móvil: obliga a que **el formulario de producto y la
pantalla de vouchers pendientes sean responsivos y usables con el pulgar**. Es una
restricción de diseño de dos pantallas, no de arquitectura.

### 2.3 Alcance que las respuestas **eliminaron**

Lo que ya no hay que construir, y conviene tener escrito para no volver a discutirlo:

| Descartado | Respuesta |
|---|---|
| Sucursales, stock por tienda | A1 — una sola tienda |
| Modo offline del punto de venta | A2 — internet estable |
| Factura fiscal, NIT, numeración | A3 — solo comprobante interno |
| Importación de catálogo (Excel/CSV) | B2 — no hay lista previa; carga manual |
| Precio mayorista / por cantidad | B6 — precios únicos |
| Devoluciones y cambios | C6 — no se aceptan |
| Tarjeta de débito/crédito como forma de pago | D1 — solo efectivo, QR, gift card |
| Multi-moneda, dólares | D5 — solo bolivianos |
| Caducidad de gift cards | E5 — no caducan; el plástico se reutiliza |
| Recarga de gift cards | E6 — no |
| Comisiones a vendedores | F2 — no |
| Registro de egresos/gastos | F3 — no |
| Exportación a Excel/CSV | F4 — *"basta con un PDF"* |
| Ranking dedicado de más vendidos | F5 — no (el detalle por producto de F1 lo cubre) |
| Integración con API de banco para QR | D2 — el flujo es manual, por foto del comprobante |

### 2.4 Alcance que las respuestas **añadieron**

| Añadido | Respuesta | Dónde entra |
|---|---|---|
| **Generador de códigos internos + impresión de etiquetas de código de barras** | B3 — *"un 10% no tiene código … necesitamos un generador"* | Fase 3 (§14) |
| Alerta de stock bajo | B8 — *"me parece buena la idea"* | Fase 3 (§13) |
| Anulación de ventas por admin como mecanismo único de corrección | C6 + C7 | Fase 4 (§15) |
| Nombre de cliente opcional en la venta | C8 — *"puede ser opcional, si no da datos … anónimo"* | Fase 4 (§15) |
| Reporte con detalle por producto para día/semana/mes/año | F1 | Fase 7 (§18, §19) |
| Resumen diario mantenido por la Function | consecuencia de F1 + C1 | Fase 4 escribe · Fase 7 lee (§19) |
| Restricción de lectura: el vendedor solo ve **sus** ventas **del día** | A5, C5 | Fase 4 (§10) |
| Comprobante PDF en hoja carta (no rollo térmico) | A3, B4 — *"generar un PDF normal en carta"* | Fase 4 (§18) |

---

## 3. Auditoría del proyecto heredado

### 3.1 El origen real del fork

**El proyecto heredado no es CLIRE: es SAHTOSO**, un sistema de gestión territorial y
GIS de proyectos y comunidades. Esto se creía distinto al empezar la planificación y es
el hallazgo que más cambia el tamaño de la Fase 0.

La identidad original sigue presente en todos los niveles:

- `package.json` → `"name": "sahtoso-frontend"`
- `angular.json` → `projects.sahtoso-frontend`, `outputPath: dist/sahtoso-frontend`
- `AppComponent.title = 'sahtoso-frontend'`
- `environment.ts` → `API_URL: https://sahtoso.bits.bo/api`
- `docs/CI-CD-PIPELINE.md` y `docs/DEPLOYMENT-PROTOCOL.md` describen el despliegue del
  sistema original (se reemplazan en Fase 0A)
- scripts `start:prod-sahtoso`, `build:prod-sahtoso`

**Aproximadamente 221 de 301 archivos de `src/app/features/` no tienen ninguna relación
con una juguetería**, más ~18 dependencias de dominio ajeno y las carpetas
`src/assets/geovisor` y `src/assets/i18n`.

> La limpieza **no se ejecuta en esta tarea**. Se ejecuta en la Fase 0A, de forma
> controlada, y **empieza con un commit** de los cambios sin confirmar que hay hoy
> (`login.component.html`, `login.component.scss`, tres imágenes modificadas y tres sin
> rastrear) para que todo borrado sea reversible con `git`.

### 3.2 Inventario y clasificación

| Ruta | Qué es | Archivos | Destino | Nota |
|---|---|---:|---|---|
| `features/projects` | Proyectos + comunidades (SAHTOSO) | 73 | **Eliminar** | Sin equivalente |
| `features/roles` | CRUD de roles y matriz de permisos | 48 | **Eliminar** | Se reemplaza por `role: 'admin' \| 'user'` |
| `features/theme` | Capas y temas geográficos | 40 | **Eliminar** | GIS |
| `features/web-map-service` | Servicios WMS | 36 | **Eliminar** | GIS |
| `features/audit` | Bitácora contra API REST | 13 | **Eliminar** | Rediseñable sobre Firestore si se pide |
| `features/system-configs` | Configuración vía API | 11 | **Eliminar** | Se sustituye por `settings/app` |
| `features/users` | CRUD de usuarios, tabla y tarjetas | 42 | **Adaptar** | Se conserva la *forma* de UI; el servicio se reescribe a Firestore |
| `features/authentication` | login, forgot, reset, confirm | 19 | **Adaptar** | Login ya rediseñado (HTML/SCSS); el TS se reescribe |
| `features/profile` | Perfil y cambio de contraseña | 10 | **Adaptar** | Útil en Fase 2 |
| `features/home` | Dashboard vacío | 9 | **Adaptar** | Pasa a ser Inicio |
| `layout/` | Topbar, sidebar, menú, footer, LayoutService | 33 | **Reutilizar** | Es el activo más valioso del fork. Solo cambia el contenido del menú |
| `shared/components/ui` | ~22 componentes: search-bar, spinner, field-error, title-bar, input-file, paginator de tarjetas… | ~90 | **Reutilizar** | Salvo `map`, `flow-status*`, `audit-observations`, `task-priority-chip` |
| `core/services/base-http*` | CRUD genérico REST + paginación offset | 6 | **Eliminar** | Se reemplaza por `BaseFirestoreService` |
| `core/guards`, `core/interceptors` | JWT + permisos bitwise | 8 | **Eliminar** | Se reescriben (§6, §11) |
| `core/services/session.service.ts` | Sesión desde JWT, multi-rol, 20+ `can*` | 1 | **Eliminar** | Se reescribe completo |
| `assets/images` | Identidad Mi Pimpollito ya cargada | 8 | **Adaptar** | **10,8 MB en total** |
| `assets/layout/styles` | Tema PrimeNG tailwind-light + layout SCSS | ~40 | **Reutilizar** | Repaletizar a la marca |
| `assets/geovisor`, `assets/i18n` | Configuración GIS y traducciones | — | **Eliminar** | i18n se retira (§4) |
| — | `core/firebase/*`, `functions/`, `firestore.rules`, `storage.rules` | 0 | **Crear** | No existe nada de Firebase todavía |

### 3.3 Hallazgos que condicionan el plan

1. **`firebase@^10` ya está en `package.json` pero no se usa en ningún archivo de `src/`.**
   Cero líneas de Firebase escritas: se parte de hoja limpia, sin deuda de migración.
2. **La configuración de ambientes ya está en el estado que hay que evitar.**
   `environment.prod.ts` tiene `API_URL` **comentado** — exactamente el patrón de MEDIDENT,
   ya presente aquí.
3. **El build de producción apunta al servidor del otro proyecto.**
   `defaultConfiguration: "production"` y la configuración `production` **no tiene
   `fileReplacements`**: un `ng build` toma `environment.ts` → `https://sahtoso.bits.bo/api`.
   El reemplazo solo existe en `production-sahtoso` y `development`. Además hay una
   configuración `staging` referenciada en `serve` que no existe en `build`.
4. **La sesión heredada funciona porque es sincrónica.** `SessionService` decodifica el JWT
   de `sessionStorage` en su constructor y `AuthGuard` responde `true/false` de inmediato.
   Firebase restaura la sesión de forma **asíncrona**: portar ese guard tal cual reproduce
   el bug de recarga en frío de MEDIDENT con certeza. Es el punto central de §6.
5. **La capa de datos asume paginación offset.** `PaginatedResult.meta` trae `total`,
   `lastPage`, `prev`, `next`; `BaseHttpService.findAll` envía `page/perPage`. Firestore no
   entrega `total` ni permite saltar a la página 7. Afecta a `base-list.component`,
   `cards-paginator` y a las tablas PrimeNG en modo lazy.
6. **El menú depende de una llamada asíncrona de traducción.** `AppMenuContentService`
   construye el modelo dentro de `translate.get('app').subscribe(...)` y evalúa permisos
   **una sola vez**. Con una sesión que se resuelve después, el sidebar quedaría vacío.
7. **Navegación por recarga completa.** Login y logout usan `location.href = '/'`, y hay un
   `setInterval` de 30 s vigilando la expiración del token. Ambos patrones son
   incompatibles con Firebase: fuerzan reinicializar el SDK en cada tránsito, y Firebase
   ya renueva sus propios tokens.
8. **Los assets pesan 10,8 MB.** `background.png` 2,13 MB · `background2.png` 2,32 MB ·
   `background3.png` 2,08 MB · `background4.png` 1,68 MB · `logo.png` 1,30 MB ·
   `logo2.png` 0,70 MB · `logo3.png` 0,63 MB. Se sirven tal cual desde `src/assets`.
9. **La paleta Tailwind es la de CLIRE:** `primary #00565c` (teal) y `brand #67ad3d`
   (verde), con un bloque explícito `clire: {...}`. Ningún color de Mi Pimpollito existe
   como token. Nota: `styles.scss` importa solo `@tailwind components` y `utilities`
   —sin `base`— para no pisar PrimeNG; **conviene mantener esa decisión**.
10. **Dependencias ajenas al dominio:** `leaflet`, `leaflet-draw`, `geoman`, `ol`, `shpjs`,
    `utm`, `cytoscape`(+popper), `d3`, `d3-org-chart`, `d3-flextree`, `ckeditor5`(+angular),
    `quill`, `socket.io-client`, `ngx-markdown`, `github-markdown-css`, `ng2-pdf-viewer`,
    `ionicons`, `tippy.js`, `ts-mixer`. Los presupuestos de bundle
    están en **4 MB warning / 5 MB error**, señal de cuánto arrastra el proyecto original.
11. **Bug heredado en rutas:** `admin/projects` declara `resource: RESOURCES.USERS` y
    `admin/theme` usa `GEOGRAPHIC_LAYER`. Irrelevante porque esas rutas se eliminan, pero
    ilustra la fragilidad del modelo de permisos por recurso.
12. **El login rediseñado aún vive en el mundo anterior.** `login.component.html/scss`
    están modificados con la identidad nueva, pero `login.component.ts` sigue llamando a
    `authService.login(username, password, context)` contra REST, valida
    `UsernameOrEmailValidator`, tiene popups de `AGENT_OFFICER`/`REPRESENTANT`, un flujo de
    "activar cuenta" y redirige con `location.href`. **El HTML y el SCSS se conservan tal
    como están; solo se reescribe el TS.**

### 3.4 Problemas heredados, por coste de arreglarlos tarde

| # | Problema | Por qué importa | Se resuelve en |
|---:|---|---|---|
| 1 | Guard de sesión sincrónico sobre JWT en `sessionStorage` | Portado a Firebase produce el bug de recarga en frío. Es el único que, si se arrastra, contamina todas las fases siguientes | Fase 1 |
| 2 | Permisos bitwise, multi-rol, por recurso | Sobredimensionado para dos roles y, sobre todo, no proyectable a Firestore Rules | Fase 2 |
| 3 | Acoplamiento a API REST (`authInterceptor`, `BaseHttpService`, `API_URL`, `websocket.service`) | No habrá API propia. Todo lo que dependa de `API_URL` deja de funcionar en silencio | Fase 0A / 2 |
| 4 | Paginación offset con `total` y salto de página | Firestore no la soporta. Si la UI se conserva sin adaptar, la salida "fácil" es descargar la colección — lo prohibido | Fase 2 |
| 5 | Ambientes por comentar/descomentar, `production` sin `fileReplacements`, `staging` fantasma | Riesgo directo de escribir en PROD creyendo estar en DEV | Fase 0B |
| 6 | Menú construido dentro de un `subscribe` de traducción | Con sesión asíncrona el sidebar aparece vacío; se repuebla con un contador `refresSideBar` | Fase 2 |
| 7 | `location.href` para navegar y `setInterval` para vigilar el token | Reinicia la app y el SDK en cada login/logout; el intervalo es redundante y puede provocar logouts espurios | Fase 1 |
| 8 | ~18 dependencias de dominio ajeno, presupuestos de 4–5 MB | Tiempo de build, superficie de vulnerabilidades y ruido permanente | Fase 0A |
| 9 | El menú se construía dentro de `translate.get('app').subscribe()` | Con la sesión asíncrona el sidebar aparece vacío. **La librería se conserva** (§4.5); lo que se elimina es ese patrón: las etiquetas son claves y las resuelve el pipe | Fase 0A |
| 10 | Assets de 10,8 MB y paleta teal/verde | Primera carga lenta y tokens que contradicen la marca | Fase 0A |
| 11 | `User` heredado: `id: number`, `username`, `roleUsers[]`, `entity`, clase con lógica | Incompatible con `uid: string` y rol único. Mezclar ambos modelos garantiza bugs | Fase 2 |
| 12 | NgModules por feature conviviendo con componentes standalone | No es un error, pero obliga a decidir en qué mundo vive cada componente nuevo | Fase 0A |

---

## 4. Arquitectura objetivo

Tres capas, sin backend intermedio para el negocio normal, y una superficie privilegiada
mínima y acotada.

```
NAVEGADOR   Angular 18 · standalone · PrimeNG 17 · Tailwind · SCSS
      │
      ├─ core/session   authState → users/{uid} → role/isActive   (única fuente)
      ├─ core/firebase  providers de @angular/fire
      ├─ features/*     auth · users · products · sales · giftcards · reports
      └─ layout/        topbar + sidebar + contenido   (heredado)
      │
      ▼ SDK cliente (lecturas, CRUD, subidas)      ▼ callable (privilegiado)
FIREBASE
  Authentication  Email/Password              Cloud Functions (functions/)
  Cloud Firestore  ← Security Rules             createUser · updateUserAuth
  Cloud Storage    ← Storage Rules              setUserActive · deleteUserAuth
  Hosting          SPA + CDN                    createSale · cancelSale
                                                attachVoucher
                                                issueGiftCard · cancelGiftCardIssue
                                                (Admin SDK · verifica el rol en servidor)
```

**Reparto de responsabilidades.** El cliente lee y escribe directo a Firestore en todo lo
que las Rules pueden validar por sí solas: lecturas filtradas por rol, CRUD de productos,
edición del propio documento de usuario. Pasan por Cloud Functions **solo** las
operaciones que el cliente no puede hacer sin abrir un agujero: cualquier cosa que toque
cuentas de Authentication, y cualquier cosa que mueva dinero o stock en varios documentos
a la vez.

### 4.1 SDK de Firebase en Angular

- **Recomendación:** `@angular/fire@^18` sobre `firebase@^10.7+`, con los `provide*` en
  `app.config.ts`.
- **Por qué:** el proyecto usa `provideZoneChangeDetection()`. Los callbacks del SDK crudo
  se ejecutan **fuera** de la zona de Angular: la UI no se actualiza y aparecen bugs
  intermitentes que se "arreglan" metiendo `NgZone.run()` a mano en cada suscripción.
  `@angular/fire` envuelve todo en wrappers zone-aware y entrega `authState()`,
  `docData()` y `collectionData()` ya como Observables: exactamente las piezas del
  pipeline de sesión de §6. La versión 18 acompaña a Angular 18.
- **Descartadas:** *SDK modular directo* — obliga a reimplementar los wrappers de zona y
  los adaptadores a Observable: más código propio, no menos. *Paquetes `compat`* — obsoletos.
- **Impacto futuro:** si el proyecto migrara a zoneless, `@angular/fire` deja de aportar el
  wrapping de zona pero sus adaptadores siguen siendo útiles. Sin camino de salida costoso.

### 4.2 Standalone components

- **Recomendación:** standalone en todo lo nuevo, con lazy loading por archivo de rutas:
  `loadChildren: () => import('./features/users/users.routes')`.
- **Por qué:** el proyecto ya está a medio camino (`AppComponent` es standalone,
  `app.config.ts` usa `ApplicationConfig`) y el ~70% de los features se elimina en Fase 0A:
  el coste de unificar es mínimo ahora y creciente después.
- **Descartada:** *mantener NgModules* — funciona, pero deja dos estilos conviviendo en un
  proyecto pequeño.

### 4.3 Estructura de carpetas propuesta

```
src/app/
  core/
    firebase/      firebase.providers.ts · firebase.tokens.ts
    session/       session.service.ts · session.model.ts · session.guards.ts
    services/      toast.service.ts (heredado) · image-compressor.service.ts
    models/        attachment.interface.ts (heredado, podado)
    utils/         money.util.ts · normalize.util.ts · date-keys.util.ts
    data/          base-firestore.service.ts · paged-query.ts
  shared/
    components/ui/ (heredado, podado)
    pipes/         money.pipe.ts (+ heredados)
    directives/    barcode-input.directive.ts        (Fase 4)
  layout/          (heredado: topbar · sidebar · menu · footer)
    menu/          menu.config.ts   ← menú declarativo por rol
  features/
    auth/          login · forgot-password
    users/         list · form · detail
    products/      list · form · labels               (Fase 3)
    sales/         pos · list · detail · receipt      (Fase 4)
    giftcards/     issue · lookup · list              (Fase 6)
    reports/       daily · range                      (Fase 7)
    home/
environments/      environment.ts (DEV) · environment.production.ts · environment.model.ts
functions/         src/index.ts · src/users.ts · src/sales.ts · src/giftcards.ts
firestore.rules · firestore.indexes.json · storage.rules
firebase.json · .firebaserc
```

### 4.4 Dependencias: qué se queda y qué se va

| Paquete | Destino | Motivo |
|---|---|---|
| `@angular/*`, `rxjs`, `zone.js`, `tslib` | **Reutilizar** | Base |
| `primeng`, `@angular/cdk`, `@angular/animations` | **Reutilizar** | PrimeNG 17.18 es compatible con Angular 18. PrimeNG 19 (tema Aura) es un cambio mayor: posponer |
| `tailwindcss`, `postcss`, `autoprefixer` | **Reutilizar** | Solo se repaletiza `tailwind.config.js` |
| `firebase` | **Adaptar** | Fijar a `^10.7+` (requisito de `@angular/fire` 18 y de las agregaciones `sum()`) |
| `dayjs` | **Reutilizar** | Con los plugins `utc` y `timezone` para `America/La_Paz` (§17) |
| `chart.js` | **Reutilizar** | Reportes, Fase 7. Ya está y PrimeNG lo usa |
| `@angular/fire` | **Crear** | Fase 0B |
| `pdfmake` | **Crear** | Fase 4 (comprobante) |
| `jsbarcode` | **Crear** | Fase 3 (etiquetas de código interno, §14) |
| `leaflet`, `leaflet-draw`, `@geoman-io/*`, `ol`, `shpjs`, `utm`, `@types/leaflet*`, `@types/shpjs` | **Eliminar** | GIS. También sus imports en `angular.json → styles` |
| `cytoscape`, `cytoscape-popper`, `d3`, `d3-org-chart`, `d3-flextree`, `@types/d3-org-chart` | **Eliminar** | Organigramas y grafos |
| `ckeditor5`, `@ckeditor/ckeditor5-angular`, `quill` | **Eliminar** | Dos editores de texto rico sin uso previsto |
| `socket.io-client` | **Eliminar** | No habrá servidor de sockets |
| `ngx-markdown`, `github-markdown-css`, `ng2-pdf-viewer`, `tippy.js`, `ionicons`, `ts-mixer`, `@popperjs/core`, `@types/popper.js`, `uuid` | **Eliminar** | Sin uso en el dominio. `uuid` se sustituye por los IDs de Firestore |
| `lodash`, `@types/lodash` | **Eliminar** | Su único uso relevante es `camelCase` en `PermissionsGuard`, que desaparece |
| `@ngx-translate/core`, `@ngx-translate/http-loader` | **Eliminar** | Ver §4.5 |
| `ngxtension` | **Adaptar** | Revisar si algo del código conservado lo usa; si no, eliminar |

### 4.5 Internacionalización: se CONSERVA ngx-translate como catálogo de textos

> **Decisión del cliente (2026-09-12), posterior a la Fase 0A. Invierte la recomendación
> anterior de este documento, que era retirar la librería.**
>
> **Mi Pimpollito conserva `ngx-translate` con `es.json` como catálogo central de textos,
> aunque inicialmente solo exista idioma español.**

- **Decisión vigente:** se mantiene `@ngx-translate/core@15` + `@ngx-translate/http-loader@8`
  y `src/assets/i18n/es.json`.
- **Por qué:** el objetivo **no** es tener varios idiomas — es que no queden strings
  sueltos repartidos por los componentes. Un catálogo único hace que cambiar un texto sea
  editar un JSON, y que los textos sean revisables de un vistazo.
- **Alcance:** **solo español**. Idioma predeterminado `es`, sin selector de idiomas, sin
  detección del idioma del navegador, sin segundo archivo de traducción.
- **Patrón, compatible con la arquitectura standalone:**
  `@ngx-translate/core@15` **no** expone `provideTranslateService`, así que la
  infraestructura vive en `core/config/translate.config.ts` y se inyecta con
  `provideTranslation()` en `app.config.ts`:

  ```ts
  importProvidersFrom(
      TranslateModule.forRoot({
          defaultLanguage: 'es',
          loader: { provide: TranslateLoader,
                    useFactory: translateHttpLoaderFactory, deps: [HttpClient] },
      }),
  )
  ```

  `defaultLanguage` dispara la carga de `es.json` por sí solo: **no hace falta ningún
  `translate.use()` en el arranque**. Cada componente standalone importa `TranslateModule`
  para disponer del pipe.

- **REGLA que sí se conserva del análisis original.** Los textos se consumen con el **pipe**
  `| translate` en las plantillas. **Prohibido construir modelos dentro de
  `translate.get(...).subscribe(...)`**: ése es exactamente el patrón heredado de SAHTOSO que
  dejaba el sidebar vacío en el arranque (§3.3, hallazgo 6). Por eso el menú guarda **claves**
  (`label: 'app.menu.home'`) y la plantilla de `menu-item` las resuelve con el pipe.
- **La traducción de PrimeNG sigue siendo estática** (`core/config/primeng-es.config.ts`).
  Los nombres de meses y los botones de un calendario son configuración de librería, no
  textos de la aplicación, y resolverlos de forma asíncrona provoca un parpadeo de texto sin
  traducir en el arranque. El bloque `app.ng` del catálogo heredado se descartó.
- **Descartada:** *`@angular/localize`* — un build por locale, más ceremonia para un beneficio
  nulo con un solo idioma.
- **Impacto futuro:** si algún día hiciera falta quechua o inglés, se añade `qu.json` o
  `en.json` y un selector. El trabajo ya está hecho.

#### El catálogo se podó

El `es.json` restaurado era el catálogo íntegro de SAHTOSO (24,8 KB). Se eliminaron los
bloques de dominio ajeno —`models`, `roles`, `audit`, `project`, `community`, `entity`,
`dashboard`, `image`, `ng`— y las claves de `common` propias de los flujos de aprobación,
agentes, comunidades y GIS. `app.menu` y `app.users` se reescribieron con el menú y los
campos de `AppUser` de este proyecto (§8.2). Resultado: **5,6 KB**, con
`common`, `menu`, `users` y `profile`.

### 4.6 Capa de acceso a datos

- **Recomendación:** un `BaseFirestoreService<T>` delgado con conversores tipados, más un
  helper `pagedQuery()` independiente. Un servicio por colección que lo extiende.
- **Por qué:** concentra en un solo lugar tres cosas que de otro modo se desincronizan: el
  `withConverter` que hidrata el `id` y convierte `Timestamp ↔ Date`, el sellado de
  `createdAt/updatedAt` con `serverTimestamp()`, y la normalización de campos de búsqueda
  (§12). Es una clase corta, no un framework.
- **Descartadas:** *reutilizar `BaseHttpService`* — su firma entera (`id: number`,
  `meta.total`, `findByUuid`, `validateFieldUniqueness` por HEAD) es la de una API REST;
  adaptarlo sería reescribirlo. *Llamar al SDK suelto en cada componente* — garantiza que
  el día que cambie el converter haya que tocar veinte archivos.

### 4.7 Identidad visual y tokens

La paleta de `tailwind.config.js` se reemplaza por la de la marca **conservando la misma
forma de tokens** (`DEFAULT/hover/soft/dark`) para que las clases de los componentes
heredados sigan resolviendo. El bloque `clire: {...}` se elimina y los alias `forest-*`,
`brand-blue`, `primary-clear` se retiran cuando ya no queden referencias.

```
primary   rojo de marca      botones, acentos, estado activo del sidebar
carbon    negro/carbón       texto, topbar, sidebar
gold      dorado             detalles, bordes de tarjetas destacadas
cream     crema              fondo de aplicación
giraffe   amarillo/naranja   advertencias suaves, badges, ilustración
+ danger / warning / success / info   (se conservan los heredados)
```

**Assets, en Fase 0A:** los PNG de fondo a WebP con ancho máximo 1920 px (de ~2 MB a
~150–250 KB); el logo a un WebP de ~40 KB más un PNG pequeño en base64 para el PDF de la
Fase 4; y se eliminan las variantes no usadas (`background3/4`, `logo2/3`) — el cliente
confirmó que **`logo.png` es el logo final**. Es la mejora de rendimiento más grande del
proyecto por el menor esfuerzo.

---

## 5. Ambientes DEV y PROD

**Requisito explícito:** no se repite el patrón de MEDIDENT de comentar y descomentar
configuración. `ng serve` va siempre a DEV; `ng build --configuration production` va
siempre a PROD; y hay **una sola fuente de configuración por ambiente**.

### 5.1 Una interfaz obliga a que el ambiente esté completo

- **Recomendación:** dos proyectos Firebase completamente separados; `environment.ts` es
  **DEV** (la base, lo que usa `ng serve`); `environment.production.ts` es PROD;
  `fileReplacements` **solo** en la configuración `production`; y una interfaz
  `AppEnvironment` que **ambos archivos deben satisfacer**.
- **Por qué:** el tipo es lo que hace imposible el error. Hoy `environment.prod.ts` tiene
  `API_URL` comentado y compila igual, porque no hay contrato. Con la interfaz, comentar
  un campo **rompe la compilación**: el patrón de MEDIDENT deja de ser posible, no por
  disciplina sino por el compilador.
- **Descartadas:** *un solo `environment.ts` con `if (production)`* — mete las credenciales
  de PROD en el bundle de DEV y al revés. *Variables de entorno en build time* — Angular no
  las expone al cliente sin un paso extra de generación de archivo, que es más piezas para
  el mismo resultado.

```ts
// src/environments/environment.model.ts
export interface AppEnvironment {
  name: 'dev' | 'prod';        // qué configuración de Angular generó este archivo
  production: boolean;         // alias estándar de Angular, equivalente a name === 'prod'
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  useEmulators: boolean;
}

// Único proyecto Firebase real hoy. Sirve para derivar, a partir de
// environment.firebase.projectId, si el build actual sigue hablando con DEV
// — es la base del badge de ambiente (§5.3), independiente de `name`/`production`.
export const FIREBASE_DEV_PROJECT_ID = 'mi-pimpollito-dev';
```

```ts
// src/environments/environment.ts          ← DEV · lo que usa `ng serve`
import { AppEnvironment } from './environment.model';
export const environment: AppEnvironment = {
  name: 'dev',
  production: false,
  firebase: { /* credenciales del proyecto mi-pimpollito-dev */ },
  useEmulators: false,
};
```

```ts
// src/environments/environment.production.ts   ← PROD · lo que usa `ng build`
import { AppEnvironment } from './environment.model';
export const environment: AppEnvironment = {
  name: 'prod',
  production: true,
  // TEMPORAL (§5.5): mismo proyecto que DEV, hasta que exista mi-pimpollito.
  firebase: { /* credenciales del proyecto mi-pimpollito-dev */ },
  useEmulators: false,
};
```

> **`environment.production.ts` existe y `ng build` (producción) compila.** Su bloque
> `firebase` es, de forma **temporal y deliberada**, el mismo que el de DEV — ver §5.5 para
> el porqué y para la lista exacta de lo que cambia cuando `mi-pimpollito` pueda crearse.
> Sustituir solo ese bloque, cuando llegue el momento, es la única tarea: `AppEnvironment`,
> el `fileReplacements` y `provideFirebase()` no se tocan.

Las claves `firebase.*` del cliente web **no son secretos**: son identificadores públicos
del proyecto. Lo que protege los datos son las Security Rules y App Check, no ocultar el
`apiKey`. Por eso pueden vivir en el repositorio sin riesgo. Lo que **nunca** entra al
repositorio es un service account JSON.

### 5.2 Cambios en `angular.json` (Fase 0B)

| Qué | Estado actual | Estado objetivo |
|---|---|---|
| Nombre del proyecto | `sahtoso-frontend` | `pimpollo-frontend` |
| `outputPath` | `dist/sahtoso-frontend` | `dist/pimpollo-frontend` |
| `defaultConfiguration` de `build` | `production` | `production` (se mantiene) |
| `fileReplacements` en `production` | **no existe** | `environment.ts` → `environment.production.ts` · *se declara cuando exista PROD (§5.5)* |
| Configuración `production-sahtoso` | existe | **eliminar** |
| Configuración `development` | reemplaza a `environment.development.ts` | **eliminar el reemplazo**: DEV es ya el archivo base |
| `serve.staging` | apunta a un `build:staging` inexistente | **eliminar** |
| `styles` | incluye leaflet, leaflet-draw, geoman, ol, github-markdown | solo PrimeNG, layout y `styles.scss` |
| Presupuestos | 4 MB warning / 5 MB error | 1 MB warning / 2 MB error tras la limpieza |

Scripts de `package.json` objetivo:

```json
"start": "ng serve --host 0.0.0.0",
"build": "ng build",
"build:dev": "ng build --configuration development",
"deploy:dev": "ng build --configuration development && firebase deploy --only hosting -P dev",
"deploy:prod": "ng build && firebase deploy --only hosting -P prod"
```

`build` y `deploy:prod` quedan declarados pero **no son ejecutables** hasta que exista
`mi-pimpollito` (§5.5): faltan el archivo de entorno y el alias `prod`. Durante todo el
desarrollo se usan `start`, `build:dev` y `deploy:dev`.

### 5.3 Un badge de ambiente en la interfaz

En el topbar, cuando `environment.name !== 'prod'`, se muestra un badge **DEV** visible y
de color distinto. Es tres líneas de código y elimina la clase entera de errores de
"estaba tocando la base equivocada". En PROD no se renderiza nada.

### 5.4 DEV — configuración real, ya creada y aprobada

**Este es el estado de hecho, no una intención.** El proyecto se creó manualmente por
consola y estos son sus valores definitivos. Cualquier discrepancia entre el código y esta
tabla es un error del código.

| Concepto | Valor |
|---|---|
| Project ID | **`mi-pimpollito-dev`** |
| Web App | **Mi Pimpollito Web DEV** |
| Hosting | `https://mi-pimpollito-dev.web.app` |

**Authentication**

| Proveedor / ajuste | Estado |
|---|---|
| Email/Password | **Habilitado** |
| Google Sign-In | **Deshabilitado** |
| Email link (passwordless) | **Deshabilitado** |
| MFA | **Deshabilitado por ahora** |

Solo Email/Password, que es lo que el modelo de usuarios necesita (§7): las cuentas las crea
un admin, no el propio usuario. Google Sign-In queda deshabilitado deliberadamente — con él
activo, cualquiera con una cuenta de Google podría crear una sesión de Authentication; no
accedería a nada por falta de documento en `users` (§7.1), pero ensuciaría el proyecto y
rompería la premisa de que solo existen las cuentas que el admin dio de alta.

**Cloud Firestore**

| Concepto | Valor |
|---|---|
| Edition | **Standard** |
| Database ID | **`(default)`** |
| Location | **`southamerica-west1`** (Santiago de Chile) |
| Security initialization | **Production mode** (reglas cerradas desde el minuto cero) |

**Cloud Storage**

| Concepto | Valor |
|---|---|
| Default bucket | **`mi-pimpollito-dev.firebasestorage.app`** |
| Location | **`US-CENTRAL1`** |
| Storage class | **Standard** |
| Security initialization | **Production mode** |

La elección de `US-CENTRAL1` para Storage **es intencional**: es la región que da acceso a
la cuota gratuita correspondiente de Cloud Storage. Consecuencia que conviene tener escrita:
el bucket queda en otra región que Firestore, así que las imágenes de producto viajan desde
Estados Unidos. Con imágenes comprimidas a 120–200 KB (§9.2) y servidas por CDN eso no se
nota en el mostrador, y el ahorro es real; pero es el motivo por el que la **compresión en el
cliente no es negociable**. La ubicación de un bucket es **inmutable**: cambiarla exigiría
crear otro bucket y mover los archivos.

**Billing**

| Concepto | Valor |
|---|---|
| Plan | **Blaze** |
| Budget alert | **USD 5** |

> **El presupuesto es una alerta, no un límite duro.** Google **no corta el servicio** al
> alcanzarlo: solo envía un correo. Si algo consumiera de forma descontrolada, el gasto
> sigue. La alerta es para enterarse a tiempo, y la defensa real son las reglas de
> disciplina de §19.3 (nunca `getDocs()` sin `limit()`, sin listeners innecesarios).

**Firebase CLI**

| Concepto | Valor |
|---|---|
| `firebase-tools` | instalado, versión **15.3.0** |
| `firebase login` | realizado correctamente (por navegador, por el desarrollador) |
| `firebase projects:list` | reconoce `mi-pimpollito-dev` |

> **Blaze y el orden de las fases.** Cloud Functions requiere Blaze, y Functions aparece en
> la Fase 2 (`createUser`). Storage lo necesita la Fase 3. La Fase 1 completa (login,
> sesión, guards, recuperación de contraseña, primer admin sembrado a mano) **no necesita
> Functions**. Con Blaze ya activo en DEV, nada de esto bloquea ninguna fase.

### 5.5 PROD — todavía no existe; `production` apunta a DEV de forma temporal

**`mi-pimpollito` no existe todavía: Google no deja crear el proyecto hasta dentro de
~30 días** (límite de proyectos de la cuenta). Esta cifra la dio el cliente el
2026-09-12 y es la que gobierna cuándo se revisa esta sección, no una estimación nuestra.

> **Decisión del 2026-09-12 — reemplaza la regla anterior de esta sección.** La versión
> previa de este documento bloqueaba por completo el build de producción hasta que
> `mi-pimpollito` existiera. Un mes de espera cambia el cálculo: se decidió que **el build
> de producción de Angular hable, de forma temporal y explícita, con el mismo Firebase que
> DEV**, en vez de dejar `ng build` roto un mes entero. La regla que sí se mantiene sin
> excepción es la de fondo — nunca fingir un PROD que no existe —, así que la solución no es
> inventar credenciales, sino que **ambos environments sean honestos**: los dos declaran
> `mi-pimpollito-dev` como su Firebase real, y el código lo sabe.

**Cómo queda, mientras dura lo temporal:**

| Build de Angular | Firebase real |
|---|---|
| `development` (`ng serve`, `ng build --configuration development`) | `mi-pimpollito-dev` |
| `production` (`ng build`, `ng build --configuration production`) | `mi-pimpollito-dev` **(temporal)** |

1. **`environment.production.ts` existe**, implementa `AppEnvironment` y `ng build` (que usa
   `production` por defecto) **compila y funciona** — ya no está bloqueado.
2. **Su bloque `firebase` es una copia exacta del de `environment.ts`**, con un aviso en
   mayúsculas dentro del propio archivo. No es un descuido: es la única forma de no mentir
   sobre qué backend se está usando de verdad.
3. **`.firebaserc` sigue con solo el alias `dev`** — sigue existiendo un único proyecto
   Firebase real, así que un segundo alias sería un alias a nada:

   ```json
   { "projects": { "dev": "mi-pimpollito-dev", "default": "mi-pimpollito-dev" } }
   ```

4. **El badge de ambiente deja de basarse en `name`/`production`.** Esos campos ahora
   describen honestamente la configuración de *Angular* (`'prod'`/`true` en un build de
   producción), y ya no sirven para inferir el Firebase real. El badge compara
   `environment.firebase.projectId` contra `FIREBASE_DEV_PROJECT_ID` (§5.1): por diseño,
   **se sigue viendo en el build de producción** mientras el proyecto real siga siendo DEV, y
   desaparece solo, sin tocar el componente, el día que `environment.production.ts` tenga el
   `projectId` de `mi-pimpollito`.
5. **DEV sigue sin mezclarse con datos de un PROD real** — porque no hay un PROD real
   todavía. La regla "nunca escribir datos de producción en DEV" se retoma en cuanto exista
   el proyecto de verdad; hasta entonces solo hay un backend, y todo lo que corre contra él
   —sea build de desarrollo o de producción— es, por definición, DEV.
6. **Qué hay que hacer cuando `mi-pimpollito` pueda crearse** — se configura y se despliega
   por separado, repitiendo la §5.4 con estos valores, y **solo entonces** deja de ser
   temporal el paso 2:

   | Concepto | Valor para PROD |
   |---|---|
   | Project ID | `mi-pimpollito` (verificar disponibilidad; si estuviera tomado, elegir otro y **actualizar este documento**) |
   | Firestore Location | **`southamerica-west1`** — la misma que DEV, para que el comportamiento y la latencia sean comparables |
   | Firestore Edition / Database ID | Standard / `(default)` |
   | Storage Location | **`US-CENTRAL1`** — el mismo criterio de cuota gratuita que DEV |
   | Authentication | solo Email/Password; Google, passwordless y MFA deshabilitados |
   | Security initialization | Production mode en Firestore y en Storage |
   | Billing | Blaze + alerta de USD 5 |
   | Además | reemplazar el bloque `firebase` de `environment.production.ts` con los datos reales, añadir el alias `prod` a `.firebaserc`, autorizar el dominio en Authentication, desplegar Rules e índices, y sembrar el primer admin (§7.1) |

7. **Cómo acelerar el límite de proyectos**, si conviene antes de los ~30 días: eliminar
   definitivamente algún proyecto de Firebase/Google Cloud en desuso (un proyecto borrado
   sigue contando durante su periodo de retención de ~30 días, así que no acorta el plazo de
   inmediato), o solicitar aumento de cuota desde la consola de Google Cloud. Es gestión de
   cuenta del desarrollador, no una tarea de código.

> **Esto no bloquea el desarrollo.** Las Fases 1 en adelante se construyen y se prueban
> contra DEV exactamente igual que antes. Lo único que cambió es que **el build de
> producción ya no está roto** mientras se espera a `mi-pimpollito` — antes esa espera
> impedía generar el bundle de producción; ahora lo genera, contra el backend correcto que
> existe hoy, con la advertencia explícita de que es temporal.

---

## 6. Autenticación y sesión

> Esta es la sección más importante del documento. El bug que hay que evitar —el guard
> leyendo `currentUser === null` en una recarga en frío, que en MEDIDENT se parcheó con
> temporizadores— **no se arregla aquí: se hace imposible por construcción**.

### 6.1 El problema, con precisión

Firebase Auth restaura la sesión desde IndexedDB de forma **asíncrona**. Durante los
primeros milisegundos después de una recarga, `auth.currentUser` es `null` aunque el
usuario esté perfectamente autenticado. Un guard sincrónico que lea ese valor responde
`false` y redirige al login. Y como el estado llega poco después, la aplicación queda en
un estado incoherente: sesión válida, pantalla de login.

La causa real no es el tiempo: es que **el guard responde antes de saber**. La solución no
es esperar más, es **no responder hasta saber**.

### 6.2 La cadena única de autorización

Una sola fuente de verdad, expresada como un Observable. Nada más en la aplicación
consulta `auth.currentUser` directamente.

```
authState(auth)                 ¿hay una cuenta de Authentication?
      │ switchMap
      ▼
docData(users/{uid})            ¿existe su perfil en Firestore?
      │ map
      ▼
{ status, uid, email, profile } ¿isActive? ¿qué role?
      │ shareReplay(1)
      ▼
SessionService.session$ / session()   ← lo único que consume la app
```

```ts
// core/session/session.model.ts
export type SessionStatus = 'loading' | 'anonymous' | 'active' | 'rejected';
export type RejectReason  = 'no-profile' | 'inactive';

export type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'rejected'; uid: string; reason: RejectReason }
  | { status: 'active';   uid: string; email: string;
      role: RoleUser; firstName: string; lastName: string; profile: AppUser };
```

```ts
// core/session/session.service.ts  (esquema)
readonly session$: Observable<Session> = authState(this.auth).pipe(
  switchMap(fbUser => {
    if (!fbUser) return of(ANONYMOUS);
    return docData(doc(this.db, 'users', fbUser.uid), { idField: 'uid' }).pipe(
      map(profile => this.resolve(fbUser, profile as AppUser | undefined)),
      catchError(() => of(rejected(fbUser.uid, 'no-profile'))),
    );
  }),
  startWith(LOADING),
  distinctUntilChanged(sameSession),
  shareReplay({ bufferSize: 1, refCount: false }),
);

readonly session = toSignal(this.session$, { initialValue: LOADING });
readonly isAdmin = computed(() => this.session().role === 'admin');
readonly isStaff = computed(() => this.session().status === 'active');

/** Emite solo cuando el estado ya es conocido. Es lo que consumen los guards. */
readonly ready$ = this.session$.pipe(filter(s => s.status !== 'loading'));
```

Cuatro detalles que hacen que esto funcione y que **no son opcionales**:

| Pieza | Para qué |
|---|---|
| `shareReplay({ bufferSize: 1, refCount: false })` | Una sola suscripción a Firestore para toda la app. Con `refCount: true` la cadena se reiniciaría cada vez que el último suscriptor se va, provocando lecturas repetidas en cada navegación |
| `startWith(LOADING)` | Hace explícito el estado "todavía no sé", que es justo el que el código heredado no tenía |
| `docData` (no `getDoc`) | Si un admin desactiva a un usuario conectado, la cadena reacciona y el usuario cae **en caliente**, sin esperar a que recargue |
| `distinctUntilChanged` | Evita reevaluar guards y repintar el menú ante escrituras del documento que no cambian sesión (p. ej. `updatedAt`) |

### 6.3 Los guards devuelven un Observable

Un `CanActivateFn` puede devolver `Observable<boolean | UrlTree>` y **el router de Angular
espera a la primera emisión**. Eso es todo lo que hace falta: el guard no adivina, espera
lo justo, y la carrera desaparece.

```ts
// core/session/session.guards.ts
export const authGuard: CanActivateFn = () => {
  const s = inject(SessionService), r = inject(Router);
  return s.ready$.pipe(take(1), map(sess => {
    if (sess.status === 'active')   return true;
    if (sess.status === 'rejected') return r.createUrlTree(['/auth/login'],
                                      { queryParams: { denied: sess.reason } });
    return r.createUrlTree(['/auth/login']);
  }));
};

export const roleGuard = (roles: RoleUser[]): CanActivateFn => () => {
  const s = inject(SessionService), r = inject(Router);
  return s.ready$.pipe(take(1), map(sess =>
    sess.status === 'active' && roles.includes(sess.role)
      ? true
      : r.createUrlTree(['/'])));
};

export const guestGuard: CanActivateFn = () => { /* al revés: bloquea /auth si hay sesión */ };
```

**Prohibido, y por qué:**

| Patrón | Por qué no |
|---|---|
| `setTimeout` / `setInterval` esperando la sesión | Elige un número al azar y falla en la máquina que sea más lenta ese día |
| Polling de `auth.currentUser` | Lo mismo, con más CPU |
| `APP_INITIALIZER` que bloquea el arranque | Retrasa **todo** el bootstrap, incluida la pantalla de login, para resolver algo que solo necesitan las rutas protegidas |
| Suscripciones anidadas (`subscribe` dentro de `subscribe`) | Fugas y orden de emisión impredecible. `switchMap` es la herramienta |
| Leer `auth.currentUser` en un componente | Reintroduce la carrera en un sitio nuevo |

### 6.4 Pantalla de arranque

Mientras `status === 'loading'`, `AppComponent` muestra un splash con el logo. Es el mismo
spinner heredado, condicionado al estado de sesión en lugar a los eventos del router. Sin
esto el usuario ve un parpadeo del login en cada recarga, que es la versión visible del
mismo problema.

### 6.5 Flujo de login y casos de rechazo

```
Formulario (email + password)          ← login.component.html/scss YA REDISEÑADO: no se toca
      │  signInWithEmailAndPassword
      ▼
La cadena de sesión resuelve sola
      ├─ active    → router.navigate(['/'])            (nunca location.href)
      ├─ rejected  → 'no-profile' → "Tu cuenta no está habilitada. Contacta al administrador."
      │              'inactive'   → "Tu cuenta está desactivada."  + signOut()
      └─ error de Auth → mensaje por código
```

| Código de Firebase | Mensaje en pantalla |
|---|---|
| `auth/invalid-credential`, `auth/wrong-password`, `auth/user-not-found` | "Correo o contraseña incorrectos." — **deliberadamente el mismo** para los tres: distinguirlos revela qué correos existen |
| `auth/too-many-requests` | "Demasiados intentos. Espera unos minutos." |
| `auth/network-request-failed` | "Sin conexión. Verifica tu internet." |
| `auth/user-disabled` | "Tu cuenta está desactivada." |

Lo que se elimina del login heredado: `UsernameOrEmailValidator` (Firebase autentica por
correo; un `username` sería un segundo identificador que hay que mantener único sin
ninguna ventaja), el parámetro `context`, los popups de `AGENT_OFFICER`/`REPRESENTANT`, el
flujo de "activar cuenta", los `location.href` y el `startTokenCheck()` con `setInterval`.

### 6.6 Doble puerta: `isActive` en cliente y en servidor

`isActive === false` se comprueba en **tres** lugares independientes, y hacen falta los tres:

1. **La cadena de sesión** → `status: 'rejected'`: la app no deja pasar y cierra la sesión.
2. **Firestore Rules** → `isActive()` en cada regla: aunque alguien conserve el token y
   use la consola del navegador, no lee ni escribe nada.
3. **Cloud Functions** → `assertActive()` al principio de cada callable.

Esconder el menú no es seguridad; el guard tampoco. **La Rule sí.**

### 6.7 Recuperación de contraseña

- **Recomendación:** `sendPasswordResetEmail()` de Firebase, con la plantilla de correo
  personalizada en la consola (remitente, asunto y cuerpo con la identidad de la tienda).
  **Sin** Cloud Function propia.
- **Por qué:** Firebase ya emite el correo, genera un token de un solo uso con caducidad,
  aloja la pantalla de cambio y lo hace con protección contra enumeración de correos
  activada por defecto (responde igual exista o no la cuenta). Reimplementarlo significaría
  gestionar tokens, caducidades y un proveedor de correo — superficie de seguridad nueva
  para replicar algo que ya está resuelto.
- **Descartada:** *pantalla propia de reset con token propio*. Se reconsideraría solo si el
  cliente exigiera un correo con diseño completo de marca; en ese caso la vía es una
  Function con `generatePasswordResetLink()` del Admin SDK y un proveedor de correo, y es
  trabajo para después de producción.
- **En la interfaz:** el formulario siempre responde *"Si el correo está registrado,
  recibirás un mensaje con las instrucciones"*, exista o no. Es el mismo criterio que el
  mensaje único de credenciales inválidas.
- **Pendiente operativo:** si se conecta un dominio propio (A8: no hay por ahora), conviene
  hacerlo **antes** de personalizar las plantillas, porque el dominio del remitente depende
  de ello.

---

## 7. Usuarios, roles y Cloud Functions

### 7.1 El primer administrador

No hay registro público, así que el primer admin no puede crearse desde la aplicación.
**Procedimiento manual, idéntico en DEV y en PROD** (Fase 1):

1. Firebase Console → Authentication → **Add user**: `lenar.toledo@gmail.com` + una
   contraseña temporal. Copiar el **UID** que genera.
2. Firestore → colección `users` → documento con **ID = ese UID exacto**, y los campos:

   ```
   firstName: "Lenar Mario"      lastName: "Lima Toledo"
   ci: "<CI>"                    email: "lenar.toledo@gmail.com"
   role: "admin"                 isActive: true
   searchName: "lima toledo lenar mario"
   emailLower: "lenar.toledo@gmail.com"
   createdAt / updatedAt: <timestamp actual>
   ```

3. Entrar en la aplicación y cambiar la contraseña desde el perfil.

Dos detalles que lo hacen seguro: las Rules **no permiten `create` en `users` por ningún
cliente** (solo el Admin SDK, que las ignora), así que este documento solo puede nacer en
la consola o en una Function; y un usuario sin documento en `users` queda en
`rejected: 'no-profile'`, así que una cuenta de Auth suelta no da acceso a nada.

> El campo `uid` **no se almacena**: se hidrata al leer con
> `docData(ref, { idField: 'uid' })`. El código sigue viendo `user.uid` y se elimina la
> posibilidad de que el campo y el ID del documento discrepen. Un dato duplicado es un dato
> que algún día se contradice.

### 7.2 Creación segura de usuarios: las tres alternativas

| Criterio | A · Instancia secundaria en el cliente | B · **Cloud Function + Admin SDK** | C · Invitación por correo |
|---|---|---|---|
| Mantiene la sesión del admin | Sí (`initializeApp` con otro nombre) | **Sí** | Sí |
| Verifica el rol en **servidor** | **No** | **Sí** | Parcial |
| Puede cambiar el correo de otro usuario | **No** | **Sí** | No |
| Puede deshabilitar la cuenta en Auth | **No** | **Sí** | No |
| Puede escribir custom claims | **No** | **Sí** | No |
| Evita cuentas huérfanas (Auth sin perfil) | No | **Sí** (compensación) | No |
| Requiere Blaze | No | **Sí** | No |

- **Recomendación: B.** Cloud Functions callables con Admin SDK.
- **Por qué:** A resuelve *solo* el síntoma de que crear un usuario te desloguee. No puede
  verificar en servidor que quien llama es admin (cualquiera con la consola del navegador
  invoca `createUserWithEmailAndPassword`), no puede editar el correo de otro usuario, no
  puede deshabilitar su cuenta y no puede escribir claims. Y en cuanto se deshabilite la
  auto-creación de cuentas en la consola (§19.4), A directamente **deja de funcionar**. La prioridad declarada es
  **seguridad por encima de ahorrar líneas de código**, y esto es exactamente ese caso.
- **Descartada C:** el correo de invitación deja al invitado eligiendo su contraseña, lo
  cual está bien, pero no cubre ninguna de las otras tres operaciones privilegiadas.

### 7.3 Contrato de las Functions

Todas son **callables 2ª generación**, en la misma región que Firestore
(**`southamerica-west1`**, §5.4), y todas empiezan por la misma comprobación. Que la Function
y la base estén en la misma región importa: `createSale` hace varias lecturas y escrituras
dentro de una transacción, y cada salto entre regiones se paga tantas veces como operaciones
tenga la transacción.

```ts
// functions/src/guards.ts
async function assertActive(auth?: CallableRequest['auth']) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sesión requerida');
  const snap = await db.doc(`users/${auth.uid}`).get();
  if (!snap.exists)               throw new HttpsError('permission-denied', 'Sin perfil');
  if (snap.get('isActive') !== true) throw new HttpsError('permission-denied', 'Cuenta desactivada');
  return snap;                    // devuelve el perfil para no releerlo
}
async function assertAdmin(auth?: CallableRequest['auth']) {
  const snap = await assertActive(auth);
  if (snap.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Solo administradores');
  return snap;
}
async function assertStaff(auth?: CallableRequest['auth']) { return assertActive(auth); }
```

El rol se lee **del documento de Firestore**, no del custom claim, porque el documento es
la verdad inmediata: si un admin degrada a alguien, el claim puede tardar hasta una hora
en propagarse al token, y una operación privilegiada no puede depender de eso.

| Function | Quién | Qué hace |
|---|---|---|
| `createUser` | admin | Crea la cuenta en Auth y el documento `users/{uid}`; con compensación |
| `updateUserAuth` | admin | Cambia el correo en Auth **y** el espejo en Firestore, en ese orden |
| `setUserActive` | admin | `isActive` en Firestore **y** `disabled` en Auth |
| `deleteUserAuth` | admin | Reservado. Por defecto **no se usa**: el borrado es lógico (§21) |
| `createSale` | staff | Registra la venta, descuenta stock, redime gift card si aplica. §15, §16 |
| `cancelSale` | admin | Anula una venta, devuelve stock; revierte la gift card SOLO si el ciclo sigue intacto (§16.7) |
| `attachVoucher` | staff | Adjunta el comprobante de un pago QR. §2.1 C-4 |
| `registerGiftCard` | admin | Registra una tarjeta física nueva, individual. §16 |
| `registerGiftCardBatch` | admin | Registra un lote bajo una denominación, atómico. §16 |
| `activateGiftCard` | staff | Vende/activa una tarjeta AVAILABLE: abre un ciclo nuevo. §16 |
| `suspendGiftCard` | staff | Pérdida/robo: ACTIVE → SUSPENDED, mismo ciclo. §16 |
| `reactivateGiftCard` | staff | La tarjeta apareció: SUSPENDED → ACTIVE, mismo ciclo. §16 |
| `cancelGiftCard` | admin | Baja definitiva de la tarjeta física. Terminal. §16 |

### 7.4 `createUser`: el orden importa

```
1. assertAdmin()
2. Validar forma: correo válido, rol ∈ {admin,user}, nombres no vacíos, contraseña ≥ 8
3. auth.createUser({ email, password, displayName })      → uid
4. try  db.doc(`users/${uid}`).create({ …, isActive: true, searchName, emailLower,
                                        createdAt: serverTimestamp() })
   catch  auth.deleteUser(uid)   ← COMPENSACIÓN, y se relanza el error
5. auth.setCustomUserClaims(uid, { role })                 (§7.6)
6. Devolver { uid }
```

El paso 4 es el que evita el estado sucio que un CRUD ingenuo produce a la primera:
**una cuenta de Authentication sin documento en `users`**. Ese usuario podría iniciar
sesión, quedaría en `rejected: 'no-profile'` —no accedería a nada, la seguridad se
mantiene— pero su correo estaría ocupado y nadie sabría por qué. El borrado compensatorio
deja el sistema como estaba.

El orden inverso (documento primero, cuenta después) es peor: un documento en `users` sin
cuenta de Auth es invisible en la consola de Authentication y aparece en el listado de
usuarios como alguien que existe y no puede entrar.

### 7.5 Edición del correo: dos sistemas, una sola verdad

El correo vive en **dos** lugares: la cuenta de Authentication (es la credencial) y el
campo `email` de `users/{uid}` (para mostrarlo y buscarlo). La regla es que
**Authentication manda**, y el documento es un espejo que **el cliente no puede escribir
por ninguna vía** (§10). `updateUserAuth` cambia primero Auth —si falla, nada cambió— y
después el espejo.

### 7.6 Custom claims: para qué sirven realmente aquí

- **Recomendación:** escribir `{ role }` como custom claim, **además** del documento, y
  usar el claim **solo** en las Storage Rules.
- **Por qué:** las **Storage Rules no pueden consultar Firestore**. No existe `get()` en
  ellas. Sin el claim, la única forma de saber si quien sube una imagen de producto es
  staff sería permitir la subida a cualquier autenticado, que es precisamente lo que hay
  que evitar. En Firestore Rules y en las Functions se sigue leyendo el documento, porque
  ahí sí se puede y el dato está fresco.
- **Coste de aceptar:** un claim se propaga al token del cliente en el siguiente refresco
  (hasta ~1 h) o al forzar `getIdToken(true)`. Por eso **no** se usa para decisiones
  sensibles de Firestore.
- **Descartada:** *solo claims, sin documento* — un desfase de una hora en el rol es
  inaceptable para autorización de datos. *Solo documento, sin claims* — deja las Storage
  Rules sin forma de conocer el rol.

---

## 8. Modelo de datos Firestore

### 8.1 Colecciones

| Colección | ID del documento | Quién escribe | Crecimiento | Fase |
|---|---|---|---|---|
| `users` | **UID de Auth** | Function (crear/email/estado) · el propio usuario y el admin vía Rules (resto) | < 20 docs | 1–2 |
| `settings` | `app` (documento único) | admin vía Rules | 1 doc | 2 |
| `counters` | `internalCode` | staff vía Rules (incremento de 1) | 1 doc | 3 |
| `products` | Auto-ID | staff crea · admin edita precio/código/estado | 500–1 000 | 3 |
| `barcodes` | **el código** (EAN o interno) | staff vía Rules | ≥ `products` | 3 |
| `sales` | Auto-ID **pre-generado en cliente** | **solo Function** | ~4 000–8 000/año | 4 |
| `dailySummaries` | `dateKey` (`2026-09-15`) | **solo Function** | 365/año | 4 escribe · 7 lee |
| `giftCards` | **el código impreso**, normalizado | **solo Function** | decenas | 6 |
| `giftCardIssues` | Auto-ID | **solo Function** | decenas/año | 6 |
| `giftCardMovements` | Auto-ID | **solo Function** | cientos/año | 6 |

### 8.2 `users/{uid}`

```ts
export type RoleUser = 'admin' | 'user';

export interface AppUser {
  uid: string;              // del ID del documento · NO almacenado
  firstName: string;
  lastName: string;
  ci: string;
  email: string;            // espejo de Auth · solo escribible por Cloud Function
  phoneNumber?: string;
  address?: string;
  role: RoleUser;
  isActive: boolean;
  photoUrl?: string;
  photoPath?: string;       // ruta en Storage: lo único que permite reemplazar/borrar

  searchName: string;       // "apellidos nombres" normalizado → búsqueda por prefijo (§12)
  emailLower: string;       // búsqueda exacta insensible a mayúsculas

  createdAt: Timestamp;     // serverTimestamp()
  updatedAt: Timestamp;
}
```

- **`searchName` y `emailLower`** — sin campos normalizados no hay búsqueda posible en
  Firestore que no implique descargar la colección. Los genera el servicio de datos, nunca
  se escriben a mano.
- **`createdAt: Timestamp`, no `any`** — `any` en un campo de fecha es la puerta a guardar
  a veces un `Date`, a veces un string ISO y a veces un `Timestamp`. El converter fuerza
  un solo tipo.
- **Sin `password`** — vive solo en Authentication.
- **Sin `username`** — Firebase autentica por correo.

### 8.3 `settings/app`

Documento único de configuración. Existe para que los datos de la tienda que aparecen en
el comprobante y las políticas configurables **no queden como constantes en el código**,
donde cambiarlas exige un despliegue. Una lectura, cacheada en memoria durante la sesión.

```ts
export interface AppSettings {
  storeName: string;              // "Mi Pimpollito"
  storeTagline: string;           // "JUGUETERÍA"
  storeDescription: string;       // "Artículos y accesorios para Niños"
  address: string;                // "Calle Tomás Frias entre Av. Antofagasta y Pisagua Nº 100, Oruro"
  phone: string;                  // "+591 77966329"
  social?: string;                // "@mipimpollito"
  nit?: string;                   // vacío: no hay facturación fiscal (A3)
  currency: 'BOB';
  timezone: 'America/La_Paz';

  internalCodePrefix: string;     // 'MP' → códigos propios (§14)
  giftCardPrefix: string;         // 'GC' → distingue tarjeta de producto al escanear
  lowStockThreshold: number;      // 3   → alerta de stock bajo (B8)

  allowSaleWithoutStock: boolean;  // true  (C4 · §2.1 C-1)
  giftCardAllowsPartial: boolean;  // false (E3 · §2.1 C-2)

  updatedAt: Timestamp;
}
```

Los dos flags de política están **aquí y no en el código** precisamente porque son
decisiones del negocio que pueden cambiar sin desplegar: si mañana la tienda decide no
vender sin stock, es un interruptor en la pantalla de configuración.

### 8.4 `products/{autoId}`

```ts
export interface Product {
  id: string;                  // del ID del documento
  code: string;                // código principal (interno o EAN). Legible, editable
  name: string;
  description?: string;

  priceCents: number;          // entero. Bs 10,50 → 1050
  stock: number;               // entero. PUEDE SER NEGATIVO (§2.1 C-1)

  imageUrl: string;            // obligatoria
  imagePath: string;

  isActive: boolean;           // soft delete
  nameLower: string;           // normalizado para búsqueda y orden (§12)

  createdBySellerId: string;   // quién lo cargó (A5/G3 · §2.1 C-3)
  createdBySellerName: string; // snapshot

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 8.5 `barcodes/{code}` y `counters/internalCode`

```ts
export interface BarcodeIndex {
  code: string;                // del ID del documento
  productId: string;
  kind: 'ean' | 'internal';    // origen del código
  createdAt: Timestamp;
}

// counters/internalCode — generador de códigos propios (§14)
export interface Counter { seq: number; updatedAt: Timestamp; }
```

### 8.6 `sales/{saleId}`

```ts
export interface SaleItem {
  productId: string;          // referencia estable
  code: string;               // snapshot
  name: string;               // snapshot
  unitPriceCents: number;     // snapshot — el precio del momento de la venta
  quantity: number;
  subtotalCents: number;      // unitPriceCents × quantity
}

export type PaymentMethod = 'cash' | 'qr' | 'giftcard';

export interface Payment {
  method: PaymentMethod;
  amountCents: number;

  // solo si method === 'qr'
  voucherStatus?: 'pending' | 'uploaded';   // §2.1 C-4
  voucherUrl?: string;
  voucherPath?: string;

  // solo si method === 'giftcard'
  giftCardIssueId?: string;
  giftCardCode?: string;      // snapshot del código físico
}

export interface Sale {
  id: string;
  sellerId: string;           // uid
  sellerName: string;         // snapshot: el reporte no debe depender del usuario actual

  items: SaleItem[];
  totalCents: number;

  payments: Payment[];            // uno o dos (giftcard + diferencia)
  paymentMethods: PaymentMethod[]; // denormalizado para poder consultar

  cashCents: number;              // denormalizados por la Function para agregar (§18)
  qrCents: number;
  giftCardCents: number;

  customerName?: string;          // opcional (C8). Vacío se muestra como "Anónimo"

  status: 'completed' | 'cancelled';
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  cancelReason?: string;

  createdAt: Timestamp;       // serverTimestamp()
  dateKey: string;            // '2026-09-15'  en America/La_Paz
  monthKey: string;           // '2026-09'
  year: number;               // 2026
}
```

**Snapshots: por qué los ítems duplican datos del producto.** Si mañana el auto rojo pasa
de Bs 50 a Bs 70, la venta de ayer debe seguir mostrando Bs 50; y si el producto se
renombra o se da de baja, el comprobante de hace tres meses tiene que seguir siendo
legible. El `productId` se conserva junto al snapshot para poder enlazar al producto
actual cuando exista, pero **ningún reporte depende de leer `products`**: un reporte
mensual de 600 ventas no hace ni una lectura de productos. Es a la vez lo correcto
contablemente y lo más barato.

**Campos decididos ahora para no migrar después:** `status` (se escribe `'completed'`
desde el primer día, aunque la anulación llegue con la Fase 4), `sellerName`,
`customerName`, y los tres campos denormalizados de importe por forma de pago.
**Sin descuentos** por ahora: cuando aparezcan, el lugar natural es un `discountCents` por
línea y otro por venta, con `totalCents` siempre como campo autoritativo.

### 8.7 `dailySummaries/{dateKey}`

```ts
export interface DailySummary {
  dateKey: string;            // del ID del documento
  monthKey: string;
  year: number;

  salesCount: number;
  itemsCount: number;         // unidades vendidas
  totalCents: number;         // mercancía vendida
  cashCents: number;
  qrCents: number;
  giftCardCents: number;      // saldo consumido: NO es dinero nuevo

  giftCardsIssuedCents: number;   // tarjetas nuevas vendidas (dinero nuevo)
  giftCardForfeitedCents: number; // saldo no reclamado (§2.1 C-2)

  // Fase 6: desglose de CÓMO se cobró la venta de la tarjeta (§16.9) — separado
  // de cashCents/qrCents porque esos dos son estrictamente "mercancía vendida"
  // (§18.2) y mezclar ahí el dinero de una emisión de gift card rompería la
  // identidad `mercancía vendida == Σ pagos de las ventas`. Estos dos campos
  // son los que permiten calcular "dinero recibido hoy" (§18.2) sin leer
  // `giftCardIssues`.
  giftCardIssuesCashCents: number;
  giftCardIssuesQrCents: number;

  // detalle por producto del día. Solo los productos que se vendieron
  products: Record<string, { code: string; name: string; qty: number; totalCents: number }>;

  updatedAt: Timestamp;
}
```

Justificación en §19. En resumen: F1 pide detalle por producto para día, semana, mes **y
año**; los `items[]` de una venta **no son agregables** por `sum()`; y un año de campaña
puede llegar a ~8 000 ventas. Sin este documento, el reporte anual por producto exigiría
paginar miles de documentos. Con él, un año son 365 lecturas por ID y una semana son 7.

El mapa `products` no desborda: en un día se venden decenas de productos distintos, no
cientos; incluso 200 entradas quedan en ~20 KB, muy lejos del límite de 1 MiB por
documento. Y la escritura es **una sola por venta** sobre un documento que recibe 20–90
escrituras repartidas en 12 horas: sin contención (el límite práctico es ~1 escritura por
segundo y documento).

### 8.8 Gift cards — modelo vigente desde la Fase 6 (reemplaza el diseño original de este §8.8)

> **Decisión revisada en la Fase 6.** El diseño original de este documento asumía tarjetas
> vírgenes con "importe libre, con decimales" (E2) decidido en cada emisión. El cliente
> confirmó en vivo, al ejecutar la Fase 6, que las tarjetas las fabrica una imprenta externa
> **con la denominación ya impresa** (100/500/1000 Bs…): el monto se fija **una sola vez**,
> al registrar la tarjeta física, nunca en cada activación. Los nombres de estado también
> cambian (`AVAILABLE`/`ACTIVE`/`SUSPENDED`/`CANCELLED` en vez de
> `in_stock`/`active`/`retired`) para incorporar el estado `SUSPENDED` (pérdida/robo, E8) que
> el diseño original no contemplaba. La arquitectura de tres colecciones (§16.1) **no
> cambia** — sigue respondiendo las mismas tres preguntas — pero el modelo de campos sí. Ver
> el §16 reescrito más abajo para el ciclo de vida completo.

```ts
export type GiftCardStatus = 'AVAILABLE' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

// giftCards/{cardCode} — el PLÁSTICO. El código impreso, normalizado, es el ID.
// Reutilizable: el estado corriente completo se lee en 1 sola lectura (ya no
// hace falta el segundo salto a giftCardIssues que preveía el §16.5 original).
export interface GiftCard {
  cardCode: string;
  amountCents: number;             // denominación FIJA, decidida al registrar (nunca cambia)
  status: GiftCardStatus;

  // Mecanismo anti-carrera entre ciclos (E5, prompt Fase 6 §7/§23/§44):
  // cycleNumber es el identificador legible; activeCycleId es el id real de
  // giftCardIssues que hay que citar para operar sobre el ciclo vigente.
  // Cualquier operación que cite un activeCycleId viejo se rechaza server-side.
  cycleNumber: number;
  activeCycleId: string | null;

  currentBuyerName: string | null;
  activatedAt: Timestamp | null;
  activatedBy: string | null;
  activatedByName: string | null;

  suspendedAt: Timestamp | null;
  suspendedBy: string | null;
  suspendedByName: string | null;
  suspensionReason: string | null;

  cancelledAt: Timestamp | null;    // baja DEFINITIVA — terminal, nunca vuelve a AVAILABLE
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;

  createdAt: Timestamp;
  createdBy: string;
  createdByName: string;
  updatedAt: Timestamp;
}

// giftCardIssues/{issueId} — un CICLO de uso (antes "emisión"). Nace al
// vender/activar, vive mientras la tarjeta está ACTIVE/SUSPENDED, se cierra
// al redimirse (dentro de createSale) o al cancelarse. Solo admin lo lee
// directo (auditoría) — el mostrador no lo necesita: el estado corriente ya
// está denormalizado en GiftCard.
export interface GiftCardIssue {
  id: string;
  cardCode: string;
  cycleNumber: number;
  amountCents: number;             // snapshot de GiftCard.amountCents en la activación
  status: 'active' | 'suspended' | 'redeemed' | 'cancelled';
  buyerName: string | null;

  activatedAt: Timestamp;
  activatedBy: string;
  activatedByName: string;
  dateKey: string;                 // America/La_Paz — el día a corregir si se cancela después
  monthKey: string;
  year: number;
  payments: { method: 'cash' | 'qr'; amountCents: number }[]; // cómo pagó el comprador LA TARJETA

  suspendedAt: Timestamp | null;
  suspendedBy: string | null;
  suspensionReason: string | null;
  reactivatedAt: Timestamp | null;
  reactivatedBy: string | null;

  redeemedAt: Timestamp | null;
  saleId: string | null;
  redeemedAmountCents: number | null;
  forfeitedAmountCents: number | null;

  cancelledAt: Timestamp | null;
  cancelledBy: string | null;
  cancelReason: string | null;

  closedAt: Timestamp | null;
}

// giftCardMovements/{moveId} — el LIBRO MAYOR, append-only. Un evento por
// transición, con snapshot de comprador/venta/ciclo. Solo admin lee, nadie
// escribe desde el cliente.
export interface GiftCardMovement {
  id: string;
  giftCardId: string;              // = cardCode
  codeSnapshot: string;
  amountCents: number;
  cycleNumber: number | null;      // null en REGISTERED (todavía no hay ciclo)
  cycleId: string | null;
  type: 'REGISTERED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'REDEEMED'
      | 'FORFEITED' | 'CANCELLED' | 'ADJUSTMENT';
  createdAt: Timestamp;
  performedBy: string;
  performedByName: string;
  buyerNameSnapshot: string | null;
  saleId: string | null;
  reason: string | null;
}
```

### 8.9 Índices compuestos (estado real, actualizado en la Fase 7)

> Esta tabla listaba originalmente índices "previstos" que en varios casos nunca se
> implementaron tal cual (p.ej. `paymentMethods ARRAY, dateKey ASC` nunca hizo falta).
> Lo que sigue es el contenido REAL de `firestore.indexes.json`, verificado en vivo.

| Colección | Campos | Para |
|---|---|---|
| `users` | `isActive ASC, searchName ASC` | Listado filtrado por estado, orden alfabético |
| `users` | `isActive ASC, emailLower ASC` | Búsqueda/orden por email |
| `users` | `searchTokens ARRAY, searchName ASC` | Búsqueda por token |
| `users` | `isActive ASC, searchTokens ARRAY, searchName ASC` | Búsqueda por token + filtro de estado |
| `products` | `isActive ASC, nameLower ASC` | Catálogo activo ordenado |
| `products` | `isActive ASC, stock ASC` | Alerta de stock bajo y stock negativo |
| `sales` | `dateKey ASC, createdAt DESC` | Ventas del día |
| `sales` | `sellerId ASC, dateKey ASC, createdAt DESC` | **Ventas propias del día** del vendedor (§10, §15.5) |
| `sales` | `status ASC, dateKey ASC, cashCents ASC, giftCardCents ASC, qrCents ASC, totalCents ASC` | Fase 7: verificación de integridad — `sum()`/`count()` sobre `sales` en el rango (§18.3). Los cuatro campos sumados van en el índice: es un requisito de Firestore para `getAggregateFromServer` con `sum()`, no solo de `where`/`orderBy` |
| `sales` | `sellerId ASC, status ASC, dateKey ASC, cashCents ASC, giftCardCents ASC, qrCents ASC, totalCents ASC` | Fase 7: ventas por vendedor, mismo motivo que la fila anterior (§18.3, "por vendedor") |
| `giftCards` | `status ASC, cardCode ASC` | Listado filtrado por estado, orden por código (§16) |
| `giftCardIssues` | `dateKey DESC, activatedAt DESC` | Fase 7: detalle de activaciones del período, paginado (§18.3) |
| `giftCardMovements` | `giftCardId ASC, createdAt ASC` | Historial completo de una tarjeta, TODOS sus ciclos (§16) |
| `giftCardMovements` | `type ASC, createdAt ASC` | Fase 7: conteo de canjes (`REDEEMED`) en el rango — `createdAt` se acota con los límites de `dateKeyRangeToTimestampBounds` en la zona del negocio, porque `giftCardMovements` no guarda `dateKey` propio |

Se declaran en `firestore.indexes.json` y se despliegan con el resto. Cuando falta un
índice, Firestore devuelve un error con un enlace directo para crearlo: **conviene
recogerlo en el archivo en vez de crearlo por consola**, para que DEV y PROD no diverjan.

---

## 9. Cloud Storage

```
products/{productId}/{imageId}.webp     imagen del juguete · 1 activa, historial permitido
qr-vouchers/{saleId}/{voucherId}.jpg    comprobante de pago QR · inmutable
users/{uid}/avatar.webp                 foto de perfil · opcional
```

### 9.1 El orden del voucher: primero el ID, después la imagen

La ruta del voucher necesita el `saleId`, pero la venta todavía no existe. Se resuelve sin
trucos: **el cliente genera el ID del documento localmente y sin escribir nada**.

```ts
const saleRef = doc(collection(db, 'sales'));   // no escribe: solo genera el ID
const saleId  = saleRef.id;
```

Ese `saleId` se usa para la ruta de Storage y se envía a `createSale`, que escribe con
`.create()` — lo que además da idempotencia (§15). Con la decisión C-4 (§2.1) el voucher
puede subirse después de la venta, y sigue usando esta misma ruta.

### 9.2 Compresión en el cliente, obligatoria

Una foto de celular son 3–5 MB. Subirlas tal cual multiplicaría por veinte el coste de
almacenamiento y de transferencia, y haría que el catálogo tarde en cargar en el mostrador.

```ts
// core/services/image-compressor.service.ts  (esquema)
const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
// ↑ 'from-image' aplica la rotación EXIF: sin esto, las fotos verticales de celular
//   aparecen giradas 90°, que es el bug clásico de este flujo
// canvas de ancho máximo 1600 px manteniendo proporción → toBlob('image/webp', 0.82)
```

| Tipo | Objetivo | Límite en Rules |
|---|---|---|
| Imagen de producto | WebP · ≤ 1600 px · ~120–200 KB | 2 MB |
| Voucher QR | JPEG · ≤ 1400 px · ~100–150 KB | 3 MB (foto de pantalla, puede pesar más) |
| Avatar | WebP · ≤ 512 px · ~30 KB | 1 MB |

**Volumen previsto:** 1 000 productos × 150 KB ≈ **150 MB**, más ~8 MB/año de vouchers.
El tramo gratuito de Storage son 5 GB: el coste es irrelevante. Aun así la compresión no
es negociable, porque lo que se nota es la **velocidad de carga del listado**, no la factura.

### 9.3 Reemplazar una imagen

Se sube la nueva, se actualiza el documento y **luego** se borra la anterior usando
`imagePath`. En ese orden: si se borra primero y la subida falla, el producto queda sin
imagen y las Rules ya no dejan guardarlo.

---

## 10. Security Rules

> Los guards de Angular son **experiencia de usuario**: evitan que alguien llegue a una
> pantalla que no le corresponde. Las Rules son **la seguridad**: son lo único que impide
> que alguien con el token de sesión y la consola del navegador lea o escriba lo que
> quiera. Se escriben **desde la Fase 1**, junto a cada fase, nunca al final.

### 10.1 El límite de las Rules que define toda la arquitectura

El lenguaje de Rules **no tiene iteración**: no hay bucles, `map` ni `reduce`. Se puede
comprobar `request.resource.data.items.size() <= 50`, pero **es imposible validar que
`total == Σ items[i].subtotal`** para un número arbitrario de ítems. Tampoco se puede
verificar que el descuento de stock corresponda a la cantidad vendida en una venta escrita
en la misma operación: **cada escritura de un lote se evalúa contra el estado previo al lote**.

Consecuencia directa: **si el cliente escribiera las ventas, un vendedor con la consola
abierta podría registrar una venta de Bs 1 por un juguete de Bs 500, o dejar el stock
intacto.** Ninguna regla lo impediría. Por eso `createSale` es una Cloud Function y no una
transacción de cliente. No es preferencia de estilo: es el único cierre posible.

### 10.2 Firestore Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }

    function me() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function isActive() { return signedIn() && me().isActive == true; }
    function isAdmin()  { return isActive() && me().role == 'admin'; }
    function isStaff()  { return isActive() && (me().role == 'admin' || me().role == 'user'); }

    // campos que el cliente no puede tocar nunca, ni siquiera un admin
    function untouched(fields) {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny(fields.toSet());
    }

    match /users/{userId} {
      // la lectura propia es el paso 2 de la cadena de sesión: no puede depender de me()
      allow get: if signedIn() && request.auth.uid == userId;
      allow get, list: if isAdmin();

      // crear y borrar: solo Cloud Function (el Admin SDK ignora estas reglas)
      allow create, delete: if false;

      // el propio usuario edita únicamente datos de contacto
      allow update: if request.auth.uid == userId && isActive()
                    && untouched(['role','isActive','email','emailLower','createdAt','ci']);

      // el admin edita el perfil, el rol y el estado — pero nunca el email
      allow update: if isAdmin()
                    && untouched(['email','emailLower','createdAt'])
                    && request.resource.data.role in ['admin','user']
                    && request.resource.data.isActive is bool;
    }

    match /settings/{docId} {
      allow get: if isStaff();
      allow write: if isAdmin();
    }

    match /counters/{counterId} {
      allow get: if isStaff();
      // el generador de códigos internos: solo se puede incrementar de uno en uno
      allow update: if isStaff()
                    && request.resource.data.seq == resource.data.seq + 1;
      allow create, delete: if false;
    }

    match /products/{productId} {
      allow get, list: if isStaff();        // el vendedor necesita el catálogo

      // el vendedor CREA productos (A5/G3)
      allow create: if isStaff()
        && request.resource.data.priceCents is int
        && request.resource.data.priceCents > 0
        && request.resource.data.stock is int
        && request.resource.data.imagePath is string
        && request.resource.data.imagePath.size() > 0   // imagen obligatoria (B5)
        && request.resource.data.isActive == true
        && request.resource.data.createdBySellerId == request.auth.uid;

      // el admin edita todo, incluido el precio
      allow update: if isAdmin()
        && request.resource.data.priceCents is int
        && request.resource.data.priceCents > 0
        && request.resource.data.stock is int
        && request.resource.data.imagePath is string
        && request.resource.data.imagePath.size() > 0
        && untouched(['createdAt','createdBySellerId','createdBySellerName']);

      // el vendedor edita lo no sensible: nunca el precio, el código ni el estado
      allow update: if isStaff()
        && untouched(['priceCents','code','isActive','createdAt',
                      'createdBySellerId','createdBySellerName'])
        && request.resource.data.stock is int
        && request.resource.data.imagePath.size() > 0;

      allow delete: if false;               // soft delete con isActive
    }

    match /barcodes/{code} {
      allow get: if isStaff();              // el escaneo lo resuelve el vendedor
      allow list: if isAdmin();
      allow create: if isStaff();           // se crea junto al producto, en lote
      allow delete: if isAdmin();
      allow update: if false;               // un código no se reasigna: se borra y se crea
    }

    match /sales/{saleId} {
      // el vendedor ve SOLO sus propias ventas (A5, C5); el admin ve todas
      allow get, list: if isAdmin()
                       || (isStaff() && resource.data.sellerId == request.auth.uid);
      allow write: if false;                // solo createSale / cancelSale
    }

    match /dailySummaries/{dateKey} {
      allow get, list: if isAdmin();        // el cierre de caja es del admin
      allow write: if false;                // solo la Function
    }

    // ⟳ Fase 6 — reglas REALMENTE desplegadas (reemplazan el boceto anterior,
    // que todavía dejaba `create/update` directo para admin en `giftCards`).
    // Las tres colecciones son SOLO LECTURA desde el cliente, sin excepción:
    // registrar, activar/vender, suspender, reactivar y cancelar definitivamente
    // son operaciones que exigen leer y validar el estado real dentro de una
    // transacción (ciclo vigente, denominación, rol) — el mismo argumento que ya
    // cierra `sales` (§10.2, arriba). Todo pasa por
    // `functions/src/giftcards.ts` y por el pago `giftcard` de `createSale`.
    match /giftCards/{cardCode} {
      allow get, list: if isStaff();        // 1 lectura: estado completo ya denormalizado
      allow write: if false;
    }
    match /giftCardIssues/{issueId} {
      allow get, list: if isAdmin();        // auditoría — el mostrador no lo necesita (§16.1)
      allow write: if false;
    }
    match /giftCardMovements/{moveId} {
      allow get, list: if isAdmin();
      allow write: if false;
    }

    match /{document=**} { allow read, write: if false; }   // cierre explícito
  }
}
```

**Nota sobre `isActive()`:** escrito así, un documento sin el campo o con `null` evalúa a
falso. El lado seguro es el lado por defecto.

**Nota sobre `stock`:** las reglas validan `stock is int` pero **no** `stock >= 0`. Es
consecuencia directa de C4 (§2.1 C-1): `createSale` puede dejar el stock negativo, y si la
regla exigiera no-negatividad, ese producto no podría volver a guardarse nunca desde el
formulario. La restricción de no-negatividad vive en el formulario, para la carga manual.

**Nota sobre la consulta del vendedor:** la Rule de `list` en `sales` solo se satisface si
la consulta del cliente **ya está restringida** a `sellerId == uid`. Firestore rechaza una
consulta que pudiera devolver documentos que violan la regla, así que el listado del POS
tiene que incluir `where('sellerId','==',uid)` — y de ahí el índice compuesto
`sellerId, dateKey, createdAt` de §8.9.

### 10.3 Las cinco propiedades que estas reglas garantizan

1. **Nadie eleva su propio rol.** La regla del propio usuario excluye `role` e `isActive`
   mediante `diff().affectedKeys()`, que compara el documento entrante con el almacenado:
   no basta con no enviar el campo — **modificarlo** hace fallar la escritura.
2. **Un usuario desactivado no lee nada** salvo su propio documento, que es justo lo que la
   aplicación necesita para rechazarlo limpiamente.
3. **El correo nunca se desincroniza de Authentication**, porque el cliente no puede
   escribirlo por ninguna vía.
4. **Las ventas y las gift cards no son escribibles por el cliente.** Todo lo que mueve
   dinero pasa por una Function que valida con el Admin SDK.
5. **Un vendedor no puede leer las ventas de otro** ni cambiar un precio.

### 10.4 Storage Rules

Las Storage Rules **no pueden consultar Firestore**, así que el rol llega en el custom
claim (§7.6). Lo que sí pueden validar, y hay que validar siempre, es **quién**,
**dónde**, **qué tipo** y **cuánto pesa**.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function signedIn() { return request.auth != null; }
    function isStaff()  { return signedIn() &&
                          request.auth.token.role in ['admin','user']; }
    function isAdmin()  { return signedIn() && request.auth.token.role == 'admin'; }
    function isImage(max) {
      return request.resource.contentType.matches('image/(jpeg|png|webp)')
          && request.resource.size < max;
    }

    match /products/{productId}/{file} {
      allow read:   if signedIn();
      allow write:  if isStaff() && isImage(2 * 1024 * 1024);
      allow delete: if isAdmin();
    }

    match /qr-vouchers/{saleId}/{file} {
      allow read:   if isStaff();
      // inmutable: se crea una vez y no se reemplaza ni se borra
      allow create: if isStaff() && isImage(3 * 1024 * 1024);
      allow update, delete: if false;
    }

    match /users/{uid}/{file} {
      allow read:   if signedIn();
      allow write:  if (request.auth.uid == uid || isAdmin()) && isImage(1 * 1024 * 1024);
      allow delete: if request.auth.uid == uid || isAdmin();
    }

    match /{allPaths=**} { allow read, write: if false; }   // cierre explícito
  }
}
```

**Nunca** `allow read, write: if true;` en producción, en ningún momento, ni "temporalmente
para probar". El bucket de un proyecto es público en su URL: una regla abierta significa
catálogo y comprobantes de pago accesibles a cualquiera que adivine una ruta.

### 10.5 Coste de las Rules

Cada `get()` dentro de una regla **se factura como una lectura**. Con el patrón elegido,
leer un producto cuesta 2 lecturas (el producto + el documento del usuario). Firestore
reutiliza el resultado de un mismo `get()` dentro de la evaluación de una solicitud, y el
límite es de 10 `get()` por solicitud. Con el volumen de esta tienda, duplicar las lecturas
es irrelevante frente a tener el rol siempre fresco. La alternativa —leer el rol de
`request.auth.token.role`, cero lecturas— queda documentada como optimización disponible si
el volumen creciera un orden de magnitud, con el coste de aceptar un desfase de hasta una hora.

---

## 11. Navegación y layout

Se **conserva** el layout heredado —topbar + sidebar izquierdo + contenido + footer, con
sus modos overlay/static/mobile y `LayoutService`—, que es el activo más valioso del fork.
Lo único que cambia es el **contenido del menú** y **cómo se decide su visibilidad**.

### 11.1 Menú declarativo por rol

- **Recomendación:** una constante `MENU: MenuEntry[]` donde cada entrada declara los roles
  que la ven, y el sidebar la filtra con un `computed()` sobre la sesión.
- **Por qué:** el `AppMenuContentService` heredado construye el modelo **dentro** de
  `translate.get('app').subscribe(...)` y evalúa los permisos **una sola vez**, en ese
  instante. Con una sesión que se resuelve después, el sidebar quedaría vacío y solo se
  repoblaría empujando un contador (`refresSideBar`) a mano. Con un `computed()` sobre la
  señal de sesión, el menú se recalcula solo cuando la sesión cambia, y desaparece tanto la
  dependencia asíncrona de la traducción como el contador.
- **Descartada:** *mantener los `canSeeMenu(RESOURCES.X)`* — proyecta un modelo de permisos
  bitwise por recurso que se elimina, y no es proyectable a Firestore Rules.

```ts
export interface MenuEntry {
  label: string; icon: string; route: string; roles: RoleUser[];
}

export const MENU: MenuEntry[] = [
  { label: 'Inicio',    icon: 'fa-house',       route: '/',          roles: ['admin','user'] },
  { label: 'Ventas',    icon: 'fa-cash-register', route: '/ventas',   roles: ['admin','user'] },
  { label: 'Productos', icon: 'fa-cubes',       route: '/productos', roles: ['admin','user'] },
  { label: 'Gift Cards',icon: 'fa-gift',        route: '/giftcards', roles: ['admin','user'] },
  { label: 'Usuarios',  icon: 'fa-users',       route: '/usuarios',  roles: ['admin'] },
  { label: 'Reportes',  icon: 'fa-chart-column',route: '/reportes',  roles: ['admin'] },
];
```

| Rol | Ve |
|---|---|
| `admin` | Inicio · Ventas · Productos · Gift Cards · Usuarios · Reportes |
| `user` | Inicio · Ventas · Productos · Gift Cards |

> **Esconder el menú no es seguridad.** Es cortesía. Cada ruta lleva además su
> `roleGuard`, y cada colección su Rule. Son tres capas y hacen falta las tres: el menú
> para que la interfaz tenga sentido, el guard para que una URL escrita a mano no abra la
> pantalla, y la Rule para que el token no sirva de nada fuera de la aplicación.

### 11.2 Rutas

```ts
export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes'),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '',          loadComponent: () => import('./features/home/home.component') },
      { path: 'ventas',    loadChildren: () => import('./features/sales/sales.routes') },
      { path: 'productos', loadChildren: () => import('./features/products/products.routes') },
      { path: 'giftcards', loadChildren: () => import('./features/giftcards/giftcards.routes') },
      { path: 'usuarios',  canActivate: [roleGuard(['admin'])],
                           loadChildren: () => import('./features/users/users.routes') },
      { path: 'reportes',  canActivate: [roleGuard(['admin'])],
                           loadChildren: () => import('./features/reports/reports.routes') },
      { path: 'perfil',    loadComponent: () => import('./features/profile/profile.component') },
    ],
  },
  { path: '**', loadComponent: () => import('./features/not-found/not-found.component') },
];
```

Se eliminan `admin/users`, `admin/projects`, `admin/roles`, `admin/audit`, `admin/theme` y
el `PermissionsGuard` con su resolución por reflexión
(`sessionService[camelCase(permission)](resource)`).

**Navegación siempre por `Router`, nunca por `location.href`.** Un `location.href` recarga
la aplicación entera: reinicializa el SDK de Firebase y vuelve a pagar la restauración de
sesión en cada login y cada logout. Logout es `signOut()` y la cadena de sesión lleva sola
a la pantalla de login.

---

## 12. Paginación y búsquedas

### 12.1 Paginación por cursores, obligatoria desde el primer listado

- **Recomendación:** cursores (`orderBy` + `limit` + `startAfter`) con una **pila de
  cursores en memoria** para retroceder, y `getCountFromServer()` para el total. Tamaños de
  página 10 / 20 / 50.
- **Por qué:** Firestore no tiene `OFFSET`: no existe forma de pedir "la página 7" sin
  leer las seis anteriores. Un cursor tiene coste **constante** por página. Y la paginación
  heredada (`PaginatedResult.meta` con `total`, `lastPage`, `prev`, `next` y `page/perPage`)
  no es adaptable: la única forma "fácil" de sostenerla sería descargar la colección
  completa, que es exactamente lo prohibido y lo que rompería el presupuesto con 1 000
  productos.
- **Descartada:** *paginación offset simulada* (leer N×página documentos y descartar) —
  funciona con 50 registros y multiplica el coste por el número de página.

**El problema de "anterior", resuelto.** `startAfter` solo avanza. Dos caminos posibles:

| | `endBefore` + `limitToLast` | **Pila de cursores en memoria** |
|---|---|---|
| Lecturas al retroceder | 1 página | 1 página |
| Complejidad | Consulta distinta según la dirección | Una sola consulta, el cursor sale de la pila |
| Ir a la primera página | Consulta nueva | `pila = []` |
| Coherencia si cambian los datos | Puede saltarse un elemento | Igual |

Se elige la **pila**: `cursors: QueryDocumentSnapshot[]` donde el índice es la página.
Avanzar hace `push(lastDoc)`; retroceder hace `pop()`. Ir a la primera vacía la pila. Es
una decena de líneas en `pagedQuery()` y no hay dos caminos de consulta que mantener.

```ts
// core/data/paged-query.ts  (esquema)
export interface PageRequest { pageSize: 10 | 20 | 50; direction: 'first'|'next'|'prev'; }
export interface PageResult<T> { rows: T[]; hasNext: boolean; hasPrev: boolean; total?: number; }
```

**El total:** `getCountFromServer()` se factura a **1 lectura por cada 1 000 documentos
contados**, y no transfiere documentos. Contar 1 000 productos cuesta 1 lectura. Con eso el
paginador puede mostrar "1–20 de 847" y el número de páginas. Se refresca al cambiar los
filtros, no en cada página.

**El paginador en la interfaz.** Se conserva el componente heredado pero **sin salto directo
de página**: botones *Primera · Anterior · Siguiente*, el rango mostrado, el total y el
selector de tamaño. Ofrecer "ir a la página 7" sería mentir sobre lo que Firestore puede
hacer. Las tablas de PrimeNG se usan en modo `lazy` alimentadas por este mecanismo, no con
su paginador propio.

### 12.2 Búsquedas compatibles con Firestore

- **Recomendación:** búsqueda por **prefijo** sobre campos normalizados
  (`nameLower`, `searchName`, `emailLower`), con `orderBy` + `startAt` / `endAt`, y
  `debounceTime(300)` en el input (la constante `DEBOUNCE_TIME = 300` ya existe en el
  proyecto heredado).

```ts
const term = normalize(input);            // minúsculas, sin acentos, sin espacios dobles
query(collection(db, 'products'),
      where('isActive','==', true),
      orderBy('nameLower'),
      startAt(term),
      endAt(term + ''),             // : el último carácter del rango Unicode
      limit(pageSize));
```

- **Por qué:** es la única búsqueda que Firestore resuelve **en el índice**, con coste
  proporcional a los resultados y no a la colección. Cubre el caso real del mostrador:
  se escribe el principio del nombre.
- **Las tres alternativas, y por qué no:**

| Alternativa | Veredicto |
|---|---|
| Descargar y filtrar en cliente | 1 000 lecturas por búsqueda. Prohibido explícitamente |
| `array-contains` sobre un array de palabras (`searchTokens`) | Permite buscar por **palabra completa** en cualquier posición ("oso" encuentra "oso de peluche"). Cuesta un array por documento y no hace prefijos parciales. **Se añade solo si el prefijo demuestra no bastar** — *posponer* |
| Algolia / Typesense / extensión de búsqueda | Búsqueda real (errores de tecleo, relevancia) a cambio de un servicio externo, sincronización y coste mensual. **Desproporcionado** para 1 000 productos. *Posponer* hasta que exista una queja concreta |

- **Limitación que hay que conocer:** el prefijo **no** encuentra palabras interiores
  ("peluche" no encuentra "oso de peluche"). En el mostrador el camino principal es el
  **lector de código de barras** (§14), y la búsqueda por nombre es el respaldo. Si el
  respaldo resulta insuficiente en el uso real, el siguiente paso es `searchTokens`, no
  Algolia.
- **`normalize()`** es una función pura en `core/utils/normalize.util.ts`, la usan el
  servicio de datos al escribir y el buscador al leer, y **no se duplica**: si el normalizado
  de escritura y el de lectura divergen, la búsqueda deja de encontrar cosas sin dar ningún error.

---

## 13. Productos e imágenes

Modelo en §8.4. Las decisiones que serían costosas de cambiar después:

### 13.1 El ID del producto no es su código de barras

- **Recomendación:** Auto-ID de Firestore. El código de barras **no** es el ID del documento.
- **Por qué:** el ID de un documento en Firestore es inmutable; cambiarlo obliga a crear
  otro documento y borrar el anterior. Un código de barras **sí** cambia —se reetiqueta un
  producto, llega el mismo juguete con EAN distinto de otro proveedor, se corrige un dígito
  mal tecleado— y, sobre todo, un producto puede necesitar **más de un código**: el cliente
  confirmó que el 90% viene con EAN de fábrica y el 10% llevará código propio impreso por la
  tienda (B3). Con Auto-ID, el `productId` es la identidad estable a la que apuntan las
  ventas históricas y el stock, y los códigos son datos que pueden ir y venir.
- **Descartada:** `products/{code}` — ahorra una lectura al escanear y garantiza unicidad,
  pero ata la identidad del producto a una etiqueta de plástico. Análisis completo en §14.

### 13.2 Decisiones menores, resueltas

- **Imagen obligatoria** (B5): el formulario la exige y las Rules verifican que `imagePath`
  sea un string no vacío. Las Rules no pueden comprobar que el archivo exista realmente en
  Storage, así que la garantía es "hay una ruta declarada", no "hay un archivo". Es
  suficiente: la única forma de obtener una ruta es haber subido algo.
- **Una foto por modelo, no por unidad** (B5): *"tengo 40 autos del mismo modelo, entonces
  solo sacamos una foto de ese producto"*. Eso es exactamente lo que el modelo ya hace: un
  documento `products` es un **modelo** con `stock: 40`, no cuarenta documentos. No hace
  falta ningún concepto de variante ni de unidad.
- **Unicidad del código:** la garantiza la colección `barcodes`, donde el código es el ID
  del documento. El formulario comprueba antes con un `getDoc` (1 lectura) para dar un error
  inmediato en lugar de fallar al guardar.
- **Precio histórico:** no se versiona. Cada venta guarda su propio `unitPriceCents` (§8.6),
  que es exactamente lo que los reportes necesitan.
- **Alerta de stock bajo** (B8): `settings.lowStockThreshold` (inicial 3). El listado marca
  con un chip los productos con `stock <= threshold` y en rojo los de stock negativo; la
  pantalla de Inicio muestra el contador. Usa el índice `isActive ASC, stock ASC`, sin
  colección adicional ni notificaciones — *posponer* avisos por correo hasta que se pidan.
- **Coste de compra y margen:** no se añaden campos todavía. *Posponer* hasta que se pidan
  reportes de rentabilidad; añadir un campo opcional después es trivial.
- **Categorías:** no en el modelo inicial. Con 1 000 productos, buscar por nombre y escanear
  cubren el uso real. *Posponer* hasta que exista la pregunta "¿qué categoría vende más?".
- **Movimientos de stock (`stockMovements`):** las ventas explican las bajas; los ajustes
  manuales de inventario y las mermas no quedan registrados. *Posponer*, con una nota:
  **en cuanto se haga el primer conteo físico y aparezca una diferencia, este es el primer
  campo que se va a echar de menos.** Bastaría una colección de cuatro campos añadida en
  su momento. La decisión C-1 (vender sin stock) aumenta la probabilidad de que ese momento
  llegue, porque el stock podrá quedar negativo.

### 13.3 El formulario de producto tiene que funcionar en un celular

Consecuencia de §2.2. La persona que carga el catálogo recorre los estantes con el celular,
fotografía y crea el producto ahí mismo. Requisitos concretos:

- `<input type="file" accept="image/*" capture="environment">` para abrir la cámara trasera.
- Formulario en **una columna** a ancho de teléfono, campos grandes, teclado numérico en
  precio y stock (`inputmode="decimal"` / `"numeric"`).
- Compresión en el cliente antes de subir (§9.2): una foto de celular son 3–5 MB y los
  datos móviles de la tienda no son infinitos.
- Guardar y **volver al formulario vacío** con el foco en el nombre, para cargar en cadena.
  Con 500–1 000 productos por delante, cada pulsación de más se multiplica por mil.

El POS (§15), en cambio, se diseña para laptop, teclado y lector: monitores no táctiles (G1).

---

## 14. Códigos de barras y lector USB HID

> Es el flujo más usado del sistema: cada venta lo ejecuta una vez por juguete. Tiene que
> ser instantáneo, funcionar igual con lector físico y con tecleo manual, y no romperse
> cuando un producto cambie de etiqueta.

### 14.1 Las tres alternativas de búsqueda

| Criterio | A · `products/{code}` | B · `barcodes/{code}` → `products/{id}` | C · `where('code','==')` |
|---|---|---|---|
| Lecturas por escaneo | **1** | 2 (1 con caché) | 1 |
| Unicidad garantizada | Sí (por ID) | **Sí (por ID)** | **No** — dos productos pueden compartir código |
| Cambiar el código | Crear + borrar el documento; rompe referencias | **Borrar y crear un doc de índice** | Actualizar un campo |
| Varios códigos por producto | **Imposible** | **Natural** (N índices → 1 producto) | Requiere `array-contains` y pierde unicidad |
| Ventas históricas estables | Se rompen si el código cambia | **Sí** | Sí |
| Índice necesario | No | No | Sí (automático) |
| Complejidad al guardar | Mínima | Dos escrituras en lote | Mínima |

**Recomendación: opción B** — `products/{autoId}` con una colección índice
`barcodes/{code} → { productId, kind }`.

**Por qué.** Con 10–20 ventas al día el coste de lecturas **no es el criterio**: incluso
escaneando 200 veces al día, la opción B consume ~400 lecturas frente al tramo gratuito de
50 000 diarias. Lo que sí importa a esta escala es lo que pasa en una juguetería real, y la
respuesta B3 del cliente lo confirmó: **el 90% de los juguetes trae código de barras de
fábrica y el 10% no**, y esos hay que etiquetarlos con un código propio. Un mismo modelo
puede llegar de dos proveedores con EAN distinto, y una etiqueta se reimprime cuando se
borra. La opción B es la única que admite todo eso sin tocar la identidad del producto ni
las ventas ya registradas, y mantiene la unicidad garantizada por el ID del documento del
índice — que es una propiedad de la base de datos, no una validación que alguien pueda
olvidar. La segunda lectura se elimina casi siempre con un `Map<code, productId>` en
memoria durante la sesión del POS: los códigos no cambian mientras se factura.

**Descartadas.** *A* (`products/{code}`): la elegiría si el catálogo fuera 100% EAN de
fábrica y un código nunca cambiara; aquí convierte cada reetiquetado en una migración de
documento y hace imposible el segundo código. *C* (query por campo): cuesta lo mismo que A
—Firestore factura por documento devuelto— pero **no puede garantizar unicidad**, y en un
punto de venta eso significa cobrar el juguete equivocado. Evitarlo exigiría la misma
colección índice de B, con lo cual ya se está en B.

**Consistencia entre producto e índice.** Crear o editar un producto escribe siempre en
lote (`writeBatch`): el documento del producto y sus documentos de índice en una sola
operación atómica. No hace falta transacción porque no hay que leer antes de escribir —
solo asegurar que ambas escrituras ocurren o ninguna. Al retirar un código se borra su
documento de índice en el mismo lote.

### 14.2 Generador de códigos internos e impresión de etiquetas

Alcance **nuevo**, derivado de B3 (*"necesitamos un generador de códigos para ponerle a los
que no tienen"*) y B4 (*"no hay impresora de etiquetas, pero posiblemente compremos; de
momento generar un PDF normal en carta"*). Entra en la **Fase 3**.

**Formato del código:** `settings.internalCodePrefix` + secuencial de 6 dígitos →
`MP000001`. Se genera con una transacción sobre `counters/internalCode`, cuyo único
movimiento permitido por las Rules es `seq + 1` (§10.2). Con un solo puesto de carga no hay
contención, y la propiedad importante es que **dos productos no puedan recibir el mismo
código** aunque dos personas carguen a la vez.

**Simbología: Code 128.** Acepta letras y dígitos (necesario para el prefijo `MP`), es
compacta y **cualquier lector USB HID la lee sin configuración**. Descartada **EAN-13**:
exigiría un prefijo GS1 registrado a nombre de la empresa, y **inventar dígitos de un
espacio ajeno es una mala práctica** que puede colisionar con el EAN real de otro producto
—precisamente el error que la opción B busca hacer imposible—. Descartado **QR**: los
lectores de mostrador 1D no lo leen y no aporta nada aquí.

**Impresión.** `jsbarcode` renderiza el Code 128 a un `<canvas>`, se exporta a PNG y
`pdfmake` compone una **hoja carta con una rejilla de etiquetas** (nombre del producto,
precio y el código de barras). Se imprime en papel adhesivo A4/carta con la impresora
normal. El día que se compre una impresora de etiquetas, cambia solo el `pageSize` de
`pdfmake`: la generación del código no se toca.

**Pantalla:** *Productos → Etiquetas*. Se seleccionan productos del listado, se indica
cuántas etiquetas por producto y se genera el PDF. Reimprimir es volver a generarlo: el
código ya está en `barcodes`, no se regenera nunca.

### 14.3 Espacios de código y desambiguación

Las gift cards físicas también llevan código y se escanean con el mismo lector. Sin una
convención, cada escaneo tendría que consultar dos colecciones. La solución son prefijos,
configurados en `settings/app`:

| Forma del código | Significado | Ruta de búsqueda |
|---|---|---|
| 8, 12, 13 o 14 dígitos | EAN-8 / UPC-A / EAN-13 / ITF-14 de fábrica | `barcodes/{code}` |
| `MP…` | Código interno impreso por la tienda | `barcodes/{code}` |
| `GC…` | Gift card física | `giftCards/{code}` |

Un escaneo nunca cuesta dos consultas fallidas, y el POS puede reaccionar distinto ante una
tarjeta (abrir el panel de saldo) y ante un producto (añadirlo al carrito). Si un código no
encaja en ningún patrón, se busca primero en `barcodes` y luego en `giftCards`: el caso
raro sigue funcionando.

### 14.4 Cómo se captura la lectura

- **Recomendación:** un `<input>` **visible y permanentemente enfocado** en la pantalla de
  venta, que dispara la búsqueda con `(keydown.enter)`. El mismo campo sirve para el lector
  y para escribir a mano.
- **Por qué:** un lector USB HID **se comporta como un teclado**: teclea los dígitos muy
  rápido y termina con Enter. Un input enfocado los recibe igual que si los escribiera una
  persona, así que **un solo camino de código cubre los dos modos de entrada** —que es el
  requisito— y la validación, los mensajes y el foco se prueban una sola vez. Además el
  vendedor **ve** lo que se leyó, lo que convierte un escaneo fallido o un dígito perdido
  en algo evidente en lugar de misterioso. El cliente aún no ha comprado el lector (C3) y
  no sabe el modelo: este diseño funciona con **cualquiera** que emule teclado, que es el
  99% del mercado y lo que hay que pedir al comprarlo.
- **Descartadas:** *escucha global de `keydown` en `document` con heurística de tiempo*
  (< 50 ms entre teclas = máquina) — funciona sin foco, pero captura pulsaciones destinadas
  a otros campos, pelea con los diálogos de PrimeNG y falla con lectores más lentos; queda
  como **directiva opcional de respaldo** si el foco resulta incómodo en la práctica.
  *WebHID o puerto serie* — exige configurar el lector en modo no-teclado; complejidad sin
  beneficio. *Escaneo por cámara* (`BarcodeDetector`) — útil algún día para inventario con
  el móvil, no para el mostrador. *Posponer*.

### 14.5 Flujo completo del escaneo

```
Lector o tecleo → Enter
      │
      ├─ ¿empieza por 'GC'?  → giftCards/{code} → panel de saldo
      │
      └─ barcodes/{code}  (antes: Map en memoria)
            ├─ no existe  → aviso "Código no registrado" + botón "Crear producto con este código"
            └─ existe → products/{productId}
                  ├─ inactivo      → aviso, no se añade
                  ├─ stock <= 0    → se añade CON aviso visible (C4 · §2.1 C-1)
                  └─ ya en carrito → incrementa la cantidad en lugar de duplicar la línea
```

El caso "código no registrado" con acceso directo a crear el producto es lo que convierte el
lector en la herramienta de **carga** del catálogo además de la de venta: se escanea el
juguete nuevo y el código llega ya escrito al formulario.

---

## 15. Ventas, pagos y stock

Modelo en §8.6.

### 15.1 Formas de pago

```ts
export type PaymentMethod = 'cash' | 'qr' | 'giftcard';
```

| Método | Requisitos | Validación en servidor | ¿Dinero nuevo? |
|---|---|---|---|
| `cash` | ninguno | importe > 0 | **Sí** |
| `qr` | comprobante fotografiado; puede adjuntarse después (§2.1 C-4) | importe > 0 · `voucherStatus` presente | **Sí** |
| `giftcard` | emisión `active` con saldo suficiente | la emisión existe, está activa y cubre el importe | **No** — se cobró al vender la tarjeta |

**No hay tarjeta de débito/crédito** (D1). **No hay dólares** (D5). El flujo de QR es
**manual**: el cliente muestra el registro de pago en su celular o la confirmación llega al
celular de la tienda, y se guarda una foto como evidencia (D2). **No hay integración con la
API de ningún banco**, y no se planifica.

**Pago mixto.** D4 dice que no se paga mixto, y para `cash` + `qr` la UI **no lo ofrece**.
La única combinación permitida es **gift card + la diferencia** en efectivo o QR, que la
política de consumo total (§2.1 C-2) hace inevitable cuando la compra supera el valor de la
tarjeta. De ahí que `payments` sea un array:

- **Recomendación:** `payments: Payment[]` desde el primer día.
- **Por qué:** con un único `paymentMethod` la venta "tarjeta de Bs 100 + Bs 50 en efectivo"
  **no se puede representar**, y la Fase 6 tendría que migrar el esquema y reescribir las
  consultas de reportes cuando ya hubiera ventas históricas que respetar. El coste hoy es un
  array de un elemento. La regla de validación es simple y se comprueba en servidor:
  `Σ payments[].amountCents === totalCents`.
- **Descartadas:** *`paymentMethod` único* — imposible de extender sin migración.
  *Campos paralelos (`cashCents`, `qrCents`, `giftCardCents`) en lugar del array* — no
  tienen dónde guardar el voucher ni el `issueId` de cada pago. **Nota:** esos tres campos
  **sí existen**, pero como **denormalización derivada** por la Function *junto* al array,
  no en su lugar: son los que permiten agregar por forma de pago (§18).

**Por qué existe `paymentMethods[]` además de `payments[]`.** Firestore **no puede filtrar
por un campo dentro de un array de objetos**: no existe `where('payments.method','==','cash')`.
Sin el array plano de strings, responder "¿qué ventas se pagaron en efectivo?" exigiría
descargar todas las ventas del rango y filtrar en memoria — justo lo prohibido.
`paymentMethods: ['giftcard','cash']` con `array-contains` lo resuelve con una consulta
indexada. Es una denormalización de una línea, derivada siempre por la Function.

### 15.2 Transacción de stock: `writeBatch` o `runTransaction`

| Criterio | `writeBatch` | `runTransaction` |
|---|---|---|
| Atomicidad de la escritura | Sí | Sí |
| Permite **leer** antes de escribir | **No** | **Sí** |
| Detecta cambios concurrentes | No | Sí — reintenta automáticamente |
| Puede validar el stock | No, salvo `increment(-n)` a ciegas | **Sí** |
| Límite | 500 escrituras | 500 escrituras |
| Adecuado para | Producto + sus índices de código (§14) | **Confirmar una venta** |

- **Recomendación:** `runTransaction`, ejecutada **dentro de la Cloud Function `createSale`**
  con el Admin SDK. No desde el cliente.
- **Por qué la transacción:** hay que **leer** el stock y el saldo de la gift card para
  validarlos antes de moverlos, y `writeBatch` no lee.
- **Por qué en el servidor:** las Rules no pueden validar que el total corresponda a los
  ítems ni que el descuento de stock corresponda a las cantidades (§10.1). Con la
  transacción en el cliente, un vendedor con la consola abierta podría registrar cualquier
  total y cualquier stock, y **no existe regla que lo impida**. Dado que `functions/` ya
  existe por §7, esto no añade infraestructura: añade un archivo. Como beneficio adicional,
  centraliza el cálculo de `dateKey` en la zona correcta, el `serverTimestamp()` y el
  mantenimiento del resumen diario.
- **Descartadas:** *transacción en el cliente* — la elegiría si el único riesgo fuera el
  error de programación y no el fraude; el sistema toca dinero y hay usuarios con sesión
  propia. Queda documentada como camino de respaldo si la latencia fuera un problema en el
  mostrador (no debería: una invocación en la misma región son 200–600 ms, con arranque en
  frío ocasional de 1–2 s, mitigable con una invocación de calentamiento al abrir el POS).
  *Sin transacción* — produce exactamente los dos estados inconsistentes que el requisito
  prohíbe.

### 15.3 Secuencia de `createSale`

```
1. assertStaff()  — sesión válida, perfil existente, isActive
2. Validación de forma (antes de la transacción):
     ≥ 1 ítem · cantidades enteras > 0 · ≤ 50 líneas
     Σ payments[].amountCents === totalCents
     todo pago 'giftcard' con giftCardIssueId
     ≤ 1 pago 'giftcard' y ≤ 1 pago de "diferencia"  (D4 · §15.1)
3. Leer settings/app  → allowSaleWithoutStock, giftCardAllowsPartial
4. DENTRO de la transacción, primero TODAS las lecturas:
     los N documentos de producto · la emisión de gift card si aplica
     (Firestore exige que las lecturas precedan a las escrituras)
5. Validar contra el estado real:
     cada producto existe y está activo
     unitPriceCents enviado === producto.priceCents      ← el cliente NO fija el precio
     stock >= quantity   → si no: rechazar SOLO si allowSaleWithoutStock === false
     la emisión de gift card está 'active' y cubre su importe
6. Escrituras:
     sales/{saleId}.create(...)            ← idempotencia
     products/{id}.stock = leído − cantidad  (puede quedar negativo · §2.1 C-1)
     si gift card: emisión → remaining = 0, status 'depleted', closedAt
                   movimiento 'redeem' por el importe aplicado a la venta
                   movimiento 'forfeit' por el resto, si la compra fue menor (§2.1 C-2)
                   giftCards/{code}.activeIssueId = null, status 'in_stock'
     dailySummaries/{dateKey}  → acumular totales, unidades y detalle por producto
7. Respuesta: { saleId, dateKey, totalCents }  → el POS imprime y limpia el carrito
```

Escrituras totales: 1 venta + N productos + hasta 4 de gift card + 1 resumen. Con 50 líneas
son 56, muy por debajo del límite de 500.

El paso 5 es lo que convierte la transacción en una garantía y no en un adorno: **el
servidor recalcula, no confía**. El cliente envía intención; el servidor decide.

**Idempotencia, en concreto.** El `saleId` lo genera el cliente (necesario para la ruta del
voucher, §9.1) y la Function escribe con `.create()`, que falla si el documento ya existe.
Si el vendedor pulsa "Confirmar" dos veces, o la respuesta se pierde y el POS reintenta, la
segunda llamada falla limpiamente con *"venta ya registrada"* en lugar de duplicar la venta
y descontar el stock dos veces. Es lo que hace que el botón de confirmar sea seguro sin
bloqueos frágiles en la interfaz.

### 15.4 Anulación: el único mecanismo de corrección

El cliente **no acepta devoluciones ni cambios** (C6: *"políticas de la empresa"*), y la
anulación la hace **solo un administrador** (C7). Eso convierte `cancelSale` en la **única**
forma de arreglar un error de registro, así que **entra en la Fase 4**, no después.

**Una venta nunca se borra ni se edita.** `cancelSale(saleId, reason)`:

```
1. assertAdmin()
2. Transacción:
     leer la venta → si status != 'completed', error "ya anulada"
     leer los productos de sus ítems
     venta → status 'cancelled', cancelledAt, cancelledBy, cancelReason
     cada producto → stock + cantidad
     si hubo gift card: revertir. La emisión vuelve a 'active' con su saldo,
       la tarjeta física vuelve a 'active' con activeIssueId,
       y se registran movimientos 'adjustment' (uno por el redeem, otro por el forfeit)
     dailySummaries/{dateKey} → restar los importes, unidades y detalle
3. Los reportes filtran status == 'completed'
```

Así la caja del día siempre se puede reconstruir, **incluida la equivocación**. Y el
listado de ventas muestra las anuladas tachadas, no las oculta: una venta que desaparece de
la pantalla es una venta que alguien va a buscar.

### 15.5 El POS

Diseñado para **laptop, teclado y lector** (G1: monitores no táctiles), un solo puesto (C2).

```
┌─────────────────────────────────────────────────────────────┐
│ [ input de escaneo · siempre enfocado ]      Vendedor: …    │
├──────────────────────────────────┬──────────────────────────┤
│ Carrito                          │ TOTAL       Bs 450,00    │
│  código  nombre   precio  cant   │                          │
│  MP000123 Auto rojo 50,00  [2]   │ Forma de pago            │
│  7501234… Peluche  120,00 [1]    │  ( ) Efectivo            │
│                                  │  ( ) QR                  │
│  Cliente (opcional): ______      │  ( ) Gift card           │
│                                  │  [ CONFIRMAR VENTA ]     │
└──────────────────────────────────┴──────────────────────────┘
```

- El **input de escaneo** recupera el foco después de cada acción. Es lo único que hace que
  escanear diez juguetes seguidos no requiera tocar el ratón.
- **Atajos de teclado**: `F2` confirmar, `Esc` vaciar el carrito (con confirmación),
  `Supr` quitar la línea seleccionada.
- El **nombre del cliente es opcional** (C8): vacío se guarda sin el campo y el comprobante
  imprime *"Anónimo"*.
- El **aviso de stock** aparece en la línea, no en un diálogo modal: un modal por cada
  juguete sin stock sería insufrible, y con `allowSaleWithoutStock: true` la venta continúa.
- **Un vendedor solo ve sus ventas del día** en la pestaña de listado (A5, C5). El admin ve
  todas y puede filtrar por vendedor y por rango.

---

## 16. Gift Cards

> Las tarjetas son **físicas y reutilizables**: salen con saldo, se consumen, vuelven a la
> tienda y se vuelven a vender. La decisión estructural es que **el plástico y el saldo no
> son el mismo objeto**.
>
> **§16 reescrito en la Fase 6** con información nueva confirmada por el cliente que
> reemplaza varios supuestos del diseño original (marcados abajo). La arquitectura de tres
> colecciones (§16.1) no cambió — sigue siendo correcta — pero el modelo de campos, los
> nombres de estado y el ciclo de vida completo sí.

### 16.1 Tres entidades con responsabilidades separadas

Modelos en §8.8.

- **Recomendación (vigente):** las tres colecciones — `giftCards` (el plástico),
  `giftCardIssues` (un CICLO de uso — antes "emisión") y `giftCardMovements` (el libro
  mayor) — con el estado corriente denormalizado en `giftCards` **y** un movimiento por cada
  operación.
- **Por qué:** cada una responde una pregunta que las otras no pueden. **El plástico**
  permite reutilizar la tarjeta: cuando vuelve a la tienda se activa otra vez sobre el mismo
  `cardCode` y el historial anterior no acompaña al nuevo dueño (E5: *"la idea es reusar los
  que salen"*). **El ciclo** es lo que tiene comprador, fecha y estado operativo. **El libro
  mayor** es lo que convierte el historial en algo auditable: sin él, si un estado aparece
  mal no hay forma de saber qué pasó. Y el estado denormalizado se mantiene porque
  consultarlo en el mostrador debe costar **una lectura**, no sumar el historial entero.
- **Cambio de la Fase 6 respecto al diseño original:** el estado corriente completo
  (denominación, estado, comprador, ciclo) vive ahora en `giftCards` — ya no hace falta el
  segundo salto a `giftCardIssues` que preveía el §16.5 original (`activeIssueId` →
  `getDoc`); el mostrador resuelve todo en **1 lectura**. `giftCardIssues` pasa a ser
  información de auditoría que solo admin necesita leer directo (mismo criterio que
  `giftCardMovements`), no algo que el mostrador consulte en el camino caliente.
- **Descartadas:** *un solo documento por tarjeta con el estado dentro* — hace imposible
  reutilizar el plástico sin borrar historia o arrastrar la del cliente anterior. *Solo el
  libro mayor, reconstruyendo el estado al sumar* — consultar el estado costaría N lecturas
  y crecería con el uso: mala propiedad justo en el mostrador. *Dos colecciones, sin
  movimientos* — ahorra una escritura por operación y renuncia a la auditoría.

### 16.2 Políticas aprobadas por el cliente

| Política | Decisión | Respuesta |
|---|---|---|
| Importes | **⟳ Fase 6 — denominación FIJA**, decidida una sola vez al registrar la tarjeta física (la imprenta ya trae el monto impreso). Reemplaza "libres, con decimales" (E2 original) | E2 revisada en Fase 6 |
| Consumo | **Total, en una sola venta**. Sin saldo remanente — confirmado sin cambios en la Fase 6 | E3 |
| Vuelto en efectivo | **No** | E4 |
| Sobrante si la compra es menor | Se extingue como movimiento `FORFEITED` (§2.1 C-2) | derivado de E3+E4 |
| Compra mayor al valor de la tarjeta | Único pago mixto permitido: gift card + la diferencia en cash o QR | E3+E4, §16.8 |
| Caducidad | **No caducan** | E5 |
| Recarga | **No** | E6 |
| Pérdida o robo | **⟳ Fase 6 — nuevo estado `SUSPENDED`**: bloquea la tarjeta sin cerrar el ciclo; `reactivateGiftCard` la recupera sin crear un ciclo nuevo. E8 quedó sin responder en el cuestionario original — esta es la respuesta, dada en vivo en la Fase 6 | E8 resuelta en Fase 6 |
| Baja definitiva del plástico | **⟳ Fase 6 — nuevo estado `CANCELLED`**, terminal: la tarjeta física sale de circulación para siempre. Política conservadora (sin decisión previa distinta): **solo admin** | decisión Fase 6 |
| Quién activa/vende | **Admin y vendedor** (*"ambos, en caso no esté el administrador"*) | E7 |
| Quién registra plástico nuevo | **Solo admin** — es inventario, no una operación de mostrador | decisión técnica |
| Cuántas tarjetas habrá | **20–40 tarjetas iniciales**, en denominaciones de 100/500/1000 Bs (ejemplo dado por el cliente) | E1 revisada en Fase 6 |
| Cómo se paga la venta de la tarjeta | Se registra en `GiftCardIssue.payments` (cash o qr) — igual que preveía el diseño original — y alimenta `dailySummaries.giftCardsIssuedCents` + el desglose `giftCardIssuesCashCents`/`giftCardIssuesQrCents` (§8.7, nuevo en Fase 6) | §16.9 |

### 16.3 Código único, agnóstico de formato

Todavía no se sabe si la imprenta imprimirá código de barras, alfanumérico o ambos — el
sistema trata el código **siempre como string opaco**, nunca como número (perdería ceros a
la izquierda). `normalizeGiftCardCode()` (espejo cliente/servidor, igual que
`normalizeCode()` de productos §14): `trim()` + mayúsculas, sin eliminar ningún carácter
significativo. El código normalizado **es el ID** de `giftCards/{cardCode}` — la unicidad la
garantiza la propia clave primaria de Firestore, verificada dentro de una transacción antes
de crear (individual o por lote), igual que `barcodes/{code}` en Productos.

### 16.4 Máquina de estados — el plástico es reutilizable

```
REGISTER               (nueva) → AVAILABLE
SALE / ACTIVATE        AVAILABLE → ACTIVE            (abre un ciclo nuevo)
LOSS                   ACTIVE → SUSPENDED             (mismo ciclo)
RECOVERY                SUSPENDED → ACTIVE             (mismo ciclo, nunca uno nuevo)
REDEEM                 ACTIVE → evento REDEEMED → AVAILABLE   (dentro de createSale)
DECOMMISSION            AVAILABLE|ACTIVE|SUSPENDED → CANCELLED   (terminal, solo admin)
```

Transiciones **no** permitidas (rechazadas server-side, verificado en vivo): `AVAILABLE →
SUSPENDED`, `AVAILABLE → REDEEM` (sin ciclo abierto no hay nada que redimir), `SUSPENDED →
REDEEM` (hay que reactivar primero), `CANCELLED → *` (terminal, sin excepción).

`REDEEMED` no es un estado permanente de la tarjeta: es un **evento** del libro mayor. El
flujo normal es `AVAILABLE → ACTIVE → (evento REDEEMED) → AVAILABLE`, y ese ciclo se puede
repetir indefinidamente sobre el mismo plástico.

### 16.5 `cycleNumber` / `activeCycleId` — el mecanismo anti-carrera entre ciclos

Como la misma tarjeta puede venderse muchas veces, cada activación necesita un identificador
inequívoco — así una operación atrasada del ciclo de Juan nunca puede afectar el ciclo
posterior de María (caso real que motivó el diseño).

- `cycleNumber`: contador legible en `giftCards`, empieza en 0 y se incrementa **+1** en
  cada `activateGiftCard` exitoso. Es el "va en el ciclo 3" que ve la pantalla.
- `activeCycleId`: el id real (auto-ID de Firestore, único por construcción) del documento
  `giftCardIssues` vigente. `null` cuando la tarjeta está `AVAILABLE` o `CANCELLED`.

**Toda operación que redime o modifica un ciclo debe citar el `activeCycleId` exacto** que
observó, y el servidor lo compara, **dentro de la misma transacción**, contra
`giftCards/{code}.activeCycleId` real. Si no coincide — la tarjeta ya se redimió y se volvió
a activar mientras tanto —, la operación se rechaza (`"Esta gift card ya fue reutilizada"`),
sin tocar el ciclo nuevo. Verificado en vivo con dos pruebas críticas:

1. **Reintento con ciclo viejo:** ciclo 1 se redime y vuelve a `AVAILABLE`; se activa como
   ciclo 2; un intento posterior que todavía cita el `activeCycleId` del ciclo 1 se rechaza,
   y el ciclo 2 queda intacto.
2. **Doble redención simultánea:** dos `createSale` concurrentes citando el mismo
   `activeCycleId` — exactamente uno tiene éxito (gana la transacción de Firestore), el otro
   se rechaza limpio (`"Esta gift card no está activa"`, porque para cuando su transacción
   se reintenta con una lectura fresca, la primera ya puso la tarjeta en `AVAILABLE`). Nunca
   dos ventas exitosas para el mismo ciclo.

### 16.6 Redención — dentro de `createSale`, nunca aparte

`createSale` (plan §15) es quien redime la gift card, **en la misma transacción** que crea
la venta y descuenta stock (plan §22 del prompt de la Fase 6) — nunca `createSale` primero y
después una actualización de la gift card por separado, porque eso reabriría exactamente la
ventana de doble gasto que la transacción existe para cerrar.

Secuencia, dentro de la transacción de `createSale`:

1. Leer `giftCards/{code}` y validar `status === 'ACTIVE'` **y**
   `activeCycleId === el citado por el cliente` (§16.5).
2. Leer `giftCardIssues/{activeCycleId}` y validar `status === 'active'` y que su
   `cycleNumber` coincide con el de la tarjeta (doble verificación).
3. Recalcular el monto aplicado — **el cliente nunca decide cuánto se aplica**, solo el
   `amountCents` real de la tarjeta importa (mismo principio que `unitPriceCents` en
   productos, plan §15.3):
   - compra ≥ denominación → se aplica el valor completo; el resto (si sobra compra) se
     cobra con el segundo pago (cash/qr) — único mixto permitido;
   - compra < denominación → se aplica solo lo que cubre la compra; el resto se pierde como
     `FORFEITED`.
4. Escrituras: `sales/{saleId}` con el snapshot del pago (§16.8) · `giftCardIssues/{id}` →
   `status: 'redeemed'`, `saleId`, montos · `giftCards/{code}` → `status: 'AVAILABLE'`,
   `activeCycleId: null`, `currentBuyerName: null`, `activatedAt/By/ByName: null`
   (`cycleNumber` **se conserva** como historial) · movimiento `REDEEMED` (y `FORFEITED` si
   aplica) · `dailySummaries.giftCardCents` (+ `giftCardForfeitedCents` si aplica).

### 16.7 `cancelSale` + gift card reutilizable — decisión tomada en vivo en la Fase 6

El diseño original de este documento (§15.4, antes de la Fase 6) revertía una gift card al
anular una venta así: *"la emisión vuelve a `'active'` con su saldo, la tarjeta física vuelve
a `'active'` con `activeIssueId`"*. Esa regla se escribió **antes** de que el cliente
confirmara la reutilización real de las tarjetas, y con reutilización resulta insegura: si la
tarjeta ya se redimió y se volvió a vender a otra persona (nuevo ciclo), reabrir a ciegas el
ciclo viejo pisaría el ciclo de ese comprador nuevo — dinero fantasma.

**Decisión confirmada por el cliente en vivo:**

- Si el ciclo que la venta redimió **sigue exactamente como la redención lo dejó** — la
  tarjeta `AVAILABLE`, con el mismo `cycleNumber`, sin ninguna activación posterior — la
  anulación **sí revierte con seguridad**: la tarjeta vuelve a `ACTIVE` con el mismo ciclo,
  el mismo comprador, el mismo `activeCycleId`; el ciclo vuelve a `'active'`
  (`redeemedAt`/`saleId` se limpian); se registra un movimiento `ADJUSTMENT` con el motivo de
  la anulación; y `dailySummaries.giftCardCents`/`giftCardForfeitedCents` del día de la
  redención se revierten.
- Si la tarjeta **ya se reutilizó** (nuevo ciclo, incluso si hoy está de nuevo `AVAILABLE`
  tras un tercer ciclo), la anulación completa se **RECHAZA** — ni el stock, ni el resto de
  la venta se revierte — y hay que resolverlo manualmente (contactar al administrador del
  sistema). Verificado en vivo: activar → redimir → reactivar el mismo ciclo con seguridad
  (revierte OK); activar → redimir → activar de nuevo (ciclo 2) → intentar anular la venta
  del ciclo 1 (rechazado, ciclo 2 intacto).

### 16.8 Snapshot del pago en `sales` — nunca depende del estado actual de la gift card

```ts
// Payment, cuando method === 'giftcard' (plan §8.6)
{
  method: 'giftcard';
  amountCents: number;             // lo efectivamente aplicado (nunca la denominación completa si hubo forfeit)
  giftCardId: string;               // = cardCode
  giftCardCode: string;             // hoy siempre igual a giftCardId — ver nota
  giftCardCycleNumber: number;
  giftCardCycleId: string;
  giftCardForfeitedCents?: number;  // > 0 si la compra fue menor a la denominación
}
```

La venta **nunca** relee `giftCards` para mostrarse — ni en el recibo, ni en el historial, ni
al reimprimir: la misma tarjeta física puede estar en un ciclo completamente distinto para
cuando alguien vuelve a mirar esa venta. Todo sale del snapshot. `giftCardId` y
`giftCardCode` son hoy el mismo valor (el código normalizado es el ID del documento); se
guardan como dos campos separados solo por si el esquema de ID cambiara alguna vez — no
porque hoy difieran.

### 16.9 Emisión ≠ redención — dos eventos financieros distintos

Sin cambios respecto al diseño original: vender/activar una gift card es dinero **nuevo**
que entra (pasivo, ingreso diferido) y **no** crea una venta; redimirla es un pago que ya se
cobró antes y **no** es dinero nuevo. `dailySummaries` mantiene ambos lados separados
(`giftCardsIssuedCents` vs. `giftCardCents`) — ver §18.1, §18.2, y §8.7 para el desglose
nuevo por forma de pago de la emisión (`giftCardIssuesCashCents`/`giftCardIssuesQrCents`,
Fase 6).

### 16.10 Registro de tarjetas — individual y por lote, atómico

`registerGiftCard` (individual) y `registerGiftCardBatch` (hasta 50 códigos, una sola
denominación) son ambas admin-only. El lote es **todo o nada**: si un código está repetido
dentro del mismo lote o ya existe una tarjeta con ese código, no se crea **ninguna** tarjeta
del lote — verificado en vivo con ambos casos. Cada tarjeta nace individual (nunca
"denominación=100, cantidad=6" como un solo documento): seis códigos registrados son seis
documentos `giftCards`, cada uno con su propio movimiento `REGISTERED`.

### 16.11 Baja definitiva (`cancelGiftCard`) con dinero ya cobrado

Cancelar una tarjeta que está `ACTIVE`/`SUSPENDED` (ya vendida, con dinero cobrado) cierra
también su ciclo abierto como `'cancelled'` — mismo patrón que ya usaba el diseño original
para "anular una emisión" (§16.6 original) — y **corrige** `dailySummaries` del día en que
esa tarjeta se activó (no el de hoy, que puede ser cualquier día anterior):
`giftCardsIssuedCents` y el desglose cash/qr bajan por el monto de esa tarjeta, porque la
obligación de entregar mercancía por ese valor ya no existe. Verificado en vivo: activar una
tarjeta de Bs 500 pagada en efectivo (`dailySummaries.giftCardsIssuedCents` +500,
`giftCardIssuesCashCents` +500), cancelarla, y confirmar que ambos vuelven a 0.

### 16.12 Código GENERADO por el sistema — ajuste posterior a la Fase 6

> **Motivo (sin abrir una fase nueva):** la primera imprenta trae 20-40 tarjetas con
> numeración propia, pero la tienda necesita poder generar ella misma el código de una
> tarjeta física nueva cuando fabrique más, o si cambia de imprenta. El código manual
> (§16.3) **sigue funcionando exactamente igual** — esto es una segunda forma de obtener un
> código, no un reemplazo.

- **Nomenclatura:** `GC{denominación}-{secuencia}`, denominación = `amountCents / 100` sin
  decimales cuando es entero (el caso real de todas las denominaciones del cliente),
  secuencia con mínimo 3 dígitos (`001`…`999`…`1000`…, crece sin techo). Ejemplos:
  `GC50-001`, `GC1000-010`.
- **El código generado ES el código de la tarjeta física**, permanentemente — igual que un
  código manual, sobrevive todos sus ciclos (`cycleNumber`/`activeCycleId` son conceptos
  independientes del código, §16.5). Nunca se genera un código nuevo por ciclo.
- **Contador por denominación**, `giftCardCodeCounters/{denominación}` (p. ej. `.../1000`,
  `.../500`): solo de dónde arrancar a buscar. La única fuente de verdad de unicidad sigue
  siendo `giftCards/{code}` (§16.3) — cada candidato se verifica contra `giftCards` **dentro
  de la misma transacción** antes de aceptarlo; si ya existe (código manual que se adelantó,
  o una tarjeta `CANCELLED` — su documento nunca se borra, así que su código nunca se
  reutiliza), se prueba el siguiente candidato sin sobreescribir nada. Contadores
  independientes por denominación: el de `100` no afecta al de `500`.
- **Atómico de punta a punta:** todo ocurre dentro de la transacción de `registerGiftCard`/
  `registerGiftCardBatch` (Admin SDK) — nunca un paso de "generar" separado de "registrar".
  Verificado en vivo con datos reales de DEV: `GC1000-001`/`GC1000-002` ya existían
  (manual/cancelada) y el generador los saltó correctamente, aterrizando en `GC1000-003`; 5
  llamadas `generateGiftCard` verdaderamente simultáneas para la misma denominación
  produjeron 5 códigos distintos, cero colisiones.
- **Extiende `registerGiftCard`/`registerGiftCardBatch`** con `codeMode: 'manual' | 'generated'`
  (default `'manual'` si se omite — comportamiento sin cambios). No se creó ninguna Function
  nueva. En modo lote generado, `quantity` reemplaza a `codes`.
- **Permisos:** admin-only en ambos modos — mismo `assertAdmin()` incondicional que ya
  protegía el registro manual, sin excepción para `codeMode: 'generated'`.
- **Barcode:** siempre `CODE128` (nunca EAN/UPC — el código nunca es un estándar comercial
  real, sea manual o generado). Reutiliza `printBarcodeLabel` (`shared/utils`) y
  `LABEL_SIZE_MM` (`shared/constants`, 50×30 mm) — la misma implementación de Productos,
  parametrizada, no una segunda copia. Imprimir etiqueta funciona igual para un código
  manual (reimpresión) que para uno generado, desde "Ver detalle" de la tarjeta.
- **Rules:** `giftCardCodeCounters/{denominación}` con `allow read, write: if false` —
  cerrado por completo, solo el Admin SDK dentro de la Function lo toca.

---

## 17. Dinero y fechas

### 17.1 Dinero: enteros en centavos

- **Recomendación:** enteros en centavos en **toda** la base de datos — `priceCents`,
  `unitPriceCents`, `subtotalCents`, `totalCents`, `amountCents`, `initialAmountCents`.
  **Nunca decimales.**
- **Por qué:** Firestore almacena los números como IEEE 754 de doble precisión, donde
  `0.1 + 0.2 === 0.30000000000000004`. En una venta de diez ítems con un pago mixto, esos
  residuos se acumulan y aparecen como un descuadre de un centavo en el reporte del día — el
  tipo de error que cuesta horas encontrar y destruye la confianza en el sistema. Con enteros,
  sumar es exacto por definición. El boliviano tiene exactamente dos decimales, así que la
  conversión es trivial y sin pérdida. Y la respuesta E2 lo confirma como necesario: las gift
  cards se venden por importes libres **con decimales** (*"ejemplo 10.50"*). Es una decisión
  que hay que tomar **ahora**: cambiarla después implica migrar productos, ventas históricas
  y saldos de gift card a la vez.
- **Descartadas:** *decimales (`price: 10.50`)* — más cómodo de leer en la consola de
  Firebase, y eso es toda su ventaja. *Strings decimales* — exactos, pero impiden ordenar,
  comparar y usar las agregaciones `sum()` que son la base de los reportes.
  *Una librería decimal* — una dependencia para un problema que el entero ya resuelve.
- **La fricción se concentra en dos piezas pequeñas y se olvida:** un `MoneyPipe` para
  mostrar (`{{ p.priceCents | money }}` → `Bs 10,50`) y `toCents()/fromCents()` en el borde
  del formulario. **El usuario siempre escribe y lee bolivianos; solo la base de datos ve
  centavos.**

```ts
// core/utils/money.util.ts
export const toCents   = (bs: number) => Math.round(bs * 100);
export const fromCents = (c: number)  => c / 100;
```

`Math.round`, no `Math.floor` ni una multiplicación directa: `10.55 * 100` da
`1054.9999999999998` en JavaScript, y truncarlo perdería un centavo en silencio. La
aplicación ya está configurada con `LOCALE_ID: 'es'` y `DEFAULT_CURRENCY_CODE: 'BOB'`, así
que el formato lo resuelve `CurrencyPipe` por debajo del `MoneyPipe`.

### 17.2 Fechas: `America/La_Paz`, calculadas en el servidor

- **Recomendación:** `createdAt` con `serverTimestamp()`; y `dateKey`, `monthKey`, `year`
  calculados **en la Cloud Function**, explícitamente en la zona `America/La_Paz`, con los
  plugins `utc` y `timezone` de `dayjs` (ya es dependencia).
- **El detalle que arruina los reportes diarios si se hace mal:** Bolivia está en **UTC−4
  sin horario de verano**, y la tienda cierra a las 20:00 (G2). Una venta a las **20:00 del
  15 de septiembre en La Paz son las 00:00 del 16 en UTC**. Con un cálculo naíf en UTC,
  **todas las ventas de la tarde y la noche se contarían en el día siguiente** y el cierre de
  caja nunca cuadraría — y el error es difícil de ver, porque los totales del mes siguen
  pareciendo correctos.
- **Por qué en el servidor y no en el navegador:** la hora del cliente es manipulable y su
  zona depende del sistema operativo de la máquina. Una venta no puede llevar la fecha que
  el navegador diga que es.

```ts
// functions/src/date-keys.ts
import dayjs from 'dayjs'; import utc from 'dayjs/plugin/utc'; import tz from 'dayjs/plugin/timezone';
dayjs.extend(utc); dayjs.extend(tz);

export function dateKeys(now = new Date(), zone = 'America/La_Paz') {
  const d = dayjs(now).tz(zone);
  return { dateKey: d.format('YYYY-MM-DD'), monthKey: d.format('YYYY-MM'), year: d.year() };
}
```

La zona queda además en `settings/app.timezone` para que sea **un dato visible y no una
constante enterrada**.

**Sin `weekKey`.** F1 pide reportes por semana, y se resuelven con un rango de `dateKey`
(`>= lunes && <= domingo`), que ordena igual que la fecha porque el formato es
`YYYY-MM-DD`. Añadir un `weekKey` obligaría a fijar una convención de semana ISO y a
migrarla si alguna vez se cambia de criterio, para ahorrar una comparación de strings.

**Por qué tres campos de fecha y no uno.** Una igualdad exacta es más barata y más simple de
indexar que un rango, y las tres consultas más frecuentes son "hoy", "este mes" y "este
año". Es denormalización con propósito: tres strings cortos por venta.

---

## 18. Reportes y comprobantes PDF

### 18.1 La regla que evita la doble contabilización

> **Emitir una gift card no es una venta.** Cuando la tienda vende una tarjeta de Bs 1 000
> **no ha vendido juguetes por Bs 1 000**: ha recibido Bs 1 000 y ha contraído la obligación
> de entregar mercancía por ese valor más adelante. Es un **pasivo** (ingreso diferido), no
> un ingreso.

Por eso la emisión vive en `giftCardIssues` y **no** crea un documento en `sales`. Esa
separación **estructural** es lo que hace que la doble contabilización sea imposible por
diseño, en lugar de depender de que cada consulta recuerde aplicar un filtro.

### 18.2 Las magnitudes y de dónde sale cada una

> **Nota de la Fase 6:** esta tabla es del diseño original de la Fase 4/pre-Fase 6 y
> referenciaba campos de `giftCardIssues` (`initialAmountCents`, `remainingAmountCents`,
> `status != 'cancelled'`) que **ya no existen** con el modelo vigente (§8.8, §16): la
> denominación fija vive en `giftCards.amountCents`/`GiftCardIssue.amountCents` (snapshot),
> y no hay saldo parcial que "quedar pendiente" (consumo total, §16.2). La fila corregida:

| Magnitud | Fuente | Cálculo |
|---|---|---|
| **Mercancía vendida** | `sales` | `Σ totalCents` donde `status == 'completed'` |
| Efectivo recibido en ventas | `sales` | `Σ cashCents` |
| QR recibido en ventas | `sales` | `Σ qrCents` |
| Saldo de gift card consumido | `sales` | `Σ giftCardCents` — **no es dinero nuevo** |
| **Nuevas gift cards vendidas** | `dailySummaries` (§8.7) | `Σ giftCardsIssuedCents` del rango — ya acumulado por `activateGiftCard`, sin leer `giftCardIssues` |
| Efectivo/QR recibido por emisiones | `dailySummaries` | `Σ giftCardIssuesCashCents` / `Σ giftCardIssuesQrCents` (nuevos en Fase 6, §8.7) |
| Saldo no reclamado (*breakage*) | `dailySummaries` | `Σ giftCardForfeitedCents` del rango |
| **Dinero que entró hoy a la caja** | `dailySummaries` | (cashCents + qrCents) + (giftCardIssuesCashCents + giftCardIssuesQrCents) |
| Pasivo pendiente (tarjetas activas con dinero cobrado, sin canjear) | `giftCards` | `count()`/lectura de `where('status','in',['ACTIVE','SUSPENDED'])` × su `amountCents` — **queda pendiente de diseñar en la Fase 7**: no es un acumulado diario, exige recorrer `giftCards` completo (≤ unas decenas de documentos, tramo aceptable a esta escala) |

**Ejemplo resuelto.** Un día con Bs 500 de mercancía vendida (Bs 300 efectivo, Bs 100 QR,
Bs 100 de gift card) en el que además se vendió una tarjeta nueva de Bs 1 000 en efectivo:

| Línea del reporte | Importe | Lectura correcta |
|---|---:|---|
| **TOTAL VENDIDO (mercancía)** | Bs 500 | Juguetes que salieron de la tienda |
| · Efectivo | Bs 300 | Dinero nuevo |
| · QR | Bs 100 | Dinero nuevo |
| · Gift card redimida | Bs 100 | **Cobrado antes** — no vuelve a entrar |
| **NUEVAS GIFT CARDS VENDIDAS** | Bs 1 000 | Dinero nuevo, mercancía todavía no entregada |
| **DINERO RECIBIDO HOY** | Bs 1 400 | 300 + 100 + 1 000. Es lo que debe haber en caja y banco |
| Variación del pasivo | +Bs 900 | +1 000 emitidos − 100 consumidos |

Los dos errores que este diseño hace imposibles: sumar **Bs 500 + Bs 1 000 = Bs 1 500 como
"vendido"** (la tarjeta no es mercancía), y **contar los Bs 100 de gift card como ingreso
del día** (ese dinero entró cuando se vendió la tarjeta). Las dos identidades que siempre
deben cumplirse, y que se muestran **en pantalla** como comprobación:

```
Mercancía vendida  ==  Σ todos los pagos de las ventas          // 500 == 300+100+100 ✓
Dinero recibido    ==  (cash+qr de ventas) + (cash+qr de emisiones)   // 1400 ✓
```

### 18.3 Alcance de los reportes

**Solo admin** (A5: el vendedor *"tampoco [ve] el módulo de pagos"*). Lo que el cliente pidió
(F1): *"lo que gano por día o por una fecha en específico, por semana, mes o año, pero a
detalle de qué productos, la cantidad y total, y un total general de todo"*.

| Vista | Rango | Consulta |
|---|---|---|
| Cierre del día | `dailySummaries/{dateKey}` | **1 lectura por ID** |
| Fecha específica | igual | 1 lectura |
| Semana | 7 `dateKey` consecutivos | **7 lecturas por ID** |
| Mes | `monthKey == '2026-09'` sobre `dailySummaries` | 28–31 lecturas |
| Trimestre / año | rango de `dateKey` sobre `dailySummaries` | 90 / 365 lecturas |
| Rango personalizado | `dateKey >= a && dateKey <= b` | tantas como días |
| Detalle de ventas de un día | `sales where dateKey == …` paginado | 20 por página |
| Por vendedor | `sales where sellerId == …` + rango | índice compuesto (§8.9) |

El **detalle por producto** (código, nombre, cantidad y total) sale del mapa `products` de
los `dailySummaries` del rango, acumulado en el cliente. Ese es el motivo de existir de esa
colección: los `items[]` de una venta **no son agregables** por `sum()` (§19).

Los **totales de dinero** se pueden calcular por dos caminos, y se usan los dos a propósito:
del resumen diario, y con `getAggregateFromServer` + `sum()` sobre `sales` — **la
comparación de ambos es la verificación de integridad** que se muestra en el cierre de caja.
Si no coinciden, hay algo que arreglar y el sistema lo dice en lugar de esconderlo.

**Exportación:** solo **PDF** (F4: *"basta con un PDF"*). Sin Excel ni CSV.

> **Nota de la Fase 7 — implementación real, `features/reports/`.** Un solo
> componente (`ReportsDashboardComponent`) orquesta filtros (presets Hoy/Ayer/
> Últimos 7 días/Este mes + rango personalizado con `p-calendar
> selectionMode="range"`, y un filtro de vendedor opcional), KPIs, las dos
> identidades de §18.2, la verificación de integridad de este apartado,
> desglose de pagos, Gift Cards (inventario/denominaciones — snapshot de HOY,
> reutilizando `GiftCardsService.listAllForSummary()` ya existente, sin
> índices ni consultas nuevas — y actividad del período), detalle de
> activaciones (`giftCardIssues`, paginado), productos más vendidos,
> desglose por vendedor y el detalle de ventas del DÍA (solo cuando el rango
> es un único día, reutilizando `SalesService.createPager` y
> `SaleDetailDialogComponent` tal cual — condición para avanzar de la Fase 4).
> Ningún dato nuevo en Firestore, ninguna Function nueva: todo son lecturas
> con las Rules `isAdmin()` que ya existían.
>
> **Gotcha real de Firestore descubierto en vivo** (no está documentado con
> claridad en la referencia pública): una consulta de agregación con `sum()`
> exige que **cada campo sumado** forme parte del índice compuesto, no solo
> los campos de `where`/`orderBy` — a diferencia de un `count()` simple con
> los mismos filtros, que no lo pide. El primer índice desplegado
> (`sales(status, dateKey)`) quedó `Habilitado` en la consola pero la consulta
> seguía fallando con `failed-precondition`, porque `getSalesIntegrity`/
> `getSellerTotals` además suman `totalCents`/`cashCents`/`qrCents`/
> `giftCardCents`. El índice correcto (§8.9 actualizado) es
> `sales(status, dateKey, cashCents, giftCardCents, qrCents, totalCents)` — y
> su equivalente con `sellerId` al frente para el desglose por vendedor. El
> propio mensaje de error de Firestore trae la forma exacta que hace falta
> (`create_composite=...`), que es como se detectó.
>
> **Gap real encontrado y corregido — no fue un descuadre financiero.**
> `dailySummaries/2026-09-13` (un documento creado antes de que la Fase 6
> añadiera `giftCardIssuesCashCents`/`giftCardIssuesQrCents`, §8.7) no tenía
> esos dos campos: un `update` de Firestore nunca agrega un campo que no
> menciona, y ese día nunca tuvo actividad de gift card que disparara esa
> escritura. Verificado contra `giftCardIssues` (cero documentos con
> `dateKey == '2026-09-13'`) antes de tocar nada — su valor real siempre fue
> 0, así que `dailySummaryConverter` ahora coalesce esos dos campos a `0` al
> leer, igual que ya hace el propio servidor con campos que pueden faltar en
> un documento antiguo (`functions/src/sales.ts`). Ninguna Function, ninguna
> Rule y ningún documento de `dailySummaries` se tocó.
>
> **Verificado en vivo con datos reales de DEV:** la verificación de
> integridad (`dailySummaries` vs. `sum()` en vivo sobre `sales`) coincidió
> exactamente para "Hoy" y para "Últimos 7 días" (21/27 ventas,
> 3 798,00/5 133,00 Bs, sin diferencia en ningún campo); el desglose por
> vendedor de dos vendedores distintos sumó exactamente el total global
> (9 + 12 ventas = 21; 1 495 + 2 303 = 3 798,00 Bs). Un `user` (vendedor)
> confirmado rechazado en las tres vías: sin `/reportes` en el menú, guard
> redirige a `/` por URL directa, y una lectura REST directa a
> `dailySummaries` con su propio ID token devuelve `403
> PERMISSION_DENIED`.

### 18.4 Comprobante PDF

- **Recomendación:** `pdfmake` en el cliente, **hoja carta**, generado bajo demanda desde la
  venta. Entra en la **Fase 4**, no al final: A3 dice que la finalidad es *"imprimir un
  comprobante o un PDF de lo que compró el cliente con el monto total"* — es parte de la
  venta, no un extra.
- **Por qué `pdfmake`:** declarativo (el documento es un objeto JavaScript), soporta tablas
  con anchos automáticos, imágenes en base64 y `pageSize: 'LETTER'`, y ya está probado en un
  proyecto anterior del cliente (MEDIDENT), lo que reduce el riesgo a cero. No necesita
  servidor: el navegador genera el PDF y abre el diálogo de impresión.
- **Descartadas:** *`jsPDF`* — más bajo nivel: las tablas hay que posicionarlas a mano.
  *Imprimir HTML con CSS `@media print`* — es la opción más barata y la descarto porque el
  resultado depende del navegador y de los márgenes que tenga configurados la máquina, y
  porque el cliente quiere **un archivo PDF**, no solo una impresión. *Generar el PDF en una
  Function* — añade latencia y coste para producir algo que el cliente ya puede hacer, y el
  comprobante no necesita firmarse ni archivarse en servidor (no es factura fiscal, A3).
- **Formato: hoja carta, no rollo térmico** (B4: *"no hay impresora [de etiquetas], la idea
  era generar un PDF normal en carta"*). El día que se compre una impresora térmica de 80 mm
  se añade un `pageSize` alternativo; el contenido no cambia.

**Contenido:**

```
[logo]  Mi Pimpollito — JUGUETERÍA
        Artículos y accesorios para Niños
        Calle Tomás Frias entre Av. Antofagasta y Pisagua Nº 100, Oruro
        Tel. +591 77966329 · @mipimpollito
------------------------------------------------------------------
Comprobante de venta          Nº <saleId corto>
Fecha: 15/09/2026 19:42 (La Paz)      Cliente: Anónimo
Atendió: Lenar Lima
------------------------------------------------------------------
Código      Producto            Cant.   P. unit.      Subtotal
MP000123    Auto rojo             2      Bs 50,00     Bs 100,00
7501234...  Peluche oso           1     Bs 120,00     Bs 120,00
------------------------------------------------------------------
                                            TOTAL    Bs 220,00
                          Pago: Efectivo             Bs 220,00
------------------------------------------------------------------
        Gracias por su compra · No se aceptan devoluciones
```

Notas de implementación: el **logo va embebido en base64** en un archivo TypeScript (`pdfmake`
no puede cargar una URL remota de forma fiable y el CSP lo bloquearía); todos los importes
pasan por `fromCents()`; la fecha se formatea desde `createdAt` en `America/La_Paz`, no con la
hora del navegador; la leyenda de devoluciones es literal la política del cliente (C6) y va
en el comprobante para evitar la discusión en el mostrador. El PDF **no se almacena**: se
regenera desde la venta cuando haga falta reimprimirlo, porque la venta es inmutable y el
resultado es idéntico.

---

## 19. Optimización de lecturas y costes

### 19.1 Estimación con el volumen real

Con 10–20 ventas al día (40–90 en Navidad), ~1 000 productos y 1–2 usuarios:

| Operación | Lecturas | Frecuencia | Al mes |
|---|---:|---|---:|
| Arranque de sesión (perfil + settings) | 2 | ~10/día | ~600 |
| Listado de productos (página de 20) | 21 | ~20/día | ~12 600 |
| Escaneo (índice + producto, con caché) | 1–2 | ~60/día | ~3 600 |
| Confirmar venta (dentro de la Function) | ~5 | ~20/día | ~3 000 |
| Cierre del día (resumen diario) | 1–3 | 1/día | ~90 |
| Reporte mensual | ~35 | 2/mes | ~70 |
| **Total aproximado** | | | **~20 000** |

El tramo gratuito de Firestore es de **50 000 lecturas y 20 000 escrituras diarias**. El
consumo mensual previsto cabe en **menos de medio día** de tramo gratuito. **El coste de
Firebase no es un problema en este proyecto, y no debe usarse como argumento para complicar
el diseño.** El presupuesto de Blaze con alerta en USD 5 existe por si un bucle de
desarrollo se descontrola, no porque se espere gasto.

### 19.2 Colecciones de resumen: decisión **revisada**

El plan original decidió **no** introducir colecciones de resumen todavía, con umbrales
explícitos de activación. **Las respuestas del cliente cruzaron uno de esos umbrales**, y la
decisión vigente es la contraria:

- **F1 pide detalle por producto** (código, cantidad, total) para día, semana, mes **y año**.
- Los `items[]` de una venta **no son agregables**: `sum()` suma un campo numérico de nivel
  superior, no un campo dentro de un array de objetos. El detalle por producto **obliga** a
  recorrer las ventas del rango.
- **C1 confirma 40–90 ventas/día en campaña.** Un año son ~4 000–8 000 ventas. Un reporte
  anual por producto sin resumen significa paginar miles de documentos cada vez que el dueño
  lo abra.

**Decisión vigente:** `dailySummaries/{dateKey}` (§8.7), mantenido por `createSale` y
`cancelSale` **dentro de la misma transacción**. Escribe en Fase 4, se lee en Fase 7.

- **Coste:** +1 escritura por venta (~90/día en el peor caso, sobre 20 000 diarias gratuitas).
- **Beneficio:** el reporte anual por producto pasa de ~8 000 lecturas a **365**; el mensual,
  de ~2 700 a **31**; el semanal a **7**; el diario a **1**.
- **El riesgo real es la segunda fuente de verdad**, y se mitiga de dos formas: el resumen se
  escribe **en la misma transacción** que la venta (no puede quedar a medias), y el cierre de
  caja **compara** el resumen contra `sum()` sobre `sales` y avisa si difieren (§18.3).
- **Lo que sigue postergado:** `monthlySummaries` y `yearlySummaries`. Con los diarios, un año
  son 365 lecturas por ID; un resumen mensual ahorraría 353 lecturas al año. No se justifica.
  *Se reabre si* un reporte anual llegara a resultar lento en la práctica.

### 19.3 Las reglas de disciplina

Son la parte del documento que hay que respetar en **cada** fase. La mayoría de los
problemas de coste en Firestore no vienen del volumen: vienen de romper una de estas siete.

1. **Nunca `getDocs()` sobre una colección sin `limit()`.** Ni en desarrollo, ni "para
   probar", ni en un `console.log`. Un `getDocs(collection(db,'products'))` son 1 000
   lecturas cada vez que se recarga la página.
2. **Paginación por cursores en todo listado**, desde el primero (§12).
3. **`getDoc` por defecto; `onSnapshot` solo donde el tiempo real aporta algo.** Hoy solo
   aporta en un sitio: la cadena de sesión, para que una desactivación surta efecto en
   caliente. El catálogo y las ventas **no** necesitan listeners: un listener abierto sobre
   una consulta de 20 productos vuelve a cobrar lecturas cada vez que alguien edita uno.
4. **Denormalizar los snapshots** (`sellerName`, nombre y precio del producto en el ítem) para
   que ningún reporte tenga que leer otra colección.
5. **Agregaciones de servidor** (`getCountFromServer`, `sum()`) en lugar de descargar para
   contar o sumar.
6. **Caché en memoria de lo que no cambia durante la sesión**: `settings/app`, y el
   `Map<code, productId>` del POS.
7. **Un `withConverter` por colección**, para que nadie improvise la forma de los datos en un
   componente.

### 19.4 App Check y protección del proyecto

- **App Check con reCAPTCHA v3** protege Firestore, Storage y Functions de ser invocados
  desde fuera de la aplicación. **Se evalúa en la Fase 8** (auditoría de seguridad), no antes:
  activarlo mal bloquea la aplicación entera, y durante el desarrollo exige tokens de debug
  en cada máquina. *Recomendación:* activarlo en DEV primero, comprobar que todo sigue
  funcionando, y solo después en PROD.
- **Alerta de presupuesto en USD 5** desde la Fase 0B. Es la red de seguridad real.
- **Deshabilitar la auto-creación de cuentas** en Authentication → Settings → *User actions*
  (la opción que impide el *sign-up* desde el cliente). **Pendiente de verificar en DEV**: la
  configuración registrada en §5.4 confirma que solo Email/Password está habilitado, pero no
  se ha comprobado ese interruptor. Sin él, cualquiera con el `apiKey` —que es público—
  podría crear una cuenta de Authentication; no accedería a nada por falta de documento en
  `users` (§7.1), pero ensuciaría el proyecto. **Se comprueba al ejecutar la Fase 0B** y se
  vuelve a comprobar en la auditoría.

---

## 20. Hosting y CI/CD

### 20.1 Hosting

`firebase.json` con reescritura de SPA y cabeceras de caché:

```json
{
  "hosting": {
    "public": "dist/pimpollo-frontend/browser",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "**/*.@(js|css|woff2|webp|png|jpg|svg)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
      { "source": "/index.html",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  }
}
```

Las dos cabeceras son un par: los assets llevan hash en el nombre (`outputHashing: all`), así
que pueden cachearse para siempre; `index.html` **no** lleva hash y es quien apunta a los
assets nuevos, así que **nunca** debe cachearse. Con `index.html` cacheado, un despliegue no
llega a los navegadores que ya visitaron la página y aparece el clásico "a mí no me
funciona, recarga con Ctrl+F5".

La reescritura `** → /index.html` es lo que hace que `/ventas` funcione al escribirlo
directamente en la barra de direcciones. Sin ella, Hosting devuelve 404 para toda ruta que no
sea un archivo.

### 20.2 CI/CD

- **Recomendación:** GitHub Actions con `FirebaseExtended/action-hosting-deploy`.
  `main` → **PROD**; `develop` → **DEV**; un Pull Request → **canal de preview en DEV**.
  Y un **primer despliegue manual a DEV adelantado a la Fase 1B**.
- **Por qué las previews en DEV y no en PROD:** un canal de preview usa el mismo proyecto
  Firebase que el sitio principal, es decir **la misma base de datos**. Una preview sobre PROD
  daría a una rama sin revisar acceso de escritura a los datos reales de la tienda. Sobre DEV
  no importa.
- **Por qué un despliegue manual temprano:** los problemas de Hosting —rutas que devuelven
  404, `index.html` cacheado, el `outputPath` equivocado, el dominio de Auth sin autorizar—
  aparecen en el **primer** despliegue, no en el décimo. Descubrirlos en la Fase 1B, cuando
  solo hay un login, cuesta minutos; descubrirlos en la Fase 9 con todo el sistema encima
  cuesta una tarde.
- **El secreto de despliegue lo genera el propio cliente** ejecutando
  `firebase init hosting:github`, que crea el service account y lo guarda como secreto del
  repositorio **sin que ningún JSON pase por ninguna conversación**. Esto es coherente con la
  restricción de seguridad del proyecto: nunca se solicitan credenciales, y nadie más que el
  dueño de la cuenta las manipula.

```yaml
# .github/workflows/deploy-prod.yml   (esquema · Fase 9)
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx ng build                      # configuración production por defecto
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_MI_PIMPOLLITO }}
          channelId: live
          projectId: mi-pimpollito
```

Las Rules y los índices **se despliegan con el código**, no por consola:

```
firebase deploy --only firestore:rules,firestore:indexes,storage -P dev
```

Si una regla se cambia por consola, DEV y PROD divergen y el repositorio deja de ser la
verdad. Es el mismo principio que los índices (§8.9).

### 20.3 Los dos documentos heredados en `docs/`

`docs/CI-CD-PIPELINE.md` y `docs/DEPLOYMENT-PROTOCOL.md` describen el despliegue de SAHTOSO
(servidor propio, API REST). **Se reemplazan en la Fase 0A** por una versión corta que
describa el despliegue real de este proyecto, o se eliminan y su contenido vive en esta
sección. No se tocan en esta tarea.

---

## 21. Decisiones arquitectónicas aprobadas

Todas están **tomadas**. Las marcadas con **⟳** cambiaron respecto al plan original por una
respuesta del cliente, y el motivo está en §2.1.

| | Decisión | Opción elegida | Motivo | Fase | Riesgo si se ignora |
|---|---|---|---|---|---|
| 1 | **Estado de autenticación en Angular** | `authState → switchMap → docData(users/{uid})` con `shareReplay(1)`; el guard devuelve el Observable | Elimina por construcción el bug de recarga en frío. Sin temporizadores ni orden de inicialización | 1 | **Crítico** — el bug de MEDIDENT, y contamina todas las fases siguientes |
| 2 | **Gestión de cuentas de Firebase Auth** | Cloud Functions callables con Admin SDK (`createUser`, `updateUserAuth`, `setUserActive`) | Es lo único que permite editar el correo de otro usuario, deshabilitar su cuenta, escribir claims y verificar el rol en servidor | 2 | **Alto** — creación de cuentas sin control de rol y desincronización de correo |
| 3 | **ID del documento de usuario** | `users/{firebaseAuthUid}`, sin almacenar el campo `uid` | 1 `getDoc` por sesión, sin índice; y la Rule `request.auth.uid == userId` sin lecturas extra | 1 | Medio — consultas e índices innecesarios, riesgo de duplicados |
| 4 | **Modelo de permisos** | `role: 'admin' \| 'user'` con menú declarativo y `roleGuard`; se elimina el sistema bitwise por recurso | Dos roles no necesitan una matriz de permisos, y la heredada no se puede proyectar a Firestore Rules | 2 | Medio — complejidad permanente y seguridad solo de fachada |
| 5 | **Custom claims** | Espejo de `role` en el claim, usado **solo** en Storage Rules | Las Storage Rules no pueden consultar Firestore. Firestore Rules y Functions leen el documento, que está fresco | 2 | Medio — o subidas abiertas a cualquier autenticado, o autorización con hasta 1 h de desfase |
| 6 | **Recuperación de contraseña** | `sendPasswordResetEmail()` con plantilla personalizada en consola | Firebase ya emite el correo, el token de un solo uso y la pantalla, con protección contra enumeración | 1 | Medio — reimplementar gestión de tokens es superficie de seguridad nueva |
| 7 | **Paginación en Firestore** | Cursores con pila en memoria + `getCountFromServer()`; paginador sin salto de página | Coste constante por página. El conteo cuesta 1 lectura por millar y permite una UI completa | 2 | Medio — degradación silenciosa; la salida fácil es descargar la colección |
| 8 | **Búsquedas** | Prefijo sobre campos normalizados (`nameLower`, `searchName`, `emailLower`) con `startAt`/`endAt` | Es la única búsqueda que Firestore resuelve en el índice. Algolia es desproporcionado para 1 000 productos | 2–3 | Medio — o búsquedas que descargan la colección, o una dependencia externa innecesaria |
| 9 | **ID del documento de producto** | Auto-ID de Firestore | Identidad estable a la que apuntan las ventas históricas, independiente de una etiqueta que cambia | 3 | Medio — reetiquetar obliga a migrar el documento y rompe referencias |
| 10 | **Búsqueda por código de barras** | `products/{autoId}` + índice `barcodes/{code} → {productId}`, con caché en memoria | Unicidad garantizada por el ID del documento, varios códigos por producto, y el código se puede cambiar | 3 | Medio — con query por campo, dos productos pueden compartir código y se cobra el juguete equivocado |
| 11 ⟳ | **Códigos internos y etiquetas** | Generador `MP` + secuencial vía `counters/internalCode`; **Code 128**; hoja de etiquetas en PDF carta | B3: el 10% de los juguetes no trae código. Code 128 lo lee cualquier lector HID; inventar EAN-13 colisionaría con códigos ajenos | 3 | Medio — el 10% del catálogo queda sin poder escanearse |
| 12 | **Imagen de producto obligatoria** | `imagePath` no vacío validado en Rules; compresión a WebP en el cliente; **nunca base64 en Firestore** | Un documento de Firestore tiene 1 MiB: una imagen en base64 lo agota y encarece cada lectura del catálogo | 3 | **Alto** — catálogo ilegible y coste de lecturas multiplicado |
| 13 ⟳ | **Quién crea y edita productos** | El vendedor **crea** y edita lo no sensible; **solo el admin** cambia precio, código y estado | A5/G3 piden que el vendedor cargue catálogo; dejarle el precio abriría un camino para vender barato | 3 | Medio — o el vendedor no puede trabajar, o puede alterar precios |
| 14 | **Representación del dinero** | Enteros en centavos (`priceCents`, `totalCents`, `amountCents`) | Elimina el error de punto flotante, permite `sum()` exacto, y migrar después obliga a reescribir ventas históricas | 3 | **Alto** — descuadres de centavos en el cierre de caja |
| 15 | **Transacción de stock** | `runTransaction` dentro de la Function `createSale`, con `.create()` idempotente | Hay que leer el stock para validarlo, y las Rules no pueden sumar arrays: la integridad solo se garantiza en servidor | 4 | **Crítico** — ventas sin descuento de stock, o totales manipulables por el vendedor |
| 16 ⟳ | **Vender sin stock** | **Permitido por defecto**, gobernado por `settings.allowSaleWithoutStock`; el stock **puede quedar negativo** | C4: *"por defecto que deje vender"*. La Rule de `products` no puede exigir `stock >= 0` | 4 | Medio — o se bloquea una venta real, o un producto con stock negativo no se puede volver a guardar |
| 17 | **Pagos de la venta** | `payments[]` + `paymentMethods[]` + `cashCents`/`qrCents`/`giftCardCents` | El pago mixto es inevitable con gift cards; Firestore no filtra dentro de arrays de objetos ni agrega dentro de ellos | 4 | **Alto** — migración de esquema con ventas históricas ya existentes |
| 18 | **Claves de fecha** | `dateKey`/`monthKey`/`year` calculados en la Function en `America/La_Paz` | UTC−4 desplaza todas las ventas de la tarde al día siguiente | 4 | **Alto** — el cierre de caja nunca cuadra y el error es difícil de ver |
| 19 ⟳ | **Anulación de ventas** | `cancelSale` (Function, solo admin) **en la Fase 4**; `status: 'cancelled'`, nunca borrado | C6 (no hay devoluciones) + C7 (solo admin anula) la convierten en el único mecanismo de corrección | 4 | **Alto** — un error de registro sin remedio, o ventas borradas a mano |
| 20 | **Comprobante PDF** | `pdfmake` en el cliente, hoja **carta**, en la Fase 4 | A3/B4: imprimir el comprobante es la finalidad declarada del sistema, no un extra | 4 | Medio — el sistema no cubre lo que el cliente pidió primero |
| 21 ⟳ | **Voucher de pago QR** | `voucherStatus: 'pending' \| 'uploaded'`; se adjunta después vía `attachVoucher`, desde el celular; inmutable | La foto está en un celular y el POS es una laptop: exigirla bloquearía el mostrador | 5 | Medio — ventas QR sin evidencia, o vendedor bloqueado con el cliente delante |
| 22 ⟳ | **Gift card: consumo** | **Total**, sin saldo remanente (`giftCardAllowsPartial: false`); el sobrante se extingue como movimiento `forfeit` | E3/E4. El `forfeit` es lo que mantiene `Σ payments == totalCents` sin perder el rastro del dinero | 6 | **Alto** — o el invariante de caja se rompe, o el sobrante desaparece sin registro |
| 23 ⟳ | **Modelo de gift card** | Tres colecciones: `giftCards` (plástico, denominación fija) · `giftCardIssues` (un ciclo de uso) · `giftCardMovements` (libro mayor), con `cycleNumber`/`activeCycleId` como mecanismo anti-carrera (reemplaza `activeIssueId` + importe libre del diseño original — ver §16 reescrito en la Fase 6) | Separa el plástico del ciclo, permite reutilizar la tarjeta sin arrastrar historial, hace el historial auditable, y cierra la carrera entre ciclos que el diseño original no contemplaba | 6 | **Alto** — estado no explicable, imposibilidad de reutilizar el plástico, o doble gasto entre ciclos |
| 24 | **Estrategia de reportes** | Emisión de gift card fuera de `sales`; dos identidades verificadas en pantalla | La separación estructural hace imposible la doble contabilización, en lugar de depender de recordar un filtro | 7 | **Alto** — decisiones de negocio sobre cifras infladas |
| 25 ⟳ | **Colecciones de resumen** | **Sí**: `dailySummaries/{dateKey}` escrito por la Function. Mensual y anual siguen postergados | F1 pide detalle por producto hasta el año, y los `items[]` no son agregables. C1 confirma ~8 000 ventas/año | 4 escribe · 7 lee | Medio — reportes anuales que paginan miles de documentos |
| 26 ⟳ | **Lectura de ventas por rol** | El vendedor ve **solo sus ventas del día**; el admin ve todas | A5/C5. Se aplica en la Rule, no solo en la consulta | 4 | Medio — un token comprometido lee toda la facturación |
| 27 | **Borrado** | Soft delete con `isActive` en `users` y `products`; `delete` denegado en Rules. Las ventas nunca se borran: `status: 'cancelled'` | Una venta de hace un año debe seguir siendo legible aunque el producto ya no se venda y el vendedor no trabaje aquí. Los snapshots hacen que nada se rompa | 2–4 | **Alto** — historial de ventas con referencias roídas e irreparables |
| 28 | **Cloud Functions** | Sí, un `functions/` pequeño: administración de Auth, ventas, vouchers y gift cards. Nada más | Cubre exactamente lo que el cliente no puede hacer con seguridad. Firestore sigue siendo el backend principal | 2 | **Crítico** — sin esto no hay forma de garantizar integridad de dinero ni stock |
| 29 | **Estrategia DEV/PROD** | Dos proyectos; `environment.ts` = DEV como base; `fileReplacements` solo en `production`; interfaz `AppEnvironment` obligatoria; badge de ambiente | El tipo hace que comentar un campo rompa la compilación: el patrón de MEDIDENT deja de ser posible | 0B | **Alto** — escribir en PROD creyendo estar en DEV |
| 30 ⟳ | **Región de Firestore** | **`southamerica-west1`** (Santiago). Ya aplicada en DEV; PROD usará la misma | Latencia desde Bolivia, que se nota en el mostrador. Es **inmutable** tras crear la base. Las Functions van en la misma región | 0B | Medio — irreversible sin recrear el proyecto |
| 31 | **Región de Cloud Storage** | **`US-CENTRAL1`**, Standard — distinta de Firestore, a propósito | Es la región con cuota gratuita de Cloud Storage. El coste es que las imágenes viajan desde EE. UU., por eso la compresión en el cliente (§9.2) no es negociable | 0B | Bajo — la ubicación de un bucket es inmutable |
| 32 | **Proveedores de Authentication** | **Solo Email/Password.** Google Sign-In, email link y MFA deshabilitados | Las cuentas las crea un admin (§7). Google Sign-In permitiría a cualquiera crear una sesión de Auth sin acceso real, ensuciando el proyecto | 0B | Medio — cuentas de Auth que nadie dio de alta |
| 33 ⟳ | **PROD mientras `mi-pimpollito` no exista** | **`environment.production.ts` existe y `ng build` (production) compila**, pero su `firebase` apunta **temporalmente** a `mi-pimpollito-dev` — mismo aviso explícito dentro del archivo. `.firebaserc` sigue con solo el alias `dev`. El badge de ambiente se deriva de `firebase.projectId`, no de `name`/`production` (§5.1) | Google tarda ~30 días en permitir crear `mi-pimpollito`; bloquear el build de producción todo ese tiempo costaba más que ser explícito sobre qué backend se usa de verdad | 0B (revisión: cuando exista `mi-pimpollito`) | Medio — mitigado por el badge visible en todo build y por el comentario en el propio archivo; el riesgo real sería *fingir* un PROD sin decirlo |
| 34 | **SDK de Firebase en Angular** | `@angular/fire@^18` | Wrappers zone-aware (el proyecto usa zone.js) y adaptadores a Observable, que son las piezas del pipeline de sesión | 0B | Medio — bugs intermitentes de detección de cambios |
| 35 ⟳ | **Internacionalización** | **Se conserva `ngx-translate`** con `es.json` como catálogo central de textos; solo español. Los textos se resuelven con el **pipe**, nunca en `translate.get().subscribe()` | Decisión del cliente: evitar strings sueltos en los componentes. El coste real del patrón heredado estaba en construir modelos dentro de un `subscribe`, no en la librería | 0A | Medio — o strings repartidos por el código, o el sidebar vacío en el arranque si se vuelve al `subscribe` |
| 36 | **Estrategia CI/CD** | `main` → PROD · `develop` → DEV · PR → preview **en DEV**. Despliegue manual adelantado a la Fase 1B | Las previews sobre PROD darían a ramas sin revisar acceso a los datos reales. El despliegue temprano revela los problemas de Hosting cuando son baratos | 1B / 9 | Medio — problemas de hosting descubiertos tarde, o previews escribiendo en producción |
| 37 | **Security Rules** | Se escriben **junto a cada fase**, con cierre explícito `match /{document=**} { allow read, write: if false; }` | Dejarlas para el final significa desarrollar meses contra una base abierta y descubrir al final qué se rompe al cerrarla | cada fase | **Crítico** — base de datos abierta en producción |

---

## 22. Decisiones pendientes

> **No existen decisiones bloqueantes para iniciar la Fase 0A.**

Las ocho decisiones que el plan original dejó pendientes quedaron **todas resueltas** por el
cuestionario:

| Pendiente original | Resuelta por | Resultado |
|---|---|---|
| ¿Vender con stock insuficiente? | C4 | Sí, por defecto. `settings.allowSaleWithoutStock` |
| ¿Gift card con consumo parcial? | E3, E4 | No. Consumo total + `forfeit` |
| ¿Códigos EAN, internos o ambos? | B3 | Ambos, con generador e impresión de etiquetas |
| ¿Las gift cards caducan? | E5 | No. `expiresAt` reservado sin lógica |
| ¿El vendedor ve todas las ventas? | A5, C5 | Solo las suyas del día |
| Región de Firestore | decisión técnica | **`southamerica-west1`** · ya aplicada en DEV (§5.4) |
| ¿Cuántos usuarios y puestos? | A4, C2 | 1 usuario inicial, 1 puesto |
| ¿Dominio propio? | A8 | No por ahora; `*.web.app` sirve |

Quedan **tres asuntos menores, ninguno bloqueante**, que se deciden dentro de su fase y no
antes porque hoy no hay información que los haga urgentes:

| # | Asunto | Estado | Se decide en |
|---:|---|---|---|
| 1 | **Descuentos manuales en la venta** (B7 quedó sin responder) | No se implementan. Si aparecen, el lugar es `discountCents` por línea y por venta, con `totalCents` siempre autoritativo | Fase 4, si el cliente lo pide |
| 2 ✅ | **Tarjeta física perdida con saldo** (E8 quedó sin responder) | **Resuelta en la Fase 6, en vivo:** nuevo estado `SUSPENDED` (`suspendGiftCard`, staff) bloquea la tarjeta sin cerrar el ciclo — `reactivateGiftCard` la recupera con el mismo ciclo si aparece; `cancelGiftCard` (solo admin) la da de baja definitiva si la pérdida es total. Ver §16.4, §16.11 | Fase 6 — implementada |
| 3 | **Activar App Check** | Recomendado, pero se activa primero en DEV y se verifica antes de PROD | Fase 8 |

### 22.1 Un bloqueo externo, real, que ya no bloquea el build de producción

**`mi-pimpollito` (PROD) no se puede crear todavía: Google tarda ~30 días por el límite de
proyectos de la cuenta** (§5.5). No es una decisión pendiente —está decidido qué hacer,
incluida la corrección del 2026-09-12— sino un hecho de la cuenta que se resuelve fuera del
código, con una fecha aproximada.

| | |
|---|---|
| **Qué bloquea hoy** | Únicamente el **despliegue a un Firebase de producción real**, al cerrar la Fase 5 |
| **Qué NO bloquea** | Todo lo demás. Desde el 2026-09-12, ni siquiera el build de producción de Angular: `ng build` compila y apunta —temporalmente y a propósito— a `mi-pimpollito-dev` (§5.5) |
| **Cómo se acorta** | Eliminar definitivamente un proyecto en desuso (los borrados siguen contando ~30 días, así que no acelera de inmediato) o pedir aumento de cuota en la consola de Google Cloud |
| **Qué sigue prohibido** | Que el build de producción **finja** hablar con un PROD real: el archivo declara explícitamente que es temporal, y el badge de ambiente lo hace visible en pantalla |
| **Cuándo hay que revisarlo** | En ~30 días desde el 2026-09-12, y de todos modos antes de terminar la Fase 5 |

La disponibilidad del ID `mi-pimpollito-dev` ya está **confirmada**: el proyecto existe y
`firebase projects:list` lo reconoce. La del ID `mi-pimpollito` se verificará al crearlo; si
estuviera tomado, se elige otro y **se actualiza este documento**.

### 22.2 Bloqueo activo — la API key de Authentication, rechazada (2026-09-12)

> **Este es, a día de hoy, el único bloqueante real para terminar de verificar la Fase 1.**

Al conectar el login real contra Firebase (plan §6.5), **toda** llamada a Firebase
Authentication —`signInWithEmailAndPassword`, y por la misma causa
`sendPasswordResetEmail`— falla con:

```
auth/api-key-not-valid.-please-pass-a-valid-api-key.
```

Confirmado con `curl` directo contra `identitytoolkit.googleapis.com`, fuera de Angular y
del navegador — no es un bug del cliente. La misma API key **sí funciona** contra
Firestore (`firestore.googleapis.com` devuelve `PERMISSION_DENIED` de las Rules, no un
rechazo de la key), lo que acota el problema a la API de Identity Toolkit específicamente,
no a la key en general ni al proyecto.

| | |
|---|---|
| **Qué bloquea** | Cualquier operación de Firebase Authentication desde el cliente: login y recuperación de contraseña |
| **Qué NO bloquea** | Firestore (confirmado funcionando con las Rules de esta fase), el resto de la app, los builds |
| **Diagnóstico más probable** | La API "Identity Toolkit API" no está habilitada para el proyecto en Google Cloud Console, o la Web API Key tiene una restricción de "API restrictions" que no incluye esa API |
| **Cómo revisarlo** | Google Cloud Console → el proyecto `mi-pimpollito-dev` → *APIs & Services* → *Credentials* → abrir la key que empieza por `AIzaSyDFJl...` → en *API restrictions*, confirmar que "Identity Toolkit API" (y idealmente "Token Service API") están permitidas, o que la key no tiene restricciones. Alternativa: *APIs & Services* → *Library* → buscar "Identity Toolkit API" → confirmar que aparece como "Habilitada" |
| **Quién puede resolverlo** | Solo el dueño de la cuenta de Google Cloud — es configuración de consola, no de código |
| **Qué se hace en cuanto se resuelva** | Repetir exactamente la Fase 1: login válido, hard reload, logout, `isActive`, forgot password. Ningún código cambia |

---

## 23. Roadmap por fases

**Regla de trabajo:** una fase por sesión, en orden, cada una con su propio prompt. **No se
implementa una fase futura por adelantado**, ni "de paso". Cada fase termina con sus
criterios de aceptación verificados.

### 23.1 Cambios de numeración respecto al artefacto original

| Artefacto original | Aquí | Motivo |
|---|---|---|
| Fase 8 — Comprobante PDF | **dentro de la Fase 4** | A3/B4: imprimir el comprobante es la finalidad declarada del sistema, no un extra posterior |
| Fase 9 — Auditoría de seguridad | **Fase 8** | consecuencia del cambio anterior |
| Fase 10 — CI/CD | **Fase 9** | idem |

Las fases 0A, 0B, 1, 1B, 2, 3, 4, 5, 6 y 7 conservan su número.

### 23.2 Corte de MVP y fecha objetivo

El cliente quiere terminar **este mes** (G4, y hoy es 2026-09-12). Eso obliga a un corte
explícito, porque el sistema es vendible sin gift cards ni reportes, pero no sin ventas:

| Bloque | Fases | Qué habilita |
|---|---|---|
| **MVP — salida a producción** | 0A · 0B · 1 · 1B · 2 · 3 · 4 · 5 | Login, usuarios, catálogo, punto de venta con lector, efectivo y QR, comprobante PDF |
| Segunda entrega | 6 · 7 | Gift cards y reportes con cierre de caja |
| Endurecimiento | 8 · 9 | Auditoría de seguridad y despliegue automático |

**El camino crítico no es el código: es la carga de 500–1 000 productos a mano** (B1, B2).
Puede empezar en cuanto la Fase 3 esté desplegada en DEV, y correr en paralelo a las Fases 4
y 5. Retrasarla hasta el final hace imposible cualquier fecha. Ver §24.

> **Segundo camino crítico, externo al código:** la salida a producción **frente a
> clientes reales** exige que `mi-pimpollito` exista, y Google tarda ~30 días en permitirlo
> (§5.5, §22.1). Eso ya no bloquea `ng build` —desde el 2026-09-12 el build de producción de
> Angular compila y funciona, temporalmente contra `mi-pimpollito-dev` (§5.5)—, pero sigue
> siendo cierto que **el negocio no puede abrir con datos reales hasta que exista un Firebase
> de producción separado**. Conviene liberar la cuota de proyectos mientras se trabaja en las
> Fases 1 a 4, no al final.
>
> Y una advertencia sobre la carga del catálogo, que sigue vigente exactamente igual: todo lo
> que se cargue hoy —sea con el build de desarrollo o con el de producción— vive en el mismo
> y único proyecto, `mi-pimpollito-dev`. Si se cargan los 1 000 productos ahí y después se
> crea el `mi-pimpollito` real, **esos datos no se mueven solos**. O se espera a tener el
> PROD real para cargar en serio, o se acepta que habrá que repetir la carga (o exportar e
> importar con el Admin SDK, que es trabajo no planificado). **Es una razón más para acortar
> la espera de ~30 días si es posible.**

### 23.3 Dependencias entre fases

```
0A ──► 0B ──► 1 ──► 1B ──► 2 ──► 3 ──► 4 ──► 5 ──► 6 ──► 7 ──► 8 ──► 9
                                  │            └──────────────┘
                                  └─► carga manual del catálogo (en paralelo)
```

Nada se puede adelantar salvo la carga del catálogo. La Fase 4 depende de la 3 (necesita
productos y códigos), la 6 depende de la 4 (el canje ocurre dentro de `createSale`) y la 7
depende de la 6 (el reporte separa mercancía de gift cards).

---

### FASE 0A — Limpieza controlada del proyecto heredado

- **Objetivo.** Convertir el fork de SAHTOSO en un proyecto Angular 18 limpio con la
  identidad de Mi Pimpollito, sin tocar nada de Firebase todavía.
- **Dependencias.** Ninguna. **Es la primera.**
- **Alcance.**
  1. **Commit previo obligatorio** de los cambios sin confirmar (`login.component.html`,
     `login.component.scss`, las tres imágenes modificadas y las tres sin rastrear), para que
     todo lo que se borre a continuación sea recuperable con `git`.
  2. Renombrar el proyecto: `package.json → "name": "pimpollo-frontend"`,
     `angular.json → projects.pimpollo-frontend`, `outputPath: dist/pimpollo-frontend`,
     `AppComponent.title`.
  3. Eliminar los features de dominio ajeno: `projects`, `roles`, `theme`,
     `web-map-service`, `audit`, `system-configs` (~221 archivos).
  4. Eliminar `core/services/base-http*`, `session.service.ts`, `auth.service.ts`,
     `core/guards/*`, `core/interceptors/auth.interceptor.ts`, `websocket.service`.
  5. Podar `shared/components/ui`: quitar `map`, `flow-status*`, `audit-observations`,
     `task-priority-chip`. **Conservar** search-bar, spinner, field-error, title-bar,
     input-file y el resto.
  6. Desinstalar las ~18 dependencias de §4.4 y quitar sus entradas de `angular.json → styles`.
  7. ~~Retirar `@ngx-translate` y `src/assets/i18n`~~ → **revertido por decisión del cliente
     (§4.5)**: la librería y `src/assets/i18n/es.json` se conservan como catálogo central de
     textos. Lo que sí se elimina es el patrón `translate.get('app').subscribe()` del menú.
     La traducción de PrimeNG queda como objeto estático en `core/config`.
  8. Eliminar `src/assets/geovisor`.
  9. Repaletizar `tailwind.config.js` a los tokens de marca (§4.7); eliminar el bloque
     `clire: {...}`. **Mantener** `styles.scss` sin `@tailwind base`.
  10. Optimizar assets: fondos y logo a WebP; eliminar `background3/4` y `logo2/3`
      (`logo.png` es el final, G5).
  11. Unificar a standalone los componentes conservados; eliminar los `NgModule` por feature.
  12. Bajar los presupuestos de bundle a 1 MB warning / 2 MB error.
  13. Reemplazar o eliminar `docs/CI-CD-PIPELINE.md` y `docs/DEPLOYMENT-PROTOCOL.md`.
- **Cambios esperados.** Borrados masivos en `src/app/features`, `src/app/core` y
  `src/assets`; `package.json`, `angular.json`, `tailwind.config.js`, `app.config.ts` y
  `app.routes.ts`. **`login.component.html` y `login.component.scss` no se tocan.**
- **Seguridad.** Ninguna superficie nueva. El riesgo es de *disponibilidad*: romper la
  compilación. Se mitiga con el commit previo y trabajando en una rama.
- **Pruebas.** `npm ci` limpio · `ng build` sin errores · `ng serve` levanta y la pantalla de
  login se ve correcta con la identidad nueva · ninguna referencia residual a
  `API_URL`, `RESOURCES`, `SessionService` heredado o `translate`.
- **Criterios de aceptación.**
  - [ ] `git status` limpio antes de empezar a borrar (commit hecho).
  - [ ] `ng build` compila sin errores ni warnings de dependencias faltantes.
  - [ ] Bundle inicial por debajo de 1 MB.
  - [ ] `grep -r "sahtoso\|clire\|leaflet\|translate" src/` no devuelve nada relevante.
  - [ ] La pantalla de login se ve exactamente como el diseño aprobado.
  - [ ] `src/assets/images` pesa menos de 1 MB.
- **Condición para avanzar.** El proyecto compila, arranca y no queda código de dominio
  ajeno. Se hace commit de la limpieza **antes** de la Fase 0B.

#### Registro de ejecución (2026-09-12) — hechos descubiertos

La Fase 0A se ejecutó en la rama `phase-0a-cleanup`. Ocho hechos obligan a corregir lo que
este documento decía:

1. **`logo2.png` NO se puede eliminar.** El item 10 decía "eliminar `logo2/3`", pero el login
   aprobado lo usa como avatar de la jirafa (`login.component.html:121`). Se eliminaron solo
   `background3.png`, `background4.png` y `logo3.png`, que no tienen ninguna referencia.
2. **`features/users` y `features/profile` se eliminaron**, en lugar de conservarse como
   "Adaptar". Su UI entera depende de `BaseHttpService`, `SessionService` y `RESOURCES`, que
   esta fase borra: mantenerlas habría obligado a conservar toda la pila REST. **La
   referencia visual vive en git** (`git show 92bf47b:src/app/features/users/...`) y la Fase 2
   las reconstruye sobre Firestore, que es lo que el plan ya preveía para el servicio.
3. **`features/home` era contenido institucional de ABT** (misión, visión, valores,
   "qué es ABT", pestañas de presupuesto) con redirecciones por rol, no un dashboard vacío.
   Se eliminó y se creó `features/home/home.component.ts` como **placeholder temporal**, que
   se reemplaza cuando exista el Inicio real.
4. **`shared/components/ui/input-file` (+ previewers) se eliminó.** Su función es subir por
   `AttachmentService` contra la API REST; sin ese servicio es un componente que no puede
   funcionar. La Fase 3 construye el subidor contra Storage con `image-compressor.service.ts`,
   que de todos modos es otro componente. Se retiró también `ng2-pdf-viewer`.
5. **`@ngx-translate` se retiró y el cliente lo revirtió el mismo día.** Primero se comprobó
   que el uso era mucho más amplio de lo previsto —no solo el menú: el pipe `translate` lo
   usaban **siete** componentes de `shared` (field-error, search-bar, items-not-found,
   cards-paginator, icons-dropdown, title-list, unauthorized), la directiva `truncate-toggle`
   y `ToastService`—. Tras la decisión de **conservar la librería como catálogo central de
   textos** (§4.5), todos ellos volvieron al pipe y `ToastService` volvió a recibir una clave.
   **Lo que no volvió** es el patrón `translate.get('app').subscribe()` del menú: las
   etiquetas son claves y las resuelve el pipe en la plantilla.
6. **La paleta del layout no estaba en Tailwind.** Vive en
   `src/assets/layout/styles/theme/tailwind-light/theme.css` como un bloque de variables CSS
   `--clire-*`, renombrado a `--pimpollito-*` y repaletizado. `--sidebar-bg`,
   `--sidebar-item-hover` y `--sidebar-item-active` estaban **declaradas y sin usar**: el
   sidebar se pintaba con `--primary-default`. Ahora `_menu.scss` usa `--sidebar-bg`.
7. **Decisión visual tomada:** topbar **rojo** (coherente con el login aprobado, que es
   rojo-dominante) y sidebar **carbón** con el ítem activo en dorado. §4.7 decía carbón para
   ambos; cambiar el topbar a carbón es una línea en `topbar.component.html` si se prefiere.
8. **Presupuesto `anyComponentStyle` subido de 10 kB a 60 kB de error / 12 kB de aviso.**
   `login.component.scss` compila a 10,7 kB y es diseño aprobado que no va a encogerse: con
   el presupuesto anterior el build de producción fallaba.

**Resultado:** 398 archivos eliminados · 57 modificados · 4 nuevos.
Build de producción: **758 kB en total inicial (164 kB transferidos)**, dentro del
presupuesto de 1 MB. Login y layout verificados en navegador. Sin errores de consola.

**Item 10 (assets a WebP) NO se completó**, y es la única parte del alcance que queda
pendiente: no hay conversor disponible en el entorno (`cwebp`, ImageMagick y `sharp` no
existen) y esta sesión no podía instalar paquetes. `src/assets/images` bajó de 10,8 MB a
**6,3 MB** por los borrados; el paso a WebP requiere además tocar cuatro rutas de imagen en
el login aprobado. Angular ya avisa de ello en consola: `NG0913` para `logo.png` y `qr.png`.

---

### FASE 0B — Proyectos Firebase y ambientes

- **Objetivo.** Conectar el proyecto Angular con **DEV**, con una configuración de ambientes
  en la que el error de MEDIDENT sea imposible.
- **Dependencias.** 0A.
- **Estado de partida.** La parte de consola **ya está hecha**: `mi-pimpollito-dev` existe,
  configurado y verificado (§5.4). **PROD queda fuera de esta fase** porque
  `mi-pimpollito` no se puede crear todavía (§5.5).

**Ya completado — no repetir** (§5.4 tiene los valores exactos):

  - [x] Proyecto `mi-pimpollito-dev` creado · Web App *Mi Pimpollito Web DEV*.
  - [x] Firestore Standard, `(default)`, **`southamerica-west1`**, **modo producción**.
  - [x] Storage, bucket `mi-pimpollito-dev.firebasestorage.app`, **`US-CENTRAL1`**,
        Standard, **modo producción**.
  - [x] Authentication → **solo Email/Password**; Google Sign-In, email link y MFA
        deshabilitados.
  - [x] Plan **Blaze** + **alerta de presupuesto de USD 5**.
  - [x] `firebase-tools` 15.3.0 instalado, `firebase login` hecho, y
        `firebase projects:list` reconoce el proyecto.

- **Alcance de esta fase (lo que falta):**
  1. `firebase init` → Firestore, Storage, Hosting, Functions (sin escribir lógica),
     apuntando **solo a DEV**.
  2. `.firebaserc` con **el alias `dev` únicamente** y `default: dev`. El alias `prod` se
     añade cuando exista el proyecto (§5.5).
  3. `environment.model.ts` + `environment.ts` con las credenciales reales de DEV.
     ~~`environment.production.ts` no se crea todavía~~ → **corregido el mismo día**: sí se
     crea, temporalmente con el mismo Firebase que DEV (§5.5).
  4. `angular.json`: eliminar `production-sahtoso`, el reemplazo de `development` y el
     `serve.staging` fantasma. ~~El `fileReplacements` de `production` se declara cuando
     exista `environment.production.ts`~~ → se declaró en la corrección de §5.5, apuntando al
     archivo temporal.
  5. `npm i @angular/fire`, fijar `firebase@^10.7`, y los `provide*` en `app.config.ts`.
  6. `firestore.rules` y `storage.rules` **cerrados por completo**
     (`allow read, write: if false`), `firestore.indexes.json` vacío, y desplegarlos a DEV.
  7. Badge de ambiente en el topbar cuando `environment.name !== 'prod'`.
  8. **Confirmar que la configuración de este documento coincide con la consola.** Si algo
     difiere, manda la consola y se corrige el documento.
  9. **Deshabilitar la auto-creación de cuentas** en Authentication → Settings → *User
     actions* (§19.4). Es lo único de la configuración de consola que queda por verificar.
- **Cambios esperados.** `src/environments/*`, `angular.json`, `package.json`,
  `app.config.ts`, `firebase.json`, `.firebaserc`, `firestore.rules`, `storage.rules`,
  `firestore.indexes.json`, `functions/` (esqueleto).
- **Seguridad.** Reglas **cerradas desde el primer despliegue** (ya están en modo producción
  en la consola). Solo Email/Password habilitado. Alerta de presupuesto activa.
- **Pruebas.** `ng serve` conecta a DEV (verificable buscando `mi-pimpollito-dev` en el
  bundle). Comentar un campo de `environment.ts` **debe romper la compilación**: ésa es la
  prueba que valida toda la estrategia. Un `getDoc` cualquiera contra Firestore **debe ser
  denegado** por las reglas cerradas.
- **Criterios de aceptación.**
  - [x] `ng serve` conecta a `mi-pimpollito-dev` y el bundle lo contiene.
  - [x] Un campo comentado en `environment.ts` rompe `ng build --configuration development`.
  - [ ] Las Rules desplegadas en DEV niegan todo. **Los archivos están escritos y son
        deny-by-default; no se han desplegado con `firebase deploy` en esta sesión** (ver
        registro de ejecución).
  - [x] El badge **DEV** se ve en `ng serve`.
  - [x] `.firebaserc` **no** contiene un alias `prod` apuntando a un proyecto inexistente.
  - [x] **`environment.production.ts` existe y declara explícitamente, dentro del propio
        archivo, que su Firebase es temporal** (corrección del 2026-09-12, §5.5): la versión
        original de este criterio exigía que el archivo no existiera; se revirtió porque
        Google tarda ~30 días en permitir crear `mi-pimpollito`, y bloquear el build de
        producción todo ese tiempo costaba más que ser explícitos sobre el backend real.
  - [x] `firebase deploy` sin `-P` apunta a DEV (`default: dev`), confirmado con `firebase use`.
  - [x] `ng build` (configuración `production`, la predeterminada) **compila** y usa
        `environment.production.ts` vía `fileReplacements` — verificado en el bundle.
- **Condición para avanzar.** DEV funciona en ambos builds de Angular, y PROD real sigue
  explícitamente pendiente, con un aviso visible (badge) y textual (comentario en el
  archivo) de que es temporal. **Pendiente: desplegar `firestore.rules`/`storage.rules` a
  DEV** antes de que exista escritura real desde el cliente (se cierra, como muy tarde, al
  abrir la Fase 1, que ya asume Rules activas para `users`).
- **Deuda declarada de esta fase.** Crear `mi-pimpollito`, y reemplazar el bloque `firebase`
  de `environment.production.ts` (el archivo ya existe) por sus datos reales, más el alias
  `prod` en `.firebaserc`. Se retoma en cuanto la cuenta permita crear el proyecto —
  aproximadamente 30 días desde el 2026-09-12— y **antes** de cerrar la Fase 5 (§22.1).

#### Registro de ejecución (2026-09-12)

- **`@angular/fire@18.0.1`** instalado — es la última versión estable con
  `peerDependencies: { "@angular/core": "^18.0.0" }`, exacta para este proyecto. Requiere
  `firebase: ^10.12.0`; el `firebase@10.14.1` ya instalado lo satisface, así que el rango en
  `package.json` se fijó a `^10.14.1` (no hizo falta reinstalar `firebase`).
- **`provideFirebase()`** vive en `core/firebase/firebase.providers.ts` (no directamente en
  `app.config.ts`), con el mismo patrón que `provideTranslation()`: App, Auth, Firestore,
  Storage y Functions (`getFunctions(getApp(), 'southamerica-west1')`) en un solo
  `EnvironmentProviders`. **No se creó `firebase.tokens.ts`** del árbol de carpetas del plan
  (§4.3): hoy no hay ningún token que declarar — se crea en la fase que lo necesite.
- **Verificación de que los providers son correctos, sin inyectarlos en ningún componente**
  (la Fase 1 es quien los consume): un script Node de un solo uso, con el SDK real
  (`firebase@10.14.1`) y los valores exactos de `environment.ts`, confirmó que
  `initializeApp`/`getAuth`/`getFirestore`/`getStorage`/`getFunctions` resuelven sin error
  contra `mi-pimpollito-dev`, `(default)` y `southamerica-west1`. En el navegador, los cinco
  paquetes `@angular/fire/*` aparecen empaquetados y sin errores de consola, y **no hay
  ninguna llamada de red a `googleapis.com`**: los `provide*` de Angular son perezosos y no
  instancian nada hasta que algo los inyecta, lo cual ocurre recién en la Fase 1.
- **No se ejecutó `firebase deploy`.** Se creó y validó localmente todo lo necesario
  (`firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`,
  `.firebaserc`) y se confirmó `firebase use dev` → `mi-pimpollito-dev`, pero desplegar las
  reglas a la nube no estaba en el alcance explícito de esta sesión. El proyecto ya se creó
  en "modo producción" (§5.4), que en Firestore/Storage cierra el acceso por defecto hasta
  que se publiquen reglas propias — así que la ausencia de despliegue no deja la base
  abierta, pero **las reglas versionadas en el repositorio y las que rigen hoy en la consola
  pueden no ser exactamente el mismo texto** hasta el primer `firebase deploy`.
- **`functions/` es un esqueleto sin instalar.** Tiene `package.json` (con
  `firebase-functions@^7.3.2` y `firebase-admin@^14.4.0` declaradas, no descargadas),
  `tsconfig.json` y un `src/index.ts` con solo comentarios de qué Function va en cada fase
  futura. No se ejecutó `npm install` dentro de `functions/` — no hay lógica que compilar
  todavía, y bajar esas dependencias ahora no aporta nada a esta fase.
- **`firebase.json` incluye ya el bloque de Hosting** de §20.1 (reescritura SPA + cabeceras
  de caché), aunque el primer despliegue de Hosting es la Fase 1B. Es solo configuración: no
  se ejecutó ningún `firebase deploy --only hosting`.

#### Corrección de decisión (2026-09-12, misma fecha, sesión posterior)

El cliente confirmó que Google no permitirá crear `mi-pimpollito` hasta dentro de
~30 días, y decidió que el build de producción de Angular **no debía quedar roto** todo ese
tiempo. Esto reemplaza la regla original de esta fase ("`environment.production.ts` no se
crea todavía") por la de §5.5. Cambios de código de esta corrección:

- `AppEnvironment` ganó un campo `production: boolean` (el alias estándar de Angular) y
  `environment.model.ts` ganó la constante `FIREBASE_DEV_PROJECT_ID`.
- `environment.production.ts` **se creó**, con `firebase` idéntico al de DEV y un bloque de
  comentario en mayúsculas que no se puede pasar por alto.
- `angular.json` → `production.fileReplacements` **se añadió** (`environment.ts` →
  `environment.production.ts`).
- El badge de ambiente (topbar) se reescribió para **no** depender de `name`/`production`
  —que ahora describen honestamente el build de Angular, no el Firebase real— sino de
  comparar `environment.firebase.projectId` contra `FIREBASE_DEV_PROJECT_ID`. Se verificó
  en el navegador que el badge (rotulado "Firebase DEV") se sigue viendo sirviendo el build
  de **producción**.
- Se verificó, comentando un campo en cada archivo por turno, que **ambos** environments
  siguen rompiendo la compilación si les falta un dato — la garantía central de §5.1 se
  mantiene para los dos, no solo para DEV.
- Se verificó con `grep` en el bundle minificado de producción que el `projectId` presente
  es `mi-pimpollito-dev` en los dos builds, y que en ningún lado aparece un `mi-pimpollito`
  (sin sufijo) inventado.

---

### FASE 1 — Autenticación, sesión y recuperación de contraseña

- **Objetivo.** Un login que funcione contra Firebase y una cadena de sesión en la que el bug
  de recarga en frío sea imposible.
- **Dependencias.** 0B.
- **Alcance.**
  1. Sembrar el **primer administrador** a mano (§7.1) en DEV, y más adelante idéntico en PROD.
     ~~Ejecutado ahora~~ → **pendiente del usuario**: ver el registro de ejecución (bloqueado
     además por un hallazgo de infraestructura, ver abajo).
  2. `core/session/session.model.ts` — `Session`, `SessionStatus`, `RoleUser`, `AppUser`.
  3. `core/session/session.service.ts` — la cadena `authState → docData → session$` con
     `shareReplay(1)`, `startWith(LOADING)`, `distinctUntilChanged`, señales derivadas y `ready$`.
  4. `core/session/session.guards.ts` — `authGuard`, `guestGuard`.
     ~~`roleGuard`~~ → **movido a Fase 2** por instrucción explícita del cliente en esta
     sesión: con un solo rol relevante hasta ahora (`admin` sembrado a mano) no hay nada que
     un `roleGuard` proteja todavía, y el modelo de permisos administrativo es, en sí mismo,
     trabajo de Fase 2.
  5. Reescribir `login.component.ts` sobre `signInWithEmailAndPassword`, **conservando el
     HTML y el SCSS** ya diseñados. Mapa de errores de §6.5.
  6. `forgot-password` con `sendPasswordResetEmail()` y respuesta neutra. Plantilla de correo
     personalizada en la consola.
  7. Splash mientras `status === 'loading'`.
  8. Rutas mínimas: `/auth/login`, `/auth/forgot-password`, `/` protegida.
  9. **Firestore Rules de `users`**, con un alcance **más estrecho que el §10.2 completo**
     — ver el registro de ejecución — y desplegadas a DEV.
- **Cambios esperados.** `core/session/*`, `features/auth/*`, `app.routes.ts`,
  `app.component.*`, `firestore.rules`. Eliminación definitiva de `auth.guard.ts`,
  `authenticated.guard.ts`, `permissions.guard.ts` y el `SessionService` heredado si quedara algo
  — ya no quedaba nada de eso: la Fase 0A los había eliminado.
- **Seguridad.** Rules de `users` activas: lectura propia por `uid`. `create`, `update` y
  `delete` **denegados por completo desde el cliente** en esta fase (más estricto que el
  §10.2 original — ver abajo). Sin registro público. Mensajes de error que no revelan qué
  correos existen.
- **Pruebas — las cuatro que importan.**
  1. **Recarga en frío en una ruta protegida** (`F5` en `/`): la app muestra el splash y
     entra. **No** pasa por el login. Repetir con caché limpia y con red lenta (throttling).
  2. **Usuario con `isActive: false`**: inicia sesión y es rechazado con mensaje claro.
  3. **Usuario de Auth sin documento en `users`**: rechazado con `no-profile`.
  4. **Desactivación en caliente**: con la sesión abierta, poner `isActive: false` desde la
     consola → el usuario cae sin recargar.
  - Además: desde la consola del navegador, intentar `updateDoc(users/{miUid}, {role:'admin'})`
    **debe fallar**.
  - **Ninguna de las cuatro se pudo ejecutar de punta a punta en esta sesión** — requieren un
    usuario real, y su creación quedó bloqueada por un hallazgo de infraestructura (ver
    registro de ejecución). Sí se verificó, con Firebase real (no simulado): que `/` sin
    sesión redirige a `/auth/login` (prueba 1, mitad); que unas credenciales inválidas
    producen el mensaje genérico correcto sin exponer detalles técnicos; y que
    `getDoc(users/cualquiera)` sin sesión es rechazado por las Rules ya desplegadas
    (`PERMISSION_DENIED`, verificado con `curl` directo contra la REST API de Firestore).
- **Criterios de aceptación.**
  - [x] **Cero** `setTimeout`, `setInterval`, polling o `subscribe` anidados en el código de sesión.
  - [x] **Cero** lecturas de `auth.currentUser` fuera de `SessionService`.
  - [x] La navegación usa `Router`; no queda ningún `location.href`.
  - [ ] Las cuatro pruebas de arriba pasan — **pendientes**, bloqueadas por infraestructura.
  - [ ] El correo de recuperación llega y permite cambiar la contraseña — **pendiente**, la
        API key rota bloquea también `sendPasswordResetEmail()` (misma causa raíz).
  - [ ] Un usuario no puede elevar su propio rol desde la consola — **verificado de forma
        indirecta**: con las Rules de esta fase, un usuario autenticado no puede escribir
        `users/{uid}` en absoluto, ni siquiera sus propios datos de contacto, así que
        tampoco puede escribir `role`. Falta la prueba con un usuario real.
- **Condición para avanzar.** La cadena de sesión es la única fuente de verdad, el código no
  tiene ninguna de las carreras prohibidas, y las Rules están desplegadas y cierran lo que
  tenían que cerrar. **No se cumple todavía** la condición completa: falta verificar en
  vivo que el bug de recarga en frío no se reproduce con un usuario real, y eso requiere
  resolver primero el hallazgo de infraestructura de abajo.

#### Registro de ejecución (2026-09-12)

- **Alcance de las Rules de `users`, deliberadamente más estrecho que §10.2.** El §10.2
  original permite además `list`/`get` a un admin y que el propio usuario edite sus datos de
  contacto. Ninguna de las dos cosas tiene todavía una pantalla que la use en esta fase —no
  hay listado de usuarios ni edición de perfil— así que, seguiendo la instrucción explícita
  de "revisar si una escritura es realmente necesaria antes de abrirla", el alcance
  desplegado es:

  ```
  match /users/{userId} {
    allow get: if request.auth != null && request.auth.uid == userId;
    allow list, create, update, delete: if false;
  }
  ```

  Es un subconjunto estricto de §10.2 (nunca lo contradice: todo lo que §10.2 permitiría,
  esto también lo permitiría si se ampliara; nada de lo que esto deniega, §10.2 lo abría de
  más). **Desplegado** con `firebase deploy --only firestore:rules -P dev`, confirmando antes
  el proyecto activo con `firebase use` (`mi-pimpollito-dev`). No se tocó `storage.rules` ni
  se desplegó Hosting, tal como se pidió.
- **`roleGuard` se pospuso a la Fase 2** por instrucción explícita, no por hallazgo técnico.
  `core/session/session.guards.ts` exporta `authGuard` y `guestGuard`
  (`guestGuard` es lo que el prompt de esta fase llama "IsNotAuthGuard": si ya hay sesión
  `active`, no deja ver `/auth/login` ni `/auth/forgot-password`).
- **La "desactivación en caliente" necesitaba algo más que el guard.** Un `CanActivate` solo
  se evalúa en una navegación; la prueba pide expulsar al usuario **sin que navegue a
  ningún lado**, solo porque su documento cambió en Firestore. Se resolvió con una
  suscripción persistente a `session$` dentro de `AppLayoutComponent` (que solo se monta
  detrás de `authGuard`): en cuanto la sesión deja de ser `active`, cierra la sesión de
  Firebase y navega a login. No es una segunda fuente de verdad — sigue leyendo
  exclusivamente `SessionService.session$`.
- **El splash de arranque se re-cableó** para depender de `session().status === 'loading'`
  en vez de los eventos de navegación del router (`NavigationStart`/`NavigationEnd`), tal
  como pide §6.4. Se retiró el mecanismo heredado de mostrar/ocultar el spinner por
  manipulación directa del DOM (`showHideSpinner()`, con un `id` fijo) porque ya no tenía
  consumidores; el componente `SpinnerComponent` pasó a controlarse con `@if` de Angular.
- **Dos errores de datos encontrados y corregidos durante la propia implementación,
  antes de llegar a producción:**
  1. El campo de "usuario o correo" del login heredado tenía dibujado (pero inactivo, sin
     validador) un mensaje de "máximo 20 caracteres". Al conectar la validación real se
     activó por descuido para ese campo, y **bloqueaba el envío del formulario con
     cualquier correo electrónico real** (casi todos superan 20 caracteres) sin ni siquiera
     intentar la llamada a Firebase. Se detectó probando el propio formulario y se corrigió
     quitando ese límite del campo de correo (sigue aplicando a la contraseña, que sí tiene
     sentido acotar).
  2. El mismo login tenía `Validators.minLength(8)` en la contraseña, pero el mensaje ya
     dibujado en el HTML decía "al menos 6 caracteres" — y 6 es, además, el mínimo real que
     exige Firebase Authentication. Se corrigió el validador a 6 para que compilación,
     mensaje visible y regla de Firebase queden alineados.
- **Hallazgo de infraestructura, bloqueante — no es un bug de código.** Al probar el login
  contra Firebase real (con credenciales deliberadamente inválidas, para no depender de que
  ya existiera un usuario), Firebase Authentication rechazó **todas** las llamadas con
  `auth/api-key-not-valid.-please-pass-a-valid-api-key.`. Se confirmó con `curl` directo
  contra `identitytoolkit.googleapis.com` (fuera de Angular, fuera del navegador): mismo
  resultado. En cambio, la misma API key sí es aceptada por Firestore
  (`firestore.googleapis.com` devuelve `PERMISSION_DENIED` —de las Rules, no de la key— para
  una lectura sin sesión), lo que acota el problema: la key identifica bien el proyecto
  `mi-pimpollito-dev`, pero **la API de Identity Toolkit (Authentication) la rechaza
  específicamente**. La causa más probable es que esa API no esté habilitada para el
  proyecto en Google Cloud, o que la key tenga una restricción de "API restrictions" en
  Google Cloud Console que no incluya Identity Toolkit API. Bloquea `signInWithEmailAndPassword`
  **y** `sendPasswordResetEmail` por igual — cualquier llamada de Authentication, no solo el
  login. Se documenta como pendiente del cliente en §22 y en `CLAUDE.md`.
- **Consecuencia observada en `forgot-password`, que conviene tener presente.** Se probó el
  formulario con un correo de prueba: la pantalla mostró el mensaje neutral de éxito ("Si el
  correo está registrado, recibirás un mensaje...") **aunque `sendPasswordResetEmail` falló
  por el bloqueo de arriba**. Esto es el diseño funcionando exactamente como especifica el
  §6.7 —cualquier error que no sea de red o de límite de intentos responde igual que un
  envío correcto, para no revelar nada— pero significa que, **mientras dure el bloqueo, la
  pantalla de recuperación parece funcionar y no envía ningún correo de verdad.** No es un
  bug nuevo: es la misma causa raíz de §22.2 manifestándose aquí.

---

### FASE 1B — Primer despliegue manual a DEV

- **Objetivo.** Descubrir los problemas de Hosting cuando todavía son baratos.
- **Dependencias.** 1.
- **Alcance.** `firebase.json` con la reescritura SPA y las cabeceras de caché (§20.1);
  `ng build --configuration development` + `firebase deploy --only hosting -P dev`; autorizar
  el dominio `mi-pimpollito-dev.web.app` en Authentication → Settings → Authorized domains.
- **Cambios esperados.** `firebase.json`, scripts de `package.json`.
- **Seguridad.** Solo DEV. Las Rules de la Fase 1 ya están activas.
- **Pruebas.** Entrar a `https://mi-pimpollito-dev.web.app`, iniciar sesión, **recargar con
  `F5` estando en una ruta protegida**, escribir `/perfil` directamente en la barra de
  direcciones, y solicitar un correo de recuperación desde el dominio desplegado.
- **Criterios de aceptación.**
  - [ ] El sitio carga y el login funciona en el dominio real.
  - [ ] `F5` en una ruta interna no devuelve 404 (la reescritura funciona).
  - [ ] Un segundo despliegue se refleja sin `Ctrl+F5` (`index.html` no cacheado).
  - [ ] El correo de recuperación funciona desde el dominio desplegado.
- **Condición para avanzar.** El ciclo build → deploy → verificar está probado y documentado.

---

### FASE 2 — Usuarios, roles, guards, sidebar y paginación

- **Objetivo.** Administración de usuarios completa y segura, y la infraestructura de
  listados que usarán todas las fases siguientes.
- **Dependencias.** 1B.
- **Alcance.**
  1. `functions/` con `createUser`, `updateUserAuth`, `setUserActive` y los helpers
     `assertActive`/`assertAdmin`/`assertStaff` (§7.3). **Requiere Blaze.**
  2. Custom claim `role` escrito por la Function (§7.6).
  3. `features/users`: listado (tabla y tarjetas, adaptando la UI heredada), formulario de
     alta y edición, activar/desactivar, detalle.
  4. `core/data/base-firestore.service.ts` + `paged-query.ts`: converters,
     `serverTimestamp()`, normalización de `searchName`/`emailLower`, cursores.
  5. Paginador sin salto de página (§12.1), tamaños 10/20/50, `getCountFromServer()`.
  6. Búsqueda por prefijo sobre `searchName` y `emailLower`, con `debounceTime(300)`.
  7. `layout/menu/menu.config.ts` declarativo + sidebar filtrado por `computed()`;
     eliminación de `AppMenuContentService` y `canSeeMenu`.
  8. `features/profile`: datos de contacto y cambio de contraseña.
  9. `settings/app` creado con los datos de la tienda (§8.3) y su pantalla de edición (admin).
  10. `firestore.indexes.json` con los índices de `users`.
- **Cambios esperados.** `functions/src/*`, `features/users/*`, `features/profile/*`,
  `core/data/*`, `layout/*`, `firestore.rules`, `firestore.indexes.json`.
- **Seguridad.** Creación y edición de cuentas **solo** por Function con rol verificado en
  servidor. `email` no escribible por el cliente. Compensación si falla el paso 4 de
  `createUser` (§7.4). `/usuarios` con `roleGuard(['admin'])` **y** Rule `isAdmin()`.
- **Pruebas.**
  - Crear un usuario: **la sesión del admin no se pierde** y la cuenta aparece en
    Authentication **y** en `users`.
  - Provocar el fallo del paso 4 (por ejemplo, una Rule temporal) y comprobar que **no queda
    una cuenta huérfana** en Authentication.
  - Entrar como `user`: el sidebar no muestra Usuarios ni Reportes; escribir `/usuarios` a
    mano redirige; y desde la consola del navegador, leer `users` **falla**.
  - Paginar 30 usuarios de prueba hacia adelante y hacia atrás, y verificar que el total es
    correcto.
  - Cambiar el correo de un usuario y verificar que Auth y Firestore quedan iguales.
- **Criterios de aceptación.**
  - [ ] Todas las pruebas anteriores pasan.
  - [ ] Ninguna consulta sin `limit()` en todo el código.
  - [ ] El menú se recalcula al cambiar la sesión, sin contadores manuales.
  - [ ] Un `user` no puede modificar su propio `role` ni su `isActive` por ninguna vía.
  - [ ] El documento `settings/app` existe con los datos reales de la tienda.
- **Condición para avanzar.** El CRUD de usuarios es seguro y la infraestructura de listados
  está probada, porque Productos y Ventas la reutilizan tal cual.

---

### FASE 3 — Productos, imágenes y códigos de barras

- **Objetivo.** Catálogo completo, con imagen obligatoria, índice de códigos y generador de
  etiquetas — y **usable desde un celular**, porque es la herramienta con la que se cargarán
  500–1 000 productos.
- **Dependencias.** 2.
- **Alcance.**
  1. `features/products`: listado paginado con búsqueda por prefijo y filtros
     (activos, stock bajo, stock negativo); formulario de alta y edición.
  2. `core/services/image-compressor.service.ts` con `imageOrientation: 'from-image'` (§9.2).
  3. Subida a `products/{productId}/{imageId}.webp` y reemplazo en el orden correcto (§9.3).
  4. Índice `barcodes/{code}` escrito en el mismo `writeBatch` que el producto (§14.1).
  5. **Generador de código interno**: `counters/internalCode` + prefijo de `settings` (§14.2).
  6. **Hoja de etiquetas**: `jsbarcode` (Code 128) → PNG → `pdfmake` en hoja carta.
  7. Alerta de stock bajo con `settings.lowStockThreshold` (B8).
  8. Soft delete con `isActive`.
  9. Formulario **responsivo y usable con el pulgar**, con `capture="environment"` y
     guardado en cadena (§13.3).
  10. Rules de `products`, `barcodes` y `counters` (§10.2) + índices compuestos.
- **Cambios esperados.** `features/products/*`, `core/services/image-compressor.service.ts`,
  `core/utils/money.util.ts`, `shared/pipes/money.pipe.ts`, `firestore.rules`,
  `storage.rules`, `firestore.indexes.json`, `package.json` (`jsbarcode`, `pdfmake`).
- **Seguridad.** `create` por `isStaff()`; `priceCents`, `code` e `isActive` solo por
  `isAdmin()`; `delete` denegado; `imagePath` obligatorio en la Rule; límites de tipo y
  tamaño en Storage Rules.
- **Pruebas.**
  - Crear un producto con imagen **desde un celular real**, no solo con el emulador del
    navegador.
  - Intentar guardar sin imagen: el formulario lo impide **y** la Rule lo rechazaría.
  - Crear dos productos con el mismo código: el segundo falla por el ID de `barcodes`.
  - Generar códigos internos desde dos pestañas a la vez: **no se repiten**.
  - Imprimir una hoja de etiquetas y **escanearla con el lector**: el código leído encuentra
    el producto.
  - Como `user`, intentar cambiar el precio de un producto existente desde la consola del
    navegador: **debe fallar**.
  - Paginar y buscar con al menos 200 productos de prueba.
  - Verificar en Storage que una foto de celular quedó en 120–200 KB y **no girada**.
- **Criterios de aceptación.**
  - [ ] Todas las pruebas anteriores pasan.
  - [ ] Los precios se guardan en centavos enteros y se muestran como `Bs 10,50`.
  - [ ] Ningún producto puede existir sin `imagePath`.
  - [ ] El listado con 1 000 productos no hace más de 21 lecturas por página.
  - [ ] El formulario es cómodo en una pantalla de 400 px de ancho.
- **Condición para avanzar.** El catálogo se puede cargar de forma sostenida y los códigos se
  resuelven con el lector. **A partir de aquí puede empezar la carga masiva del catálogo, en
  paralelo a las fases siguientes.**

---

### FASE 4 — Ventas, escáner, stock y comprobante

- **Objetivo.** El punto de venta completo, con integridad de dinero y stock garantizada en
  servidor, y el comprobante PDF que el cliente pidió como finalidad del sistema.
- **Dependencias.** 3.
- **Alcance.**
  1. `functions/src/sales.ts`: **`createSale`** con `runTransaction`, `.create()` idempotente,
     validación de precios contra el producto, `dateKey` en `America/La_Paz` y mantenimiento
     de `dailySummaries` (§15.3).
  2. **`cancelSale`** (solo admin), con devolución de stock y ajuste del resumen (§15.4).
  3. `features/sales/pos`: input de escaneo siempre enfocado, carrito, atajos de teclado,
     nombre de cliente opcional, aviso de stock, confirmación.
  4. `shared/directives/barcode-input.directive.ts` (o el input simple de §14.4).
  5. Caché `Map<code, productId>` en memoria durante la sesión del POS.
  6. Listado de ventas: **el vendedor solo ve las suyas del día**; el admin ve todas con
     filtros por fecha y vendedor. Detalle de venta.
  7. **Comprobante PDF** con `pdfmake` en hoja carta (§18.4), con los datos de `settings/app`
     y el logo en base64.
  8. Formas de pago `cash` y `qr` **sin voucher todavía** (el voucher llega en la Fase 5);
     `giftcard` **no se ofrece** hasta la Fase 6.
  9. Rules de `sales` y `dailySummaries` (§10.2) + índices compuestos.
- **Cambios esperados.** `functions/src/sales.ts`, `functions/src/date-keys.ts`,
  `features/sales/*`, `shared/directives/*`, `firestore.rules`, `firestore.indexes.json`,
  `package.json` (`pdfmake`, `dayjs` plugins).
- **Seguridad.** `sales` con `allow write: if false`: **solo la Function escribe**. El precio
  lo fija el servidor leyendo el producto. `cancelSale` solo admin. El vendedor no puede leer
  ventas ajenas ni por consulta ni por ID.
- **Pruebas — las que realmente prueban el diseño.**
  1. **Venta normal:** stock descontado exactamente, total correcto, comprobante impreso.
  2. **Doble clic en Confirmar:** una sola venta, un solo descuento de stock.
  3. **Manipulación desde la consola:** invocar `createSale` con un `unitPriceCents`
     falseado → **rechazada**. Escribir directo en `sales` → **rechazada**.
  4. **Venta a las 20:00 hora de Bolivia:** `dateKey` es el día correcto, **no el siguiente**.
     Probar cambiando la zona del sistema operativo para confirmar que el servidor manda.
  5. **Venta con stock 0:** se registra, avisa, y el stock queda negativo.
     Con `allowSaleWithoutStock: false`, la misma venta se rechaza.
  6. **Anulación:** el stock vuelve, la venta queda `cancelled` y el resumen del día cuadra.
  7. **Vendedor:** solo ve sus ventas del día; intentar leer otra por ID **falla**.
  8. **Resumen diario:** coincide con `sum()` sobre `sales` del mismo día.
- **Criterios de aceptación.**
  - [ ] Las ocho pruebas anteriores pasan.
  - [ ] No existe ningún camino por el que el cliente escriba en `sales`.
  - [ ] Escanear 10 productos seguidos no requiere tocar el ratón.
  - [ ] El comprobante imprime correctamente los datos de la tienda y los importes.
  - [ ] `Σ payments[].amountCents == totalCents` en todas las ventas de prueba.
- **Condición para avanzar.** No existe forma de registrar una venta inconsistente, y el
  cierre del día cuadra con las ventas.

---

### FASE 5 — Pago QR y voucher

- **Objetivo.** Cobrar por QR con evidencia del pago, sin bloquear el mostrador.
- **Dependencias.** 4.
- **Alcance.**
  1. `voucherStatus: 'pending' | 'uploaded'` en el pago QR, escrito por `createSale`.
  2. **`attachVoucher`** (Function): valida que el pago sea `qr`, que el voucher **no exista
     todavía** y sella `uploaded` (§2.1 C-4).
  3. Pantalla **Vouchers pendientes**, responsiva y usable desde el celular, con
     `capture="environment"` y compresión antes de subir.
  4. Marca visible en el listado de ventas y en el detalle.
  5. El **cierre del día** avisa si quedan vouchers pendientes.
  6. Storage Rules de `qr-vouchers/`: `create` por staff, `update`/`delete` denegados.
- **Cambios esperados.** `functions/src/sales.ts`, `features/sales/*`, `storage.rules`.
- **Seguridad.** El voucher es **inmutable**: una vez subido no se reemplaza ni se borra. Solo
  staff lo lee. El nombre del archivo lo genera el cliente pero la ruta está acotada al
  `saleId` por la Rule.
- **Pruebas.** Venta con QR sin voucher → queda pendiente y visible. Adjuntar desde un
  celular → pasa a `uploaded`. Intentar **reemplazarlo** → rechazado. Intentar adjuntar un
  voucher a un pago en efectivo → rechazado. Intentar subir a
  `qr-vouchers/{otroSaleId}/…` un archivo de 10 MB → rechazado por tamaño.
- **Criterios de aceptación.**
  - [ ] Una venta QR nunca queda sin rastro: o tiene voucher, o aparece como pendiente.
  - [ ] El voucher no se puede sustituir.
  - [ ] La pantalla de pendientes funciona en un celular real.
  - [ ] El cierre del día refleja los pendientes.
- **Condición para avanzar.** **Fin del MVP.** El sistema puede cobrar en efectivo y por QR,
  con comprobante y con evidencia.
- **Aquí es donde el bloqueo de PROD real deja de ser transparente (§5.5, §22.1).** El paso
  natural al cerrar esta fase es desplegar frente a clientes reales y sembrar el primer admin
  ahí, y **eso requiere que `mi-pimpollito` exista** — el `ng build` de producción ya
  funciona desde la Fase 0B, pero sigue hablando temporalmente con `mi-pimpollito-dev`. Si al
  llegar aquí la cuenta sigue en el límite de proyectos: liberar cuota o pedir aumento, crear
  el proyecto con los valores de §5.5, **reemplazar** el bloque `firebase` de
  `environment.production.ts` (el archivo ya existe) con los datos reales, añadir el alias
  `prod` a `.firebaserc`, autorizar el dominio en Authentication, desplegar Rules e índices,
  y sembrar el primer admin. **Mientras eso no ocurra, todo — incluido cualquier build de
  producción que se genere — sigue siendo, de hecho, DEV.**

---

### FASE 6 — Gift Cards ✅ IMPLEMENTADA Y PROBADA EN VIVO

> El alcance real difiere del boceto original de este roadmap — ver §16 (reescrito) para el
> porqué: denominación fija en vez de importe libre, estados `AVAILABLE`/`ACTIVE`/
> `SUSPENDED`/`CANCELLED` en vez de `in_stock`/`active`/`retired`, `cycleNumber`/
> `activeCycleId` en vez de `activeIssueId`, y seis Functions en vez de dos.

- **Objetivo.** Vender, consumir, devolver y reutilizar tarjetas físicas, con el historial
  auditable y sin doble contabilización. **Cumplido.**
- **Dependencias.** 5 (el canje ocurre dentro de `createSale`).
- **Alcance (implementado).**
  1. `functions/src/giftcards.ts`: `registerGiftCard`, `registerGiftCardBatch` (admin),
     `activateGiftCard`, `suspendGiftCard`, `reactivateGiftCard` (staff), `cancelGiftCard`
     (solo admin) — invariantes en §16.4, §16.5.
  2. `createSale` ampliado para el pago `giftcard`: redención + `FORFEITED` del sobrante,
     cierre del ciclo y liberación del plástico, todo en la misma transacción (§16.6).
  3. `cancelSale` ampliado: revierte la gift card SOLO si el ciclo sigue intacto; si ya se
     reutilizó, la anulación completa se rechaza (§16.7 — decisión tomada en vivo con el
     cliente, diverge del boceto original que revertía sin esa comprobación).
  4. `features/gift-cards`: registro individual y por lote (admin), listado con filtros por
     estado/denominación y búsqueda por código, detalle con acciones de ciclo de vida y
     movimientos (admin).
  5. Búsqueda de gift card en el POS: mismo pipeline manual/HID de un solo input que
     productos, en un campo propio activado al elegir "Gift Card" como forma de pago.
  6. Rules de `giftCards`/`giftCardIssues`/`giftCardMovements` (solo lectura, `allow write:
     if false` sin excepción) + 2 índices compuestos.
- **Cambios reales.** `functions/src/giftcards.ts` (nuevo), `functions/src/sales.ts`,
  `functions/src/index.ts`, `functions/src/normalize.ts`, `firestore.rules`,
  `firestore.indexes.json`, `src/app/features/gift-cards/*` (nuevo),
  `src/app/features/sales/{sale.model,sales.service}.ts` y sus componentes de POS/detalle,
  `src/app/layout/menu/menu.config.ts`, `src/app/app.routes.ts`, `es.json`.
- **Seguridad.** Las tres colecciones de gift cards son `allow write: if false` sin
  excepción — verificado con intentos directos por REST incluso como admin (403 en los
  tres). Cada Function empieza por `assertActive`/`assertAdmin`. Anti-carrera entre ciclos
  verificado con dos pruebas críticas en vivo (§16.5): reintento de ciclo viejo rechazado, y
  doble redención concurrente del mismo ciclo — exactamente una tiene éxito.
- **Pruebas ejecutadas en vivo** (admin y vendedor, sesiones reales, `mi-pimpollito-dev`):
  registro individual (código numérico con ceros iniciales, alfanumérico, con guiones) y por
  lote (atómico: duplicado interno y duplicado contra existente, ambos rechazan el lote
  entero sin crear nada); filtros y búsqueda del listado; F5 en `/giftcards` sin bote a
  login; activar con y sin `buyerName`, pagando en cash y en QR; suspender con motivo,
  confirmar rechazo como pago mientras `SUSPENDED` (cliente y servidor), reactivar con el
  mismo ciclo; redención exacta, con `forfeit`, y con diferencia mixta (gift card + cash);
  recibo/detalle de venta mostrando el snapshot correcto; tarjeta vuelve a `AVAILABLE` tras
  canjearse, limpia comprador/ciclo operativo, conserva `cycleNumber` histórico; reactivación
  para un segundo ciclo con `cycleNumber`/`activeCycleId` nuevos; **doble redención
  concurrente → exactamente un éxito**; **request con ciclo viejo contra un ciclo nuevo →
  rechazado**; cancelación definitiva desde `AVAILABLE` y desde `ACTIVE` con dinero ya
  cobrado (con reversión correcta de `dailySummaries`); todas las transiciones inválidas
  (suspender/reactivar/activar fuera de su estado válido) rechazadas server-side; permisos
  admin-only (`registerGiftCard`, `registerGiftCardBatch`, `cancelGiftCard`) confirmados
  rechazados para vendedor tanto en la UI como directo contra la Function.
- **Criterios de aceptación.**
  - [x] Todas las pruebas anteriores pasan.
  - [x] Registrar una gift card **nunca** crea un documento en `sales`.
  - [x] Todo cambio de estado tiene su movimiento en la misma transacción.
  - [x] `Σ payments == totalCents` se mantiene en las ventas con gift card (exacta, forfeit y mixta).
  - [x] Consultar el estado de una tarjeta cuesta **1 lectura** (mejora sobre las 2 previstas
        originalmente — ver §16.1).
- **Condición para avanzar.** El estado de cualquier tarjeta se puede explicar movimiento a
  movimiento. **Cumplida** — verificado en vivo con el historial completo de varias tarjetas
  (`REGISTERED → ACTIVATED → REDEEMED(evento) → ACTIVATED(ciclo 2) → ...`,
  `REGISTERED → ACTIVATED → SUSPENDED → REACTIVATED → REDEEMED`,
  `REGISTERED → ACTIVATED → CANCELLED` con reversión de `dailySummaries`).

---

### FASE 7 — Reportes y cierre de caja — ✅ IMPLEMENTADA Y PROBADA EN VIVO (sin commit todavía)

- **Objetivo.** Que el dueño pueda responder "¿cuánto gané y cuánto dinero entró?" sin
  ambigüedad y sin doble contabilización.
- **Dependencias.** 6.
- **Alcance.**
  1. `features/reports`: cierre del día, fecha específica, semana, mes, trimestre, año y rango
     personalizado (F1).
  2. Detalle por producto (código, nombre, cantidad, total) acumulado desde los
     `dailySummaries` del rango, con total general.
  3. Desglose por forma de pago y las **dos identidades verificadas en pantalla** (§18.2).
  4. Línea de **nuevas gift cards vendidas**, **saldo consumido**, **saldo no reclamado** y
     **pasivo pendiente**.
  5. Ventas por vendedor (solo admin).
  6. Verificación de integridad: resumen diario **vs** `sum()` sobre `sales`, con aviso si difieren.
  7. Exportación a **PDF** (F4). Gráfico simple con `chart.js`, ya presente.
  8. `/reportes` con `roleGuard(['admin'])`; `dailySummaries` solo legible por admin.
- **Cambios esperados.** `features/reports/*`, `firestore.rules`, `firestore.indexes.json`.
- **Seguridad.** Módulo **solo admin**, en guard **y** en Rules. Ninguna consulta sin límite.
- **Pruebas.** Reproducir el ejemplo de §18.2 con datos reales de prueba y comprobar que las
  cifras salen 500 / 1 000 / 1 400 / +900, y **no** 1 500. Un reporte mensual debe costar ~31
  lecturas (verificar en la consola de uso). Comprobar que una venta anulada no aparece en
  ningún total. Entrar como `user` y verificar que `/reportes` no es accesible ni por URL ni
  por consulta directa a `dailySummaries`.
- **Criterios de aceptación.**
  - [x] Las dos identidades de §18.2 se muestran y cuadran.
  - [x] La emisión de gift cards **nunca** suma a "mercancía vendida".
  - [x] El detalle por producto de un año cuesta ~365 lecturas, no miles (un rango de
        `dailySummaries` cuesta 1 lectura por día, nunca se pagina `sales` para esto).
  - [x] El reporte se exporta a PDF.
  - [x] Un `user` no puede ver reportes por ninguna vía.
- **Condición para avanzar.** Los números del sistema coinciden con el dinero del cajón.
  **Cumplida** — verificado en vivo con datos reales de DEV (no datos de prueba
  sintéticos): la verificación de integridad (`dailySummaries` vs. `sum()` en vivo sobre
  `sales`) coincidió exactamente para "Hoy" (21 ventas, 3 798,00 Bs) y "Últimos 7 días"
  (27 ventas, 5 133,00 Bs) en todos los campos (`salesCount`, `totalCents`, `cashCents`,
  `qrCents`, `giftCardCents`); el desglose por vendedor de Lenar Lima (9 ventas,
  1 495,00 Bs) y Mario Santos (12 ventas, 2 303,00 Bs) sumó exactamente el total global
  (21 ventas, 3 798,00 Bs). Un solo gap real encontrado y corregido en el camino — ver
  §18.3, "Gap real encontrado y corregido" — que no era un descuadre financiero, sino un
  campo ausente en un `dailySummaries` anterior a la Fase 6; documentado y resuelto sin
  tocar ninguna Function, Rule ni documento existente. `user` confirmado rechazado en las
  tres vías (menú, guard por URL, lectura REST directa → `403 PERMISSION_DENIED`). Ambos
  builds (`development` y `production`) limpios. **Pendiente de aprobación del cliente
  para hacer commit** — instrucción explícita de no commitear hasta cerrar la fase.

---

### FASE 8 — Auditoría final de seguridad

- **Objetivo.** Verificar, antes de confiar el negocio al sistema, que no queda ninguna puerta
  abierta.
- **Dependencias.** 7.
- **Alcance y lista de verificación.**
  1. Repasar `firestore.rules` colección por colección; confirmar el cierre explícito
     `match /{document=**} { allow read, write: if false; }`.
  2. Repasar `storage.rules`; confirmar que **no existe** ningún `if true`.
  3. Desde la consola del navegador, con una sesión de `user`, intentar: leer `users`, leer
     una venta ajena, escribir en `sales`, cambiar un `priceCents`, elevar su `role`,
     escribir en `dailySummaries`, escribir en `giftCardIssues`. **Las siete deben fallar.**
  4. Confirmar que cada Function empieza por `assertActive`/`assertAdmin`/`assertStaff`.
  5. Confirmar que el registro público de usuarios sigue deshabilitado.
  6. Revisar que ningún secreto ni service account está en el repositorio.
  7. **Activar App Check** en DEV, verificar, y solo después en PROD (§19.4).
  8. Revisar el uso real en la consola de Firebase y comparar con la estimación de §19.1.
  9. Confirmar que la alerta de presupuesto está activa en ambos proyectos.
  10. Repasar las siete reglas de disciplina de §19.3 sobre el código ya escrito.
- **Criterios de aceptación.**
  - [ ] Los siete intentos del punto 3 fallan.
  - [ ] Ninguna regla contiene `if true`.
  - [ ] App Check activo en ambos proyectos sin romper la aplicación.
  - [ ] El consumo real está dentro del orden estimado.
- **Condición para avanzar.** Ninguna operación no autorizada es posible desde el cliente.

---

### FASE 9 — CI/CD automatizado

- **Objetivo.** Que desplegar deje de ser un acto manual, con la separación de ambientes garantizada.
- **Dependencias.** 8.
- **Alcance.**
  1. `firebase init hosting:github` **ejecutado por el cliente** (genera el service account y
     lo guarda como secreto del repositorio sin que ningún JSON pase por ninguna conversación).
  2. `deploy-prod.yml` (`main` → PROD) y `deploy-dev.yml` (`develop` → DEV).
  3. Previews de Pull Request **contra DEV**.
  4. Despliegue de Rules e índices en el mismo workflow.
  5. Documentar el flujo en `docs/` reemplazando lo heredado (§20.3).
- **Cambios esperados.** `.github/workflows/*`, `docs/*`.
- **Seguridad.** Las previews nunca apuntan a PROD. El secreto vive solo en GitHub. Ninguna
  credencial en el repositorio.
- **Pruebas.** Un push a `develop` despliega DEV; un PR genera una preview **en DEV**; un
  merge a `main` despliega PROD; y un cambio en `firestore.rules` llega desplegado.
- **Criterios de aceptación.**
  - [ ] Los cuatro escenarios anteriores funcionan.
  - [ ] Una preview no puede escribir en los datos de producción.
  - [ ] `docs/` describe el despliegue real del proyecto.
- **Condición para avanzar.** Fin del roadmap planificado.

---

## 24. Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---:|---|---|---|---|
| 1 | **La carga manual de 500–1 000 productos no se termina a tiempo.** Es el camino crítico real del proyecto, y no es código (B1, B2) | **Alta** | **Alto** — sin catálogo el POS no sirve | Empezar en cuanto la Fase 3 esté en DEV, en paralelo a las Fases 4–5. Formulario optimizado para carga en cadena desde el celular (§13.3). Medir: 20 productos cargados dan el ritmo real y permiten estimar la fecha de verdad |
| 2 | **El bug de recarga en frío reaparece** al añadir una pantalla nueva que lea `auth.currentUser` | Media | **Crítico** | Es la primera regla de `CLAUDE.md`. Todo acceso a la sesión pasa por `SessionService`; la prueba de recarga en frío se repite al cerrar **cada** fase |
| 3 | **La fecha objetivo de fin de septiembre no alcanza** para las 12 fases (G4) | **Alta** | Medio | El corte de MVP de §23.2 es explícito: las Fases 6 y 7 (gift cards y reportes) son la segunda entrega. Conviene confirmarlo con el cliente antes de empezar |
| 4 | **Stock negativo acumulado** por vender sin stock (C4) sin conteo físico ni ajustes registrados | **Alta** | Medio | El listado marca el stock negativo. `stockMovements` está diseñado y postergado (§13.2): **el primer conteo físico con diferencias es la señal para implementarlo** |
| 5 | El lector de código de barras comprado **no emula teclado** (C3: aún no se ha comprado) | Baja | Medio | Al comprarlo, pedir explícitamente un lector **USB HID / emulación de teclado**. El diseño de §14.4 funciona con cualquiera que lo haga |
| 6 | **`mi-pimpollito` (PROD) no se puede crear:** la cuenta está en el límite de proyectos de Firebase | **Confirmado — ya ocurre** | Medio | No bloquea las Fases 0A–5, que se construyen contra DEV. Se resuelve liberando cuota (los proyectos borrados cuentan ~30 días) o pidiendo aumento en Google Cloud. **Revisar antes de cerrar la Fase 5** (§22.1). Prohibido usar DEV como PROD |
| 6b | **El bucket de Storage está en `US-CENTRAL1`** y Firestore en `southamerica-west1` | Confirmado — decisión intencional | Bajo | Las imágenes viajan desde EE. UU. Se compensa con compresión obligatoria a 120–200 KB (§9.2) y CDN. La ubicación de un bucket es inmutable: si algún día molestara, exigiría un bucket nuevo y mover los archivos |
| 7 | **Arranque en frío de Cloud Functions** percibido como lentitud en el mostrador | Media | Bajo | Invocación de calentamiento al abrir el POS. Si molestara, `minInstances: 1` cuesta céntimos |
| 8 | **Vouchers QR que nunca se adjuntan** (§2.1 C-4) | Media | Medio | El cierre del día no se completa con pendientes, y el listado los marca. La deuda es visible, no silenciosa |
| 9 | **Dos fuentes de verdad** entre `dailySummaries` y `sales` | Baja | Medio | Se escriben en la misma transacción, y el cierre de caja compara ambas y avisa si difieren (§19.2) |
| 10 | Un vendedor **crea productos duplicados con precio bajo** (§2.1 C-3) | Baja | Bajo | `createdBySellerId` en el producto, y `createSale` registra el precio real en la venta: queda trazado en el reporte |
| 11 | La limpieza de la Fase 0A **rompe algo que sí se usaba** | Media | Bajo | Commit previo obligatorio, rama propia, y `ng build` como criterio de aceptación |
| 12 | El **coste de Firebase** se descontrola | **Muy baja** | Bajo | Alerta de presupuesto en USD 5 desde la Fase 0B. El consumo previsto es menos de medio día de tramo gratuito (§19.1) |

---

## 25. Anexo: respuestas del cliente

Las 48 respuestas, **literales**, tal como el cliente las registró el 2026-09-12. Se
conservan aquí porque son la justificación de cada política del documento: cuando dentro de
seis meses alguien pregunte por qué el sistema permite vender sin stock, la respuesta es C4
y está escrita con sus palabras.

### Bloque A — Negocio y alcance

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| A1 | ¿Una sola tienda o más sucursales? | *"solo 1 tienda de momento, no está pensado otra sucursal"* | §1 |
| A2 | ¿El internet se corta con frecuencia? | *"el internet es estable"* | §1 |
| A3 | ¿Se necesita factura fiscal? | *"no se necesita, la idea es imprimir un comprobante o un pdf quizás de lo que compró el cliente con el monto total, pero nada más"* | §18.4 |
| A4 | ¿Quiénes usarán el sistema y con qué correos? | *"Lenar Mario Lima Toledo, correo: lenar.toledo@gmail.com"* | §7.1 |
| A5 | ¿Dos roles o tres? ¿Qué ve cada uno? | *"administrador ve todo, y el vendedor solo realiza las ventas; en caso que sea necesario crea un producto y solo debería ver sus ventas propias que hizo en el día, pero no puede ver de otras personas y tampoco el módulo de pagos"* | §2.1 C-3 · §11.1 · §21 #26 |
| A6 | Datos de la tienda para el comprobante | *"@mipimpollito · Calle Tomás Frias entre Av. Antofagasta y, Pisagua Nº 100, Oruro · Artículos y accesorios para Niños · teléfono +591 77966329"* | §1 · §8.3 |
| A7 | ¿Tarjeta asociada para el plan Blaze? | *"yo como dev voy a asociar mi tarjeta, pero eso lo puedo hacer manualmente cuando necesitemos; al inicio es que funcione el login, módulo de usuarios y authentication"* | §5.4 |
| A8 | ¿Habrá dominio propio? | *"de momento no hay dominio propio, a futuro posiblemente según cómo vaya la página en este inicio"* | §6.7 · §20 |

### Bloque B — Productos

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| B1 | ¿Cuántos productos tiene el catálogo? | *"no estoy seguro, un aproximado de 500 a 1000 aprox"* | §1 · §24 #1 |
| B2 | ¿Existe ya una lista o Excel de productos? | *"no hay todavía una lista de productos, de momento la idea es llenar manualmente"* | §2.3 · §24 #1 |
| B3 | ¿Los juguetes traen código de barras de fábrica? | *"vienen con código de barras como el 90%, pero hay un 10% que no; en ese caso la idea es generar un código y ponerle un código de barras a esos que no tienen… quizás necesitamos un generador de códigos"* | §14.2 |
| B4 | ¿Hay impresora de etiquetas? | *"no hay impresora, pero posiblemente compremos; de momento la idea era generar como un pdf normal en carta e imprimir eso como un comprobante"* | §14.2 · §18.4 |
| B5 | ¿Habrá foto para cada producto? | *"la idea ideal es sacar una foto por producto; por ejemplo tengo 40 autos del mismo modelo, entonces solo sacamos una foto de ese producto, pero debemos distinguir que esos son lo mismo, tiene el mismo precio; alguien va a tomar [las fotos] y al momento de crear un producto la idea es subir la imagen y su precio y los demás campos"* | §13.2 · §13.3 |
| B6 | ¿Hay precio mayorista o por cantidad? | *"son precios únicos"* | §2.3 |
| B7 | ¿Se aplican descuentos en la venta? | *(sin respuesta)* | §22 #1 |
| B8 | ¿Quieres alerta de stock bajo? | *"sí, me parece buena la idea"* | §13.2 |

### Bloque C — Ventas

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| C1 | ¿Cuántas ventas al día? | *"10 o 20 en un día normal, 40 a 90 en navidad"* | §1 · §19 |
| C2 | ¿Cuántas cajas simultáneas? | *"solo 1"* | §1 |
| C3 | ¿Ya tienen lector de código de barras? | *"sí, ya hoy compraremos el lector; aún no tenemos identificado el modelo, pero sí habrá"* | §14.4 · §24 #5 |
| C4 | ¿Se puede vender un producto con stock 0? | *"de momento sí podemos permitir; podemos tener alguna opción o tipo variable de entorno para permitir o no, pero por defecto que deje vender"* | §2.1 C-1 |
| C5 | ¿Un vendedor puede ver las ventas de otro? | *"no debería; cada usuario debería hacer su venta, un vendedor o administrador en caso él atienda la tienda"* | §10.2 · §21 #26 |
| C6 | ¿Hay devoluciones o cambios? | *"no, no hay devoluciones, no se aceptan, políticas de la empresa"* | §2.3 · §15.4 |
| C7 | ¿Quién puede anular una venta? | *"en caso existiera el caso, solo uno con rol de administrador debería hacerlo"* | §15.4 |
| C8 | ¿Se registra el cliente en la venta? | *"puede ser opcional; si no da datos lo podemos poner como anónimo"* | §8.6 · §15.5 |
| C9 | ¿Hay un sistema actual del que migrar? | *"no"* | §2.3 |

### Bloque D — Formas de pago

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| D1 | ¿Aceptan tarjeta de débito o crédito? | *"no, directamente solo efectivo, qr o gift card"* | §15.1 |
| D2 | ¿El QR está conectado a un banco? | *"no tenemos un sistema directamente conectado al qr de un banco; la idea es simple: paga por efectivo, nos da el dinero; paga por QR, nos muestra su registro de pago desde el celular del cliente, le tomamos una foto a eso y la idea es guardar en la venta como registro de que se pagó; y por giftcard que no paga nada, ya que previamente alguien debería haber registrado que salió o se compró un gift card"* | §2.1 C-4 · §15.1 |
| D3 | ¿Con qué celular se fotografía el comprobante? | *"el dueño, llega la confirmación, o el celular que pueden dejar en la tienda"* | §2.1 C-4 · §2.2 |
| D4 | ¿Se paga a veces con dos métodos? | *"no, generalmente se paga con efectivo o qr, no mixta"* | §15.1 |
| D5 | ¿Se aceptan dólares? | *"solo bolivianos"* | §2.3 |

### Bloque E — Gift Cards

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| E1 | ¿Cuántas tarjetas físicas habrá? | *"no se sabe aún"* | §16.2 |
| E2 | ¿Montos fijos o libres? | *"se venden por montos libres o con decimales, hay la opción; ejemplo 10.50"* | §17.1 |
| E3 | ¿Admite consumo parcial? | *"se gasta todo de una vez"* | §2.1 C-2 |
| E4 | ¿Se da vuelto en efectivo del saldo? | *"no"* | §2.1 C-2 |
| E5 | ¿Las tarjetas caducan? | *"no, la idea es reusar los que salen y cuando traen lo tenemos nuevamente; la idea es volver a usarlas si otro cliente lo compra"* | §16.1 · §16.2 |
| E6 | ¿Se pueden recargar? | *"no"* | §16.2 |
| E7 | ¿Quién emite una gift card? | *"debería ser ambos, en caso no esté el administrador"* | §16.2 |
| E8 | ¿Qué se hace con una tarjeta perdida con saldo? | *(sin respuesta)* | §22 #2 |

### Bloque F — Reportes

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| F1 | ¿Qué quieres ver al cerrar el día? | *"lo que gano por día o por una fecha en específico, por semana, mes o año, pero a detalle de qué productos, la cantidad y total, y un total general de todo"* | §18.3 · §19.2 |
| F2 | ¿Hay comisiones a vendedores? | *"no"* | §2.3 |
| F3 | ¿Se registran egresos o gastos? | *"no"* | §2.3 |
| F4 | ¿Hace falta exportar a Excel? | *"basta con un pdf"* | §18.3 |
| F5 | ¿Quieres un ranking de más vendidos? | *"no"* | §2.3 |

### Bloque G — Operación

| ID | Pregunta | Respuesta | → |
|---|---|---|---|
| G1 | ¿Desde qué dispositivo se vende? ¿Es táctil? | *"laptop o computadora, no son táctiles los monitores"* | §2.2 · §15.5 |
| G2 | ¿Cuál es el horario de la tienda? | *"8:00am a 20:00pm"* | §17.2 |
| G3 | ¿Quién carga el catálogo? | *"el vendedor o administrador"* | §2.1 C-3 |
| G4 | ¿Hay fecha objetivo? | *"la idea es terminar este mes"* | §23.2 · §24 #3 |
| G5 | ¿El logo y el fondo son los definitivos? | *"logo.png, ese es logo final"* | §4.7 |

---

## Cierre

Este documento y `CLAUDE.md` son, desde ahora, **la fuente de verdad permanente del
proyecto**. Los dos artefactos que sirvieron para construir el plan —el plan técnico y el
cuestionario— fueron herramientas de análisis: una sesión futura de Claude Code debe poder
entender el proyecto completo leyendo solo estos dos archivos, sin depender de ninguna
conversación ni de ningún enlace externo.

**Ninguna fase está implementada.** El siguiente paso es la **FASE 0A — Limpieza controlada
del proyecto heredado**, y empieza con un commit de los cambios pendientes.
