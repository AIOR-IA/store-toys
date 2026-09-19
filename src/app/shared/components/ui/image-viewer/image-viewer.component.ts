import { Component, ElementRef, OnDestroy, effect, inject, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Visor ligero de una sola imagen a pantalla completa. Recibe la URL (de
 * Storage o un object URL local) y avisa con `closed` al cerrar; quien lo usa
 * decide qué hacer con su propio estado. El elemento se mueve al `body` para
 * quedar por encima del layout y de cualquier p-dialog (fixed no depende de
 * ancestros transformados).
 */
@Component({
    selector: 'app-image-viewer',
    standalone: true,
    imports: [TranslateModule],
    templateUrl: './image-viewer.component.html',
    styleUrl: './image-viewer.component.scss',
})
export class ImageViewerComponent implements OnDestroy {
    src = input<string | null>(null);
    closed = output<void>();

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    // Captura + stopPropagation: el Escape cierra solo el visor, no el p-dialog de abajo.
    private readonly onKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.preventDefault();
        this.closed.emit();
    };

    constructor() {
        document.body.appendChild(this.host);
        effect((onCleanup) => {
            if (!this.src()) return;
            document.addEventListener('keydown', this.onKeydown, true);
            onCleanup(() => document.removeEventListener('keydown', this.onKeydown, true));
        });
    }

    ngOnDestroy(): void {
        document.removeEventListener('keydown', this.onKeydown, true);
        this.host.remove();
    }
}
