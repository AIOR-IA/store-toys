import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Observable, from, shareReplay } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppSettings } from '@core/models';

/**
 * Configuración única en `settings/app` (plan §8.3).
 *
 * Fase 4 es la primera en necesitar el modelo completo: `allowSaleWithoutStock`
 * y `timezone` los lee `createSale` en servidor (vía Admin SDK, no este
 * servicio), y los datos de la tienda van en el comprobante (plan §18.4). Si
 * el documento todavía no existe (se siembra a mano una sola vez, igual que
 * `counters/internalCode`, §7.1), se usan valores por defecto para que el
 * catálogo y las ventas no queden bloqueados antes de ese paso manual.
 *
 * Una lectura por sesión, cacheada en memoria con `shareReplay` — nunca
 * `onSnapshot` (CLAUDE.md: tiempo real solo en la cadena de sesión).
 */
const DEFAULT_SETTINGS: Omit<AppSettings, 'updatedAt'> = {
    storeName: 'Mi Pimpollito',
    storeTagline: 'JUGUETERÍA',
    storeDescription: 'Artículos y accesorios para Niños',
    address: '',
    phone: '',
    currency: 'BOB',
    timezone: 'America/La_Paz',
    internalCodePrefix: 'MP',
    giftCardPrefix: 'GC',
    lowStockThreshold: 3,
    allowSaleWithoutStock: true,
    giftCardAllowsPartial: false,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
    private readonly firestore = inject(Firestore);
    private cached$?: Observable<AppSettings>;

    getSettings(): Observable<AppSettings> {
        if (!this.cached$) {
            const ref = doc(this.firestore, 'settings', 'app');
            this.cached$ = from(getDoc(ref)).pipe(
                map((snap) =>
                    snap.exists()
                        ? (snap.data() as AppSettings)
                        : ({ ...DEFAULT_SETTINGS } as AppSettings),
                ),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
        }
        return this.cached$;
    }
}
