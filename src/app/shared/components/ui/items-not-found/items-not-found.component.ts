import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-items-not-found',
    standalone: true,
    imports: [TranslateModule],
    templateUrl: './items-not-found.component.html',
    styleUrl: './items-not-found.component.scss',
})
export class ItemsNotFoundComponent {}
