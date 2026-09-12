import { Component, ElementRef } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { LayoutService } from '../../services/app.layout.service';
import { AppMenuComponent } from '../menu/menu.component';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [ButtonModule, AppMenuComponent],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
})
export class AppSidebarComponent {
    constructor(
        public layoutService: LayoutService,
        public el: ElementRef,
    ) {}
}
