# Despliegue — Mi Pimpollito

> Reemplaza a `CI-CD-PIPELINE.md` y `DEPLOYMENT-PROTOCOL.md`, que describían el
> despliegue de SAHTOSO (servidor propio + API REST) y no tenían ninguna relación
> con este proyecto.
>
> La estrategia completa está en
> [`architecture/mi-pimpollito-plan.md`](architecture/mi-pimpollito-plan.md) §20.

## Estado actual (tras la Fase 0A)

**Todavía no hay despliegue posible.** El repositorio no tiene `firebase.json`,
`.firebaserc` ni configuración de ambientes conectada a Firebase: eso es la **Fase 0B**.

| Ambiente | Project ID | Estado |
|---|---|---|
| DEV | `mi-pimpollito-dev` | proyecto creado y configurado en consola; sin conectar al repo |
| PROD | `mi-pimpollito` | **no creado** — la cuenta alcanzó el límite de proyectos |

## Comandos de build

```bash
npm start            # ng serve  → desarrollo
npm run build:dev    # ng build --configuration development
```

`npm run build` (configuración `production`) **no se usa** mientras `mi-pimpollito`
no exista: no debe generarse un bundle "de producción" que apunte a DEV
(plan §5.5).

## Lo que llega en cada fase

| Fase | Qué añade al despliegue |
|---|---|
| **0B** | `firebase init`, `.firebaserc` (solo alias `dev`), `environment.ts` con las credenciales de DEV, reglas cerradas desplegadas |
| **1B** | Primer despliegue manual a DEV: `firebase deploy --only hosting -P dev`, reescritura SPA y cabeceras de caché |
| **5** | Salida a producción — **bloqueada** hasta que `mi-pimpollito` pueda crearse |
| **9** | GitHub Actions: `main` → PROD, `develop` → DEV, PR → preview *en DEV* |

## Regla que no se negocia

Las Security Rules y los índices se despliegan **con el código**, nunca por consola:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage -P dev
```

Si una regla se cambia por consola, DEV y PROD divergen y el repositorio deja de
ser la verdad.
