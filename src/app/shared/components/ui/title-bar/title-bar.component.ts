import { Component, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Location } from '@angular/common';
import { SplitButtonModule } from 'primeng/splitbutton';
import { Router } from '@angular/router';

@Component({
    selector: 'app-title-bar',
    standalone: true,
    imports: [ButtonModule, SplitButtonModule],
    templateUrl: './title-bar.component.html',
    styleUrl: './title-bar.component.scss',
})
export class TitleBarComponent {
    router = inject(Router);
    title = input.required<string>();
    location = inject(Location);
    newPath = input<string>();
    newLabel = input<string>();
    editPath = input<string>();
    editLabel = input<string>();
    description = input<string>('');
    backPath = input<string>();

    onClickNew = output<Event>();
    onClickEdit = output<Event>();

    goBack(): void {
        if (this.backPath()) {
            this.router.navigate([this.backPath()]).then();
            return;
        }

        this.location.back();
    }

    goToNewPath(path: string | undefined, event: Event) {
        if (path) {
            this.router.navigate([path]).then();
            return;
        }

        this.onClickNew.emit(event);
    }

    goToEditPath(path: string | undefined, event: Event) {
        if (path) {
            this.router.navigate([path]).then();
            return;
        }

        this.onClickEdit.emit(event);
    }
}
