import { Component, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Location } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SplitButtonModule } from 'primeng/splitbutton';
import { Router } from '@angular/router';

@Component({
    selector: 'app-title-list',
    standalone: true,
    imports: [ButtonModule, TranslateModule, SplitButtonModule],
    templateUrl: './title-list.component.html',
    styleUrl: './title-list.component.scss',
})
export class TitleListComponent {
    backPath = input<string>();
    router = inject(Router);
    location = inject(Location);
    title = input.required<string>();
    description = input<string>('');


    goBack(): void {
        if (this.backPath()) {
            this.router.navigate([this.backPath()]).then();
            return;
        }

        this.location.back();
    }

}
