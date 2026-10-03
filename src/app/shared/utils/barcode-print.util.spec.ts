import { printBarcodeLabel } from './barcode-print.util';

/**
 * Lifecycle del popup de impresión (causa raíz del bloqueo reproducido
 * manualmente en Chromium: el popup nunca se cerraba — ni al imprimir ni al
 * cancelar — y al compartir proceso de renderizado con la app, el siguiente
 * `window.print()` volvía a congelarla).
 *
 * `window.open` se mockea con un popup falso que registra cada llamada
 * (`document.write`, `addEventListener`, `close`…) y expone `emit(event)`
 * para disparar `afterprint` a mano, como lo haría el navegador real. El
 * `jsbarcode` real corre sin mock (igual que en los specs de etiquetas de
 * Productos): es renderizado síncrono a SVG, sin red.
 */
function fakePopup() {
    const listeners: Record<string, (() => void)[]> = {};
    const popup = {
        closed: false,
        document: { write: jasmine.createSpy('write'), close: jasmine.createSpy('close') },
        onload: null as (() => void) | null,
        focus: jasmine.createSpy('focus'),
        print: jasmine.createSpy('print'),
        close: jasmine.createSpy('close').and.callFake(() => {
            popup.closed = true;
        }),
        addEventListener: jasmine
            .createSpy('addEventListener')
            .and.callFake((type: string, fn: () => void) => {
                (listeners[type] ??= []).push(fn);
            }),
        removeEventListener: jasmine
            .createSpy('removeEventListener')
            .and.callFake((type: string, fn: () => void) => {
                listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
            }),
        emit: (type: string) => {
            for (const fn of listeners[type] ?? []) fn();
        },
        listenerCount: (type: string) => (listeners[type] ?? []).length,
    };
    return popup;
}

type FakePopup = ReturnType<typeof fakePopup>;

describe('printBarcodeLabel — lifecycle del popup de impresión', () => {
    let openSpy: jasmine.Spy;
    let windowFocusListeners: (() => void)[];
    let realAddEventListener: typeof window.addEventListener;
    let realRemoveEventListener: typeof window.removeEventListener;

    /** Simula el navegador terminando de cargar el documento escrito con `document.write`. */
    const load = async (popup: FakePopup) => {
        await Promise.resolve(); // deja correr el `await renderBarcodeSvg(...)` antes del onload
        await Promise.resolve();
        popup.onload?.();
    };
    const emitOpenerFocus = () => windowFocusListeners.slice().forEach((fn) => fn());

    beforeEach(() => {
        windowFocusListeners = [];
        realAddEventListener = window.addEventListener.bind(window);
        realRemoveEventListener = window.removeEventListener.bind(window);
        spyOn(window, 'addEventListener').and.callFake(((type: string, fn: EventListenerOrEventListenerObject) => {
            if (type === 'focus') {
                windowFocusListeners.push(fn as () => void);
            } else {
                realAddEventListener(type, fn);
            }
        }) as typeof window.addEventListener);
        spyOn(window, 'removeEventListener').and.callFake(((type: string, fn: EventListenerOrEventListenerObject) => {
            if (type === 'focus') {
                windowFocusListeners = windowFocusListeners.filter((l) => l !== fn);
            } else {
                realRemoveEventListener(type, fn);
            }
        }) as typeof window.removeEventListener);
        openSpy = spyOn(window, 'open');
    });

    it('1–3. abre el popup, escribe el HTML y llama print() tras cargar', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);

        const ok = await printBarcodeLabel({ code: 'GC1000-001', primaryText: 'GC1000-001' });
        expect(ok).toBeTrue();
        expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=400,height=300');
        expect(popup.document.write).toHaveBeenCalledTimes(1); // el contenido ya se escribió
        expect(popup.document.write.calls.mostRecent().args[0]).toContain('GC1000-001');
        expect(popup.document.close).toHaveBeenCalledTimes(1);
        expect(popup.print).not.toHaveBeenCalled(); // print() espera a onload

        await load(popup); // simula el \`load\` real del documento ya escrito
        expect(popup.focus).toHaveBeenCalledTimes(1);
        expect(popup.print).toHaveBeenCalledTimes(1);
    });

    it('4. afterprint cierra el popup', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popup);

        popup.emit('afterprint');
        expect(popup.close).toHaveBeenCalledTimes(1);
    });

    it('5. cancelar el preview también dispara afterprint y cierra (misma ruta que imprimir)', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popup);

        popup.emit('afterprint'); // el navegador dispara el mismo evento al cancelar
        expect(popup.closed).toBeTrue();
    });

    it('6. si afterprint NO dispara (inconsistencia conocida de Chromium), el foco del opener cierra el popup', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popup);

        expect(popup.close).not.toHaveBeenCalled();
        emitOpenerFocus();
        expect(popup.close).toHaveBeenCalledTimes(1);
    });

    it('7. cleanup doble (afterprint y luego el foco) no falla y cierra una sola vez', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popup);

        popup.emit('afterprint');
        expect(() => emitOpenerFocus()).not.toThrow();
        expect(popup.close).toHaveBeenCalledTimes(1);
    });

    it('8. un popup ya cerrado por el usuario no se intenta cerrar otra vez', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popup);

        popup.closed = true; // el usuario cerró la ventana a mano
        emitOpenerFocus();
        expect(popup.close).not.toHaveBeenCalled();
    });

    it('9. window.open bloqueado: false, sin listeners, sin estado residual', async () => {
        openSpy.and.returnValue(null);
        const ok = await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        expect(ok).toBeFalse();
        expect(windowFocusListeners.length).toBe(0);

        // Un intento siguiente, ya con un popup real, no arrastra nada del intento bloqueado.
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        expect(await printBarcodeLabel({ code: 'B', primaryText: 'B' })).toBeTrue();
    });

    it('10. una excepción antes de print() (document.write) deja el popup cerrado', async () => {
        const popup = fakePopup();
        popup.document.write.and.throwError('boom');
        openSpy.and.returnValue(popup as unknown as Window);

        const ok = await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        expect(ok).toBeFalse();
        expect(popup.close).toHaveBeenCalledTimes(1);
    });

    it('11–12. un segundo print (o un doble click) cierra el popup anterior y no acumula ventanas', async () => {
        const popupA = fakePopup();
        const popupB = fakePopup();
        openSpy.and.returnValues(popupA as unknown as Window, popupB as unknown as Window);

        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popupA);
        expect(popupA.close).not.toHaveBeenCalled();

        await printBarcodeLabel({ code: 'B', primaryText: 'B' }); // sin cerrar A a mano — doble click / otra etiqueta
        expect(popupA.close).toHaveBeenCalledTimes(1); // el anterior se cerró
        await load(popupB);
        expect(popupB.print).toHaveBeenCalledTimes(1);
        expect(openSpy).toHaveBeenCalledTimes(2); // nunca una tercera ventana
    });

    it('13. tras el cleanup no queda el listener de foco en la ventana principal', async () => {
        const popup = fakePopup();
        openSpy.and.returnValue(popup as unknown as Window);
        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popup);
        expect(windowFocusListeners.length).toBe(1);

        popup.emit('afterprint');
        expect(windowFocusListeners.length).toBe(0);
    });

    it('14. una impresión posterior, tras un ciclo completo, vuelve a funcionar normalmente', async () => {
        const popupA = fakePopup();
        const popupB = fakePopup();
        openSpy.and.returnValues(popupA as unknown as Window, popupB as unknown as Window);

        await printBarcodeLabel({ code: 'A', primaryText: 'A' });
        await load(popupA);
        popupA.emit('afterprint');

        const ok = await printBarcodeLabel({ code: 'B', primaryText: 'B' });
        expect(ok).toBeTrue();
        await load(popupB);
        expect(popupB.print).toHaveBeenCalledTimes(1);
        expect(popupA.close).toHaveBeenCalledTimes(1); // no se vuelve a tocar el popup anterior
    });
});
