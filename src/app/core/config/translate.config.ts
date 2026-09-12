import { HttpClient } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

/** Único idioma del sistema por ahora. */
export const DEFAULT_LANG = 'es';

export function translateHttpLoaderFactory(http: HttpClient): TranslateLoader {
    return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

/**
 * Infraestructura de i18n.
 *
 * `ngx-translate` se conserva **no** para tener varios idiomas, sino para que
 * `src/assets/i18n/es.json` sea el catálogo central de textos y no queden
 * strings sueltos en los componentes. Hoy solo existe español.
 *
 * `@ngx-translate/core@15` no expone `provideTranslateService`, así que el
 * patrón standalone es `importProvidersFrom(TranslateModule.forRoot(...))`.
 * `defaultLanguage` deja que la librería dispare la carga de `es.json` sola:
 * no hace falta ningún `translate.use()` en el arranque.
 *
 * REGLA: los textos se consumen con el **pipe** `| translate` en las
 * plantillas. Nunca construyendo modelos dentro de `translate.get(...).subscribe()`
 * —el patrón heredado de SAHTOSO que dejaba el sidebar vacío en el arranque
 * (docs/architecture/mi-pimpollito-plan.md §3.3, hallazgo 6)—.
 */
export const provideTranslation = () =>
    importProvidersFrom(
        TranslateModule.forRoot({
            defaultLanguage: DEFAULT_LANG,
            loader: {
                provide: TranslateLoader,
                useFactory: translateHttpLoaderFactory,
                deps: [HttpClient],
            },
        }),
    );
