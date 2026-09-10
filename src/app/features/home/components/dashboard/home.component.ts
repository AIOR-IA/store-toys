import { Component, inject, signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '@core/services';

import { TranslateService } from '@ngx-translate/core';
import { RESOURCES } from '@shared/constants';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrl: './home.component.scss',
})
export class HomeComponent {
    protected options: WritableSignal<{ label: string; value: string }[]>;
    protected selectedOption: WritableSignal<string>;
    sessionService = inject(SessionService);
    router = inject(Router);

    private translate: TranslateService;

    constructor() {
        this.checkSessionDashboard();
        this.selectedOption = signal('BUDGET');
        this.options = signal([]);

        this.translate = inject(TranslateService);

        this.loadTabs();
        this.sessionService.triggerRefreshSidebar();
    }

    checkSessionDashboard() {
        const isOfficer = this.sessionService.isAgentOfficer();
        const hasUserPerm = this.sessionService.canRead(RESOURCES.USERS);

        if (isOfficer) {
            return;
        }

        if (hasUserPerm) {
            this.router
                .navigateByUrl('/', { skipLocationChange: true })
                .then(() => this.router.navigate(['/admin/users']));
        } else {
            this.router
                .navigateByUrl('/', { skipLocationChange: true })
                .then(() => this.router.navigate(['/admin']));
        }
    }

    public emitChange(event: any): void {
        this.selectedOption.set(event.value);
    }

    private loadTabs(): void {
        this.translate.get('app.dashboard.tabs').subscribe((tabs) => {
            this.options.set(
                Object.keys(tabs).map((key) => ({
                    label: tabs[key].label,
                    value: tabs[key].value,
                }))
            );
        });
    }

}
