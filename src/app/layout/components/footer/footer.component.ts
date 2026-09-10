import { Component } from '@angular/core';
import { LayoutService } from '../../services/app.layout.service';

@Component({
    selector: 'app-footer',
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.scss',
})
export class AppFooterComponent {
    constructor(public layoutService: LayoutService) {}

    get currentYear() {
        return new Date().getFullYear();
    }
}
