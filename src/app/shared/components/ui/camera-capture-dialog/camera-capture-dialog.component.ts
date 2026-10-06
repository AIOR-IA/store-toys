import { CommonModule } from '@angular/common';
import {
    Component,
    ElementRef,
    OnDestroy,
    ViewChild,
    effect,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
};
const FALLBACK_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };
const CAPTURE_MIME = 'image/jpeg';
const CAPTURE_QUALITY = 0.9;

function stopTracks(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop());
}

function errorKeyFor(error: unknown): string {
    switch ((error as DOMException | undefined)?.name) {
        case 'NotAllowedError':
            return 'app.camera.errors.permissionDenied';
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return 'app.camera.errors.notFound';
        case 'NotReadableError':
        case 'TrackStartError':
            return 'app.camera.errors.notReadable';
        case 'SecurityError':
            return 'app.camera.errors.insecure';
        default:
            return 'app.camera.errors.unknown';
    }
}

/**
 * Captura en vivo desde la cámara del dispositivo (webcam en laptop, trasera en
 * celular). Solo produce un `File` JPEG: lo que pase después (compresión, preview,
 * Storage) lo decide quien lo usa, igual que el selector de archivo.
 *
 * Ciclo de vida del stream: se abre al mostrarse y se libera SIEMPRE que se
 * cierra (Cancelar, X, Escape, usar la foto, destruir el componente). Un inicio
 * que termina después de cerrar se descarta, así que nunca queda una cámara activa.
 */
@Component({
    selector: 'app-camera-capture-dialog',
    standalone: true,
    imports: [CommonModule, DialogModule, ButtonModule, TranslateModule],
    templateUrl: './camera-capture-dialog.component.html',
})
export class CameraCaptureDialogComponent implements OnDestroy {
    visible = input.required<boolean>();
    visibleChange = output<boolean>();
    captured = output<File>();

    cameraLoading = signal(false);
    liveReady = signal(false);
    busy = signal(false);
    errorKey = signal<string | null>(null);
    capturedUrl = signal<string | null>(null);

    private stream: MediaStream | null = null;
    private capturedBlob: Blob | null = null;
    private videoElement: HTMLVideoElement | null = null;
    /** Invalida inicios de cámara pendientes cuando el diálogo se cierra antes de que terminen. */
    private session = 0;

    @ViewChild('video') set videoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
        this.videoElement = ref?.nativeElement ?? null;
        if (this.videoElement) this.videoElement.srcObject = this.stream;
    }

    constructor() {
        effect(() => {
            const open = this.visible();
            untracked(() => (open ? void this.startCamera() : this.stopCamera()));
        });
    }

    ngOnDestroy(): void {
        this.stopCamera();
    }

    capture(): void {
        const video = this.videoElement;
        if (this.busy() || this.capturedBlob || !this.liveReady()) return;
        if (!video || !video.videoWidth || !video.videoHeight) {
            this.errorKey.set('app.camera.errors.notReady');
            return;
        }

        this.busy.set(true);
        this.errorKey.set(null);
        this.captureFrame(video)
            .then((blob) => {
                if (!this.stream) return;
                this.capturedBlob = blob;
                this.capturedUrl.set(URL.createObjectURL(blob));
            })
            .catch(() => this.errorKey.set('app.camera.errors.capture'))
            .finally(() => this.busy.set(false));
    }

    retake(): void {
        this.resetCapture();
        this.errorKey.set(null);
    }

    accept(): void {
        const blob = this.capturedBlob;
        if (!blob) return;
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: CAPTURE_MIME });
        this.close();
        this.captured.emit(file);
    }

    cancel(): void {
        this.close();
    }

    private close(): void {
        this.stopCamera();
        this.visibleChange.emit(false);
    }

    private async startCamera(): Promise<void> {
        const session = ++this.session;
        this.resetCapture();
        this.errorKey.set(null);
        this.liveReady.set(false);
        this.cameraLoading.set(true);

        if (!navigator.mediaDevices?.getUserMedia) {
            this.fail(session, 'app.camera.errors.unsupported');
            return;
        }
        if (!window.isSecureContext) {
            this.fail(session, 'app.camera.errors.insecure');
            return;
        }

        try {
            const stream = await this.requestStream();
            if (session !== this.session) {
                stopTracks(stream);
                return;
            }
            this.stream = stream;
            if (this.videoElement) this.videoElement.srcObject = stream;
            this.liveReady.set(true);
        } catch (error) {
            this.fail(session, errorKeyFor(error));
        } finally {
            if (session === this.session) this.cameraLoading.set(false);
        }
    }

    private async requestStream(): Promise<MediaStream> {
        try {
            return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        } catch (error) {
            if ((error as DOMException | undefined)?.name === 'OverconstrainedError') {
                return navigator.mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
            }
            throw error;
        }
    }

    private fail(session: number, key: string): void {
        if (session !== this.session) return;
        this.errorKey.set(key);
        this.cameraLoading.set(false);
        this.liveReady.set(false);
    }

    private stopCamera(): void {
        this.session++;
        if (this.stream) stopTracks(this.stream);
        this.stream = null;
        if (this.videoElement) this.videoElement.srcObject = null;
        this.cameraLoading.set(false);
        this.liveReady.set(false);
        this.resetCapture();
    }

    private resetCapture(): void {
        this.capturedBlob = null;
        const url = this.capturedUrl();
        if (url) URL.revokeObjectURL(url);
        this.capturedUrl.set(null);
    }

    private captureFrame(video: HTMLVideoElement): Promise<Blob> {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return Promise.reject(new Error('no-2d-context'));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve, reject) =>
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('capture-encode-failed'))),
                CAPTURE_MIME,
                CAPTURE_QUALITY,
            ),
        );
    }
}
