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

registerLocaleData(localeEs);

/**
 * FASE 0A: se retiraron el interceptor JWT heredado y ngx-translate.
 * `provideHttpClient()` se conserva porque `icons-dropdown` lee un JSON local.
 * Los `provide*` de Firebase se añaden en la FASE 0B.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(),
    //PrimeNg
    MessageService,
    ConfirmationService,
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'BOB' },
  ],
};
