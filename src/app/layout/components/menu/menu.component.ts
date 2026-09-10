import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { LayoutService } from '../../services/app.layout.service';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AppMenuContentService } from 'app/layout/services/app.menu.content.service';

@Component({
    selector: 'app-menu',
    templateUrl: './menu.component.html',
    styleUrl: './menu.component.scss',
})
export class AppMenuComponent implements OnInit {
    menuContentService = inject(AppMenuContentService);
    adminMenuItems = signal([] as any[]);
    planMenuItems = signal([] as any[]);
    model = signal([] as any[]);

    constructor(
        public layoutService: LayoutService,
        private readonly router: Router
    ) {
        effect(
            () => {
                if (this.menuContentService.model()) {
                    this.setMenuItems(this.router.url);
                }
            },
            { allowSignalWrites: true }
        );
    }

    ngOnInit() {
        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe((event: NavigationEnd) => {
                this.setMenuItems(event.urlAfterRedirects);
            });
    }

    setMenuItems(url: string) {
        this.model.set(this.menuContentService.model());
    }
}
