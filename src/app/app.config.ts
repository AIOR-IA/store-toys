import {
  ApplicationConfig,
  LOCALE_ID,
  DEFAULT_CURRENCY_CODE,
  provideZoneChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';

//PrimeNg
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideTranslation } from '@core/config';
import { provideFirebase } from '@core/firebase/firebase.providers';

registerLocaleData(localeEs);

/**
 * FASE 0B: conecta el SDK de Firebase (App, Auth, Firestore, Storage,
 * Functions) contra `mi-pimpollito-dev`. Ningún componente los consume
 * todavía — eso empieza en la FASE 1 con la cadena de sesión (plan §6).
 *
 * `provideTranslation()` carga `assets/i18n/es.json` — el catálogo central de
 * textos (plan §4.5).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(),
    provideTranslation(),
    provideFirebase(),
    //PrimeNg
    MessageService,
    ConfirmationService,
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'BOB' },
    // `MoneyPipe` (plan §17.1) lo inyecta con `inject(CurrencyPipe)` en vez
    // de usarlo como pipe de plantilla — por eso necesita estar registrado
    // como provider explícito; el pipe no se auto-provee solo por importar
    // `CommonModule`.
    CurrencyPipe,
  ],
};
