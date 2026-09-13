import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { SessionService } from './session.service';

/**
 * Protege las rutas privadas (plan §6.3).
 *
 * Devuelve un `Observable<boolean | UrlTree>`: el router de Angular espera a
 * la primera emisión antes de decidir, así que el guard nunca "adivina" —
 * `ready$` no emite hasta que la cadena de sesión ya sabe si hay alguien
 * autorizado. Esto es lo que hace imposible el bug de recarga en frío por
 * construcción, sin `setTimeout` ni sondeo.
 *
 * Un usuario `rejected` se manda a login con `?denied=<reason>` para que la
 * pantalla pueda mostrar el mensaje correcto sin que él tenga que intentar
 * iniciar sesión de nuevo para enterarse.
 */
export const authGuard: CanActivateFn = () => {
    const session = inject(SessionService);
    const router = inject(Router);

    return session.ready$.pipe(
        take(1),
        map((s) => {
            if (s.status === 'active') return true;
            if (s.status === 'rejected') {
                return router.createUrlTree(['/auth/login'], {
                    queryParams: { denied: s.reason },
                });
            }
            return router.createUrlTree(['/auth/login']);
        }),
    );
};

/**
 * Protege las rutas de invitado (`/auth/login`, `/auth/forgot-password`): si
 * ya hay una sesión `active`, no tiene sentido volver a mostrar el login —
 * se manda al usuario a la pantalla principal.
 *
 * Un usuario `rejected` SÍ puede ver el login (para leer el motivo del
 * rechazo o intentar entrar con otra cuenta): solo se bloquea `active`.
 *
 * Corresponde a lo que en el prompt de la Fase 1 se llama "IsNotAuthGuard".
 */
export const guestGuard: CanActivateFn = () => {
    const session = inject(SessionService);
    const router = inject(Router);

    return session.ready$.pipe(
        take(1),
        map((s) => (s.status === 'active' ? router.createUrlTree(['/']) : true)),
    );
};
