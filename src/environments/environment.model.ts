/**
 * Contrato que ambos environments deben cumplir.
 *
 * Es lo que hace imposible el patrón de MEDIDENT: comentar un campo aquí
 * rompe la compilación, en lugar de fallar en silencio en producción
 * (docs/architecture/mi-pimpollito-plan.md §5.1).
 */
export interface AppEnvironment {
    /** Qué configuración de Angular generó este archivo. */
    name: 'dev' | 'prod';
    /** Alias estándar de Angular, equivalente a `name === 'prod'`. */
    production: boolean;
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

/**
 * ID del proyecto Firebase de DESARROLLO.
 *
 * Sirve para derivar, a partir de `environment.firebase.projectId`, si el
 * build actual —sea `development` o `production`— sigue hablando con DEV.
 *
 * Es la única fuente de verdad del badge de ambiente (plan §5.3). Mientras
 * `mi-pimpollito` (PROD) no exista, `environment.production.ts` apunta
 * TEMPORALMENTE a este mismo proyecto (plan §5.5, decisión del 2026-09-12):
 * comparar contra esta constante, en vez de contra `name` o `production`, es
 * lo que hace que el badge siga viéndose en un build de producción real y
 * desaparezca solo, sin tocar ningún componente, el día que
 * `environment.production.ts` tenga los datos reales de `mi-pimpollito`.
 */
export const FIREBASE_DEV_PROJECT_ID = 'mi-pimpollito-dev';
