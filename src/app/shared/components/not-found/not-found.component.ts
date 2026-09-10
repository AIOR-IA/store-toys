import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
@Component({
    selector: 'app-not-found',
    standalone: true,
    imports: [],
    templateUrl: './not-found.component.html',
    styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {
    location = inject(Location);

    goBack() {
        this.location.back();
    }
}
