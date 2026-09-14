import { CurrencyPipe } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { fromCents } from '@core/utils';

/**
 * `{{ p.priceCents | money }}` → `Bs 10,50` (plan §17.1).
 *
 * La base de datos guarda enteros en centavos; este pipe es el único punto
 * donde eso se vuelve a convertir a bolivianos para mostrarlo, delegando el
 * formato regional a `CurrencyPipe` (la app ya fija `LOCALE_ID: 'es'` y
 * `DEFAULT_CURRENCY_CODE: 'BOB'` en `app.config.ts`).
 */
@Pipe({
    name: 'money',
    standalone: true,
})
export class MoneyPipe implements PipeTransform {
    private readonly currencyPipe = inject(CurrencyPipe);

    transform(cents: number | null | undefined): string {
        if (cents === null || cents === undefined) return '';
        return (
            this.currencyPipe.transform(
                fromCents(cents),
                'BOB',
                'Bs',
                '1.2-2',
            ) ?? ''
        );
    }
}
