import { Component, inject, input, model, OnInit, output } from '@angular/core';
import {
    FilterTabComponent,
    FilterTabOption,
} from '../filter-tab/filter-tab.component';
import { ButtonModule } from 'primeng/button';
import { PermissionsDirective } from '@shared/directives';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemAccessPermissions } from '@core/types';
import { TranslateModule } from '@ngx-translate/core';
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
        PermissionsDirective,
        TranslateModule,
        TooltipModule,
    ],
    templateUrl: './tabs-actions.component.html',
    styleUrl: './tabs-actions.component.scss',
})
export class TabsActionsComponent implements OnInit {
    location = inject(Location);
    options = input.required<FilterTabOption<any>[]>();
    resource = input.required<string>();
    newLabel = input<string>();
    newPath = input<string>();
    newParams = input<any>();
    hasExternalCreate = input<boolean>(false);
    onChange = output<any>();
    onReload = output<any>();
    onExternalCreate = output<any>();
    selectedOption = model<any>();
    hideReloadButton = input(false);

    createAction = SystemAccessPermissions.CAN_CREATE;
    readAction = SystemAccessPermissions.CAN_READ;
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
