import {
    Directive,
    Input,
    AfterViewInit,
    OnDestroy,
    ElementRef,
    Renderer2,
} from '@angular/core';

@Directive({
    selector: '[appTruncateToggle]',
    standalone: true,
})
export class TruncateToggleDirective implements AfterViewInit, OnDestroy {
    /** Longitud máxima antes de truncar */
    @Input('appTruncateToggle') maxLength!: number;
    @Input() moreText: string = 'Ver más';
    @Input() lessText: string = 'Ver menos';

    private originalText: string = '';
    private truncatedText: string = '';
    private isTruncated: boolean = true;
    private clickUnlisten: (() => void) | null = null;

    constructor(
        private el: ElementRef<HTMLElement>,
        private renderer: Renderer2,
    ) {}

    ngAfterViewInit(): void {
        // Esperamos un tick para que Angular interpole el contenido
        setTimeout(() => {
            this.originalText = this.el.nativeElement.textContent?.trim() || '';
            if (this.originalText.length > this.maxLength) {
                this.truncatedText = this.originalText
                    .substring(0, this.maxLength)
                    .trim();
                this.render();
                // Escuchamos el clic del enlace
                this.clickUnlisten = this.renderer.listen(
                    this.el.nativeElement,
                    'click',
                    (event: Event) => {
                        const target = event.target as HTMLElement;
                        if (target.classList.contains('truncate-toggle-btn')) {
                            event.preventDefault();
                            this.toggle();
                        }
                    },
                );
            }
        });
    }

    private render(): void {
        const moreLabel = this.moreText;
        const lessLabel = this.lessText;
        const text = this.isTruncated ? this.truncatedText : this.originalText;
        const label = this.isTruncated ? moreLabel : lessLabel;

        this.renderer.setProperty(
            this.el.nativeElement,
            'innerHTML',
            `${text} <a href="#" class="truncate-toggle-btn">${label}</a>`,
        );
    }

    private toggle(): void {
        this.isTruncated = !this.isTruncated;
        this.render();
    }

    ngOnDestroy(): void {
        this.clickUnlisten?.();
    }
}
