# Despliegue — Mi Pimpollito

> Reemplaza a `CI-CD-PIPELINE.md` y `DEPLOYMENT-PROTOCOL.md`, que describían el
> despliegue de SAHTOSO (servidor propio + API REST) y no tenían ninguna relación
> con este proyecto.
>
> La estrategia completa está en
> [`architecture/mi-pimpollito-plan.md`](architecture/mi-pimpollito-plan.md) §20.

## Estado actual

> **DEMO = Hosting DEV + backend DEV.** No es producción.
>
> - **PROD real: pendiente.** `mi-pimpollito` no existe todavía (límite de proyectos de la cuenta).
> - **FASE 8 (auditoría de seguridad y Emulator): pendiente.**
> - **FASE 9 se adelantó como despliegue de demostración.** Que exista la URL **no** implica
>   aprobación de producción.

| Ambiente | Project ID | Hosting | Estado |
|---|---|---|---|
| DEMO / DEV | `mi-pimpollito-dev` | `https://mi-pimpollito-dev.web.app` | desplegado; los datos son **de prueba**, no operaciones oficiales de la tienda |
| PROD | `mi-pimpollito` | — | **no creado** |

`ng build` (producción) genera un bundle optimizado que **habla con Firebase DEV**
(`environment.production.ts` es a propósito una copia de `environment.ts`, plan §5.5).
No apunta a ningún proyecto PROD.

## Deploy manual de la demo (solo Hosting)

```bash
firebase use                                   # debe decir mi-pimpollito-dev
npx ng build --configuration production        # salida: dist/pimpollo-frontend/browser
firebase deploy --only hosting -P dev          # SOLO Hosting
```

- **Nunca** `firebase deploy` sin `--only` para publicar un cambio de frontend.
- Functions, Rules e índices se despliegan solo cuando cambian, y por separado:
  `firebase deploy --only functions -P dev` · `firebase deploy --only firestore:rules,firestore:indexes,storage -P dev`.
- `firebase.json` → `hosting.public = dist/pimpollo-frontend/browser`, rewrite `** → /index.html`,
  `index.html` con `no-cache` y los archivos con hash (`js`, `css`, `woff2`, imágenes) con
  `max-age=31536000, immutable`.
- El dominio `mi-pimpollito-dev.web.app` (y `.firebaseapp.com`) vienen autorizados por defecto en
  Authentication. Cualquier dominio propio futuro debe agregarse en
  *Firebase Console → Authentication → Settings → Authorized domains*.

## Cuentas de demostración

No se comparte ninguna cuenta de administrador. Para cada persona autorizada:

1. El admin entra en **Usuarios → Nuevo usuario** (usa la Function `createUser`).
2. Rol **vendedor** (`user`) salvo que necesite funciones administrativas.
3. La contraseña inicial la elige y comunica el admin por un canal privado; no se escribe en el
   repositorio ni en documentos.
4. Al terminar la demo, desactivar la cuenta con el interruptor de activo (soft delete).

Los productos, ventas, Gift Cards y reportes de DEV son **datos de prueba**. No se borran ni se
reinician sin autorización.

## CI/CD (pendiente — propuesta, sin conectar)

Propuesta para DEV, aún **no configurada**:

- Repositorio `AIOR-IA/store-toys`. Trigger: `push` a `master` (y disparo manual `workflow_dispatch`).
- Pasos: `npm ci` → `ng build --configuration production` → `FirebaseExtended/action-hosting-deploy@v0`
  con `channelId: live`, `projectId: mi-pimpollito-dev`.
- **Solo Hosting.** Sin Functions, Rules ni Storage. Sin PROD.
- Permisos del workflow: `contents: read`. Sin `pull_request_target`; los PR de forks no reciben
  secretos.
- Credenciales: las genera el dueño de la cuenta con `firebase init hosting:github` (guarda el
  service account como secreto del repositorio). Ningún JSON pasa por el repositorio ni por chat.

## Regla que no se negocia

Las Security Rules y los índices se despliegan **con el código**, nunca por consola. Si una regla
se cambia por consola, DEV y PROD divergen y el repositorio deja de ser la verdad.

## Lo que llega en cada fase

| Fase | Qué añade al despliegue |
|---|---|
| **0B** | `firebase init`, `.firebaserc` (solo alias `dev`), `environment.ts` con las credenciales de DEV, reglas cerradas desplegadas |
| **1B / 9 adelantada** | Deploy manual a DEV (`--only hosting`), reescritura SPA y cabeceras de caché — **hecho como demo** |
| **8** | Auditoría de seguridad y Firebase Emulator — **pendiente** |
| **9 (completa)** | GitHub Actions: `main` → PROD, `develop` → DEV, PR → preview *en DEV* — **pendiente** |
| **Salida a PROD** | **Bloqueada** hasta que `mi-pimpollito` exista y la Fase 8 esté cerrada |
