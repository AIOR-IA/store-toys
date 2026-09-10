import { CommonModule } from '@angular/common';
import { Component, input, output, ViewChild } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-column-filter',
    standalone: true,
    imports: [CommonModule, OverlayPanelModule, ButtonModule, TooltipModule],
    templateUrl: './column-filter.component.html',
    styleUrl: './column-filter.component.scss',
})
export class ColumnFilterComponent {
    @ViewChild('columnFilter') columnFilter!: OverlayPanel;
    
    items = input.required<MenuItem[]>();
    onSelect = output<MenuItem | null>();
    selectedItem: MenuItem | null = null;

    selectItem(item: MenuItem) {
        if (this.isSelected(item)) {
            this.selectedItem = null;
        } else {
            this.selectedItem = item;
        }
        this.onSelect.emit(this.selectedItem);
        if (item.command) {
            item.command({ item });
        }
        // Cerrar el overlay después de seleccionar
        if (this.columnFilter) {
            this.columnFilter.hide();
        }
    }

    isSelected(item: MenuItem): boolean {
        return item.label === this.selectedItem?.label;
    }
}
