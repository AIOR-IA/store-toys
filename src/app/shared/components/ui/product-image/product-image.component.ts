import { CommonModule } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Miniatura de producto con placeholder (ajuste posterior a la Fase 3: la
 * imagen ya es opcional). Evita repetir en cada lista el mismo
 * `@if (imageUrl) { img } @else { icono }` — y, sobre todo, evita el bug real
 * de enlazar `[src]` a `undefined`: Angular asigna la propiedad `src` del DOM
 * igual, el navegador la convierte en la cadena `"undefined"` y dispara una
 * petición de red a esa URL.
 */
@Component({
    selector: 'app-product-image',
    standalone: true,
    imports: [CommonModule, TranslateModule],
    templateUrl: './product-image.component.html',
})
export class ProductImageComponent {
    src = input<string | null | undefined>(null);
    /** Clases Tailwind de tamaño, p. ej. "w-10 h-10". */
    sizeClass = input<string>('w-10 h-10');
    /** Solo tiene sentido en miniaturas grandes; en chicas no entra el texto. */
    showLabel = input<boolean>(false);

    /** Solo se emite cuando SÍ hay imagen — el placeholder nunca abre el viewer. */
    viewRequested = output<string>();

    readonly hasImage = computed(() => !!this.src());

    onClick(): void {
        const url = this.src();
        if (url) this.viewRequested.emit(url);
    }
}
