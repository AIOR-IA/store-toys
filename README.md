# Mi Pimpollito

Sistema administrativo para juguetería (Oruro, Bolivia): usuarios, catálogo de
productos con código de barras, punto de venta, gift cards y reportes.

Angular 18 · PrimeNG 17 · Tailwind · Firebase (Auth · Firestore · Storage · Hosting).

## Documentación

| Documento | Para qué |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Guía operativa rápida: stack, ambientes, roles y reglas de desarrollo |
| [`docs/architecture/mi-pimpollito-plan.md`](docs/architecture/mi-pimpollito-plan.md) | **Fuente de verdad**: arquitectura, modelo de datos, Security Rules, roadmap y decisiones |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Estado y procedimiento de despliegue |

## Desarrollo

```bash
npm install
npm start            # http://localhost:4200
npm run build:dev
```

## Estado

**Fase 0A completada**: el proyecto heredado de SAHTOSO quedó limpio y la base
compila. Firebase todavía no está conectado al repositorio — eso es la Fase 0B.
