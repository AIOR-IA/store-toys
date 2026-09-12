import { AppEnvironment } from './environment.model';

/**
 * DEV — lo que usa `ng serve` y `ng build --configuration development`.
 * Es la base: no hay `fileReplacements` para esta configuración.
 *
 * Las claves `firebase.*` del cliente web NO son secretos: son identificadores
 * públicos del proyecto. Lo que protege los datos son las Security Rules, no
 * ocultar el `apiKey` (plan §5.1).
 */
export const environment: AppEnvironment = {
    name: 'dev',
    production: false,
    firebase: {
        apiKey: 'AIzaSyDFJlVXAqP3gTwCa1gUGuA8GDqNZ6CV0Yo',
        authDomain: 'mi-pimpollito-dev.firebaseapp.com',
        projectId: 'mi-pimpollito-dev',
        storageBucket: 'mi-pimpollito-dev.firebasestorage.app',
        messagingSenderId: '565215554533',
        appId: '1:565215554533:web:79c6b4db18d3f090929d0c',
    },
    useEmulators: false,
};
