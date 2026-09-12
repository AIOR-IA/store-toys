import { AppEnvironment } from './environment.model';

/**
 * PROD — lo que usa `ng build --configuration production` (y `ng build` a
 * secas, que es la configuración por defecto).
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  TEMPORAL — decisión del 2026-09-12 (reemplaza la regla anterior de que
 *  "production queda bloqueado hasta que exista mi-pimpollito").
 *
 *  Google no deja crear el proyecto Firebase `mi-pimpollito` hasta dentro de
 *  ~30 días (límite de proyectos de la cuenta, plan §5.5). Mientras tanto,
 *  los builds de PRODUCCIÓN de Angular usan el MISMO proyecto Firebase que
 *  DEV (`mi-pimpollito-dev`) — no existe todavía un Firebase real de
 *  producción.
 *
 *  Cuando `mi-pimpollito` pueda crearse, lo único que cambia es el objeto
 *  `firebase` de este archivo (plan §5.5): registrar su Web App, habilitar
 *  Authentication, crear Firestore y Storage, configurar Functions, copiar
 *  las Rules e índices, reemplazar los seis valores de abajo por los reales,
 *  añadir el alias `prod` a `.firebaserc`, y desplegar. La arquitectura del
 *  Angular (`AppEnvironment`, `fileReplacements`, `provideFirebase()`) no se
 *  toca: fue diseñada exactamente para que este día sea editar un archivo,
 *  no rehacer nada.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const environment: AppEnvironment = {
    name: 'prod',
    production: true,
    firebase: {
        // TEMPORAL: mismo proyecto que DEV — ver el aviso de arriba.
        apiKey: 'AIzaSyDFJlVXAqP3gTwCa1gUGuA8GDqNZ6CV0Yo',
        authDomain: 'mi-pimpollito-dev.firebaseapp.com',
        projectId: 'mi-pimpollito-dev',
        storageBucket: 'mi-pimpollito-dev.firebasestorage.app',
        messagingSenderId: '565215554533',
        appId: '1:565215554533:web:79c6b4db18d3f090929d0c',
    },
    useEmulators: false,
};
