import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { environment } from '../../../environments/environment';

/**
 * Región de las Cloud Functions. La misma que Firestore
 * (docs/architecture/mi-pimpollito-plan.md §5.4, §7.3): una Function que hace
 * varias operaciones dentro de una transacción paga el salto de región tantas
 * veces como operaciones tenga si están en regiones distintas.
 */
export const FUNCTIONS_REGION = 'southamerica-west1';

/**
 * Infraestructura de Firebase para toda la app.
 *
 * FASE 0B: solo conecta el SDK. Nada de esto implementa lógica de negocio ni
 * la cadena de sesión (eso es la FASE 1) — son los `provide*` de
 * `@angular/fire@18`, zone-aware, que la FASE 1 consumirá con `authState()`,
 * `docData()` y `collectionData()` (plan §4.1).
 *
 * `initializeApp` recibe `environment.firebase`. Hoy eso es siempre
 * `mi-pimpollito-dev` en los dos environments — también en `production` — de
 * forma TEMPORAL, porque `mi-pimpollito` (PROD) todavía no se puede crear
 * (plan §5.5, decisión del 2026-09-12). El día que exista, solo cambia el
 * objeto `firebase` de `environment.production.ts`: este archivo no se toca.
 */
export function provideFirebase(): EnvironmentProviders {
    return makeEnvironmentProviders([
        provideFirebaseApp(() => initializeApp(environment.firebase)),
        provideAuth(() => getAuth()),
        provideFirestore(() => getFirestore()),
        provideStorage(() => getStorage()),
        // Región fijada ahora para que nadie la olvide al escribir la primera
        // Function en la FASE 2. Sin lógica de negocio todavía.
        provideFunctions(() => getFunctions(getApp(), FUNCTIONS_REGION)),
    ]);
}
