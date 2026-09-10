import { inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SessionService } from '@core/services';
import { RESOURCES } from '@shared/constants';

@Injectable({
    providedIn: 'root',
})
export class AppMenuContentService {
    private translate = inject(TranslateService);
    sessionService = inject(SessionService);
    t: any = {};
    model = signal([] as any[]);

    constructor() {
        this.translate.get('app').subscribe((app) => {
            this.t = app;
            this.populateMenuContent();
        });
    }

    getTranslate(key: string): string {
        const keys = key.split('.');
        let result = this.t;
        for (const k of keys) {
            if (result[k] !== undefined) {
                result = result[k];
            } else {
                console.warn(`Translation key "${key}" not found.`);
                return key; // Return the key itself if translation is not found
            }
        }
        return result;
    }

    populateMenuContent(): void {
        this.model.set([
            {
                label: 'Menú',
                items: [
                    {
                        label: this.getTranslate('menu.home'),
                        icon: 'fas fa-home',
                        routerLink: ['/admin'],
                    },
                ],
            },
            {
                label: 'Administración',
                items: [
                    {
                        label: this.getTranslate('menu.admin.users'),
                        icon: 'fas fa-user',
                        visible: this.sessionService.canSeeMenu(
                            RESOURCES.USERS
                        ),
                        items: [
                            {
                                label: this.getTranslate('users.list'),
                                icon: 'fas fa-users',
                                rounded: true,
                                routerLink: ['/admin/users'],
                                visible: this.sessionService.canSeeMenu(
                                    RESOURCES.USERS
                                ),
                            },
                        ],
                    },
                    {
                        label: this.getTranslate('menu.admin.projects'),
                        icon: 'fas fa-clipboard-list',
                        visible: this.sessionService.canSeeMenu(
                            RESOURCES.PROJECT
                        ),
                        items: [
                            {
                                label: this.getTranslate('project.list'),
                                icon: 'fas fa-folder-open',
                                rounded: true,
                                routerLink: ['/admin/projects'],
                                visible: this.sessionService.canSeeMenu(
                                    RESOURCES.PROJECT
                                ),
                            },
                        ],
                    },
                    {
                        label: this.getTranslate('menu.admin.gallery'),
                        icon: 'fas fa-image',
                        routerLink: ['/admin/images'],
                        visible:
                            this.sessionService.canRead(RESOURCES.DASHBOARD) ||
                            this.sessionService.canRead(RESOURCES.STAGE),
                    },
                    {
                        label: this.getTranslate('menu.admin.dashboard'),
                        icon: 'fas fa-chart-simple',
                        routerLink: ['/admin/dashboard'],
                        visible: this.sessionService.canRead(
                            RESOURCES.DASHBOARD
                        ),
                    },
                ],
            },
        ]);
    }
}
