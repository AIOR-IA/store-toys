import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-system-card',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './system-card.component.html',
    styleUrl: './system-card.component.scss',
})
export class SystemCardComponent {
    // Input signals using Angular 17+ syntax
    title = input<string>(''); // Required title parameter
    subtitle = input<string>(''); // Optional subtitle
    showHeader = input<boolean>(true); // Optional flag to show/hide header
    customClass = input<string>(''); // Optional custom CSS classes

    expanded = signal<boolean>(true);

    toggleExpand() {
        this.expanded.update(value => !value);
    }
}
