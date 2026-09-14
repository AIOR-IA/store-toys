import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Observable, from, shareReplay } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppSettings } from '@core/models';

/**
 * Configuración única en `settings/app` (plan §8.3).
 *
 * Fase 3 solo consume `internalCodePrefix` y `lowStockThreshold` — el resto
 * del modelo del plan (moneda, políticas de venta, prefijo de gift card)
 * llega con la fase que lo necesite. Si el documento todavía no existe (se
 * siembra a mano una sola vez, igual que `counters/internalCode`, §7.1), se
 * usan valores por defecto para que el catálogo no quede bloqueado antes de
 * ese paso manual.
 *
 * Una lectura por sesión, cacheada en memoria con `shareReplay` — nunca
 * `onSnapshot` (CLAUDE.md: tiempo real solo en la cadena de sesión).
 */
const DEFAULT_SETTINGS: Omit<AppSettings, 'updatedAt'> = {
    internalCodePrefix: 'MP',
    lowStockThreshold: 3,
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
