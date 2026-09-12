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
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideTranslation } from '@core/config';

registerLocaleData(localeEs);

/**
 * FASE 0A: se retiró el interceptor JWT heredado. Los `provide*` de Firebase
 * se añaden en la FASE 0B.
 *
 * `provideTranslation()` carga `assets/i18n/es.json` — el catálogo central de
 * textos (§4.5 del plan).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(),
    provideTranslation(),
    //PrimeNg
    MessageService,
    ConfirmationService,
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'BOB' },
  ],
};
