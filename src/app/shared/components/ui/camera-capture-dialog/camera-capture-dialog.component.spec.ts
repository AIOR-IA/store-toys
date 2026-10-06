import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { DialogModule, Dialog } from 'primeng/dialog';
import { CameraCaptureDialogComponent } from './camera-capture-dialog.component';

/**
 * Cámara en vivo sin abrir webcam real: `getUserMedia` se simula, y el stream
 * es un `MediaStream` vacío cuyos tracks se reemplazan por espías (así se puede
 * comprobar `stop()` sin hardware).
 */
@Component({
    standalone: true,
    imports: [CameraCaptureDialogComponent],
    template: `
        <app-camera-capture-dialog
            [visible]="open()"
            (visibleChange)="open.set($event)"
            (captured)="captured.push($event)"
        ></app-camera-capture-dialog>
    `,
})
class HostComponent {
    open = signal(false);
    captured: File[] = [];
}

describe('CameraCaptureDialogComponent', () => {
    let fixture: ComponentFixture<HostComponent>;
    let camera: CameraCaptureDialogComponent;
    let getUserMedia: jasmine.Spy;
    let tracks: jasmine.SpyObj<MediaStreamTrack>[];
    let stream: MediaStream;

    const flush = () => new Promise((resolve) => setTimeout(resolve));
    const cameraEl = () => fixture.debugElement.query(By.directive(CameraCaptureDialogComponent)).componentInstance as CameraCaptureDialogComponent;
    const buttonWithText = (text: string): HTMLButtonElement | undefined =>
        Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(text));
    const videoEl = (): HTMLVideoElement | null => document.querySelector('video');

    async function open(): Promise<void> {
        fixture.componentInstance.open.set(true);
        fixture.detectChanges();
        await flush();
        fixture.detectChanges();
    }

    beforeEach(async () => {
        tracks = [jasmine.createSpyObj<MediaStreamTrack>('track', ['stop'])];
        stream = new MediaStream();
        spyOn(stream, 'getTracks').and.callFake(() => tracks as unknown as MediaStreamTrack[]);
        getUserMedia = spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(stream);

        await TestBed.configureTestingModule({
            imports: [HostComponent, DialogModule, TranslateModule.forRoot()],
            providers: [provideNoopAnimations()],
        }).compileComponents();

        fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();
        camera = cameraEl();
    });

    afterEach(() => {
        document.querySelectorAll('.p-dialog-mask').forEach((el) => el.remove());
    });

    it('A) con getUserMedia disponible abre la cámara trasera preferida, sin audio', async () => {
        await open();
        expect(getUserMedia).toHaveBeenCalledOnceWith({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
        });
        expect(camera.liveReady()).toBeTrue();
    });

    it('B) permiso denegado → mensaje de permiso', async () => {
        getUserMedia.and.rejectWith(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
        await open();
        expect(camera.errorKey()).toBe('app.camera.errors.permissionDenied');
        expect(camera.liveReady()).toBeFalse();
    });

    it('C) sin cámara → mensaje de cámara no encontrada', async () => {
        getUserMedia.and.rejectWith(Object.assign(new Error('x'), { name: 'NotFoundError' }));
        await open();
        expect(camera.errorKey()).toBe('app.camera.errors.notFound');
    });

    it('C2) cámara ocupada → mensaje de cámara en uso; seguridad → mensaje HTTPS', async () => {
        getUserMedia.and.rejectWith(Object.assign(new Error('x'), { name: 'NotReadableError' }));
        await open();
        expect(camera.errorKey()).toBe('app.camera.errors.notReadable');

        camera.cancel();
        fixture.componentInstance.open.set(false);
        fixture.detectChanges();
        getUserMedia.and.rejectWith(Object.assign(new Error('x'), { name: 'SecurityError' }));
        await open();
        expect(camera.errorKey()).toBe('app.camera.errors.insecure');
    });

    it('C3) OverconstrainedError reintenta con video genérico', async () => {
        getUserMedia.and.callFake(async (constraints: MediaStreamConstraints) => {
            if (typeof constraints.video === 'object') {
                throw Object.assign(new Error('x'), { name: 'OverconstrainedError' });
            }
            return stream;
        });
        await open();
        expect(getUserMedia).toHaveBeenCalledTimes(2);
        expect(getUserMedia.calls.mostRecent().args[0]).toEqual({ video: true, audio: false });
        expect(camera.liveReady()).toBeTrue();
    });

    it('C4) sin navigator.mediaDevices → mensaje de navegador no compatible', async () => {
        const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
        try {
            await open();
            expect(camera.errorKey()).toBe('app.camera.errors.unsupported');
        } finally {
            if (original) Object.defineProperty(navigator, 'mediaDevices', original);
            else delete (navigator as unknown as Record<string, unknown>)['mediaDevices'];
        }
    });

    it('D) la captura usa videoWidth/videoHeight del video y produce JPEG', async () => {
        await open();
        const video = videoEl()!;
        Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });

        const drawImage = jasmine.createSpy('drawImage');
        const toBlob = jasmine.createSpy('toBlob').and.callFake((cb: BlobCallback) => cb(new Blob(['x'], { type: 'image/jpeg' })));
        const realCreate = document.createElement.bind(document);
        spyOn(document, 'createElement').and.callFake(((tag: string, options?: ElementCreationOptions) => {
            if (tag !== 'canvas') return realCreate(tag, options);
            return { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob } as unknown as HTMLCanvasElement;
        }) as typeof document.createElement);

        camera.capture();
        await flush();

        expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
        expect(toBlob.calls.mostRecent().args[1]).toBe('image/jpeg');
        expect(camera.capturedUrl()).toBeTruthy();
    });

    it('E) Usar foto emite un File JPEG y libera la cámara', async () => {
        await open();
        camera.capturedUrl.set('blob:fake');
        (camera as unknown as { capturedBlob: Blob }).capturedBlob = new Blob(['x'], { type: 'image/jpeg' });

        camera.accept();

        expect(fixture.componentInstance.captured.length).toBe(1);
        expect(fixture.componentInstance.captured[0].type).toBe('image/jpeg');
        expect(tracks[0].stop).toHaveBeenCalled();
        expect(fixture.componentInstance.open()).toBeFalse();
    });

    it('F) Cancelar detiene todos los tracks y no emite foto', async () => {
        await open();
        buttonWithText('app.common.cancel')!.click();
        fixture.detectChanges();
        expect(tracks[0].stop).toHaveBeenCalled();
        expect(fixture.componentInstance.captured.length).toBe(0);
    });

    it('G) la X del dialog (visibleChange de PrimeNG) detiene los tracks', async () => {
        await open();
        fixture.debugElement.query(By.directive(Dialog)).componentInstance.visibleChange.emit(false);
        expect(tracks[0].stop).toHaveBeenCalled();
        expect(fixture.componentInstance.captured.length).toBe(0);
    });

    it('H) destruir el componente detiene los tracks', async () => {
        await open();
        fixture.destroy();
        expect(tracks[0].stop).toHaveBeenCalled();
    });

    it('I) Repetir libera la foto capturada y no la conserva para Usar foto', async () => {
        await open();
        const revoke = spyOn(URL, 'revokeObjectURL');
        camera.capturedUrl.set('blob:captured');
        (camera as unknown as { capturedBlob: Blob }).capturedBlob = new Blob(['x'], { type: 'image/jpeg' });

        camera.retake();

        expect(revoke).toHaveBeenCalledWith('blob:captured');
        expect(camera.capturedUrl()).toBeNull();
        camera.accept();
        expect(fixture.componentInstance.captured.length).toBe(0);
    });

    it('L) mientras captura, una segunda captura no crea otro Blob', async () => {
        await open();
        const video = videoEl()!;
        Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

        const pending: { finish?: (blob: Blob) => void } = {};
        const toBlob = jasmine.createSpy('toBlob').and.callFake((cb: (b: Blob) => void) => {
            pending.finish = cb;
        });
        const realCreate = document.createElement.bind(document);
        spyOn(document, 'createElement').and.callFake(((tag: string, options?: ElementCreationOptions) =>
            tag === 'canvas'
                ? ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }), toBlob } as unknown as HTMLCanvasElement)
                : realCreate(tag, options)) as typeof document.createElement);

        camera.capture();
        camera.capture();
        expect(toBlob).toHaveBeenCalledTimes(1);
        pending.finish!(new Blob(['x'], { type: 'image/jpeg' }));
        await flush();
        expect(camera.capturedUrl()).toBeTruthy();
    });
});
