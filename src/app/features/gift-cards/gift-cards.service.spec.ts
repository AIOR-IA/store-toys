import { TestBed } from '@angular/core/testing';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { Functions } from '@angular/fire/functions';
import { GiftCardsService } from './gift-cards.service';

/**
 * Primera spec de `GiftCardsService` (Fase C, plan §16.22).
 *
 * `generateTopUpId()` es puro (sin red, sin escribir nada) y se prueba
 * directo. `topUpGiftCard()` en cambio llama a `httpsCallable` de
 * `@angular/fire/functions` — una función LIBRE del módulo, no un método de
 * una clase inyectable. Se intentó interceptarla con `spyOn` (rechazado:
 * "httpsCallable is not declared writable or has no setter") y con
 * `Object.defineProperty` (rechazado: "Cannot redefine property:
 * httpsCallable" — TypeError real, no una restricción de Jasmine): el
 * export compilado es un getter de solo lectura y NO configurable. No hay
 * forma de probar el payload/la respuesta/el error de `topUpGiftCard` sin
 * un emulador real de Functions.
 *
 * Esto no es una laguna de esta Function en particular: NINGÚN método
 * basado en `httpsCallable` en todo el proyecto (`createSale`, `cancelSale`,
 * `activateGiftCard`, `registerGiftCard`, etc. — más de una decena) tiene
 * una spec que pruebe su invocación/payload/respuesta de esta forma — se
 * verifican por otra vía: el comportamiento real de la Function en
 * `tests/functions/sales.harness.js`, y el contrato que consume cada
 * componente mockeando el SERVICIO completo (ver, por ejemplo,
 * `gift-card-detail-dialog.component.spec.ts`), nunca `httpsCallable` en
 * aislamiento. `topUpGiftCard` sigue exactamente ese mismo patrón.
 */
describe('GiftCardsService.generateTopUpId — sin red, sin escribir nada', () => {
    let service: GiftCardsService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideFirebaseApp(() => initializeApp({ projectId: 'demo-spec' })),
                provideFirestore(() => getFirestore()),
                { provide: Functions, useValue: {} },
            ],
        });
        service = TestBed.inject(GiftCardsService);
    });

    it('devuelve un ID no vacío', () => {
        expect(service.generateTopUpId()).toBeTruthy();
    });

    it('dos llamadas devuelven IDs distintos (mismo mecanismo que generateSaleId)', () => {
        const id1 = service.generateTopUpId();
        const id2 = service.generateTopUpId();
        expect(id1).not.toBe(id2);
    });
});
