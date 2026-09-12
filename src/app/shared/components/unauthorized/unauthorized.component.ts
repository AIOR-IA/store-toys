import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-unauthorized',
    standalone: true,
    imports: [RouterLink, TranslateModule],
    templateUrl: './unauthorized.component.html',
    styleUrl: './unauthorized.component.scss',
})
export class UnauthorizedComponent {}
