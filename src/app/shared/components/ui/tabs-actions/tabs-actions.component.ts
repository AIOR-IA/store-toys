import { Component, inject, input, model, OnInit, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
    FilterTabComponent,
    FilterTabOption,
} from '../filter-tab/filter-tab.component';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { Location } from '@angular/common';

@Component({
    selector: 'app-tabs-actions',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        FilterTabComponent,
        ButtonModule,
        TooltipModule,
        TranslateModule,
    ],
    templateUrl: './tabs-actions.component.html',
    styleUrl: './tabs-actions.component.scss',
})
export class TabsActionsComponent implements OnInit {
    location = inject(Location);
    options = input.required<FilterTabOption<any>[]>();
    newLabel = input<string>();
    newPath = input<string>();
    newParams = input<any>();
    hasExternalCreate = input<boolean>(false);
    onChange = output<any>();
    onReload = output<any>();
    onExternalCreate = output<any>();
    selectedOption = model<any>();
    hideReloadButton = input(false);

    backPath = input<string>();
    backAction = input<boolean>(false);
    title = input<string>();
    description = input<string>();
    hideReinscription = input<boolean>(false);

    router = inject(Router);

    ngOnInit(): void {}

    emitChange(event: any) {
        this.onChange.emit(event);
    }

    onCreate(event: any) {
        if (this.hasExternalCreate()) {
            this.onExternalCreate.emit(event);
            return;
        }

        if (this.newParams()) {
            return this.router.navigate([this.newPath()], {
                queryParams: this.newParams(),
            });
        }
        return this.router.navigate([this.newPath()]);
    }

    emitReload(event: any) {
        this.onReload.emit(event);
    }

    goBack(): void {
        if (this.backPath()) {
            this.router.navigate([this.backPath()]).then();
            return;
        }

        this.location.back();
    }
}
