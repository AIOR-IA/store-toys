import { CommonModule } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { TooltipModule } from 'primeng/tooltip';
import { DEFAULT_PAGE_SIZE } from '@core/data';

/**
 * Paginador sin salto de página (plan §12.1): *Primera · Anterior ·
 * Siguiente*, el rango mostrado, el total y el selector de tamaño. Ofrecer
 * "ir a la página 7" mentiría sobre lo que Firestore puede hacer — por eso no
 * hay un input de número de página.
 */
@Component({
    selector: 'app-cards-paginator',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TranslateModule,
        ButtonModule,
        DropdownModule,
        TooltipModule,
    ],
    templateUrl: './cards-paginator.component.html',
    styleUrl: './cards-paginator.component.scss',
})
export class CardsPaginatorComponent {
    hasNextPage = input.required<boolean>();
    hasPreviousPage = input.required<boolean>();

    /** Total y tamaño de página — omitidos, el componente se comporta como antes (solo Anterior/Siguiente). */
    total = input<number | null>(null);
    currentCount = input<number>(0);
    pageSizeOptions = input<number[]>([]);
    pageSize = model<number>(DEFAULT_PAGE_SIZE);

    onFirst = output<void>();
    onNext = output<void>();
    onPrevious = output<void>();
    onPageSizeChange = output<number>();

    onFirstPage(): void {
        this.onFirst.emit();
    }

    onPreviousPage(): void {
        this.onPrevious.emit();
    }

    onNextPage(): void {
        this.onNext.emit();
    }

    changePageSize(size: number): void {
        this.pageSize.set(size);
        this.onPageSizeChange.emit(size);
    }
}
