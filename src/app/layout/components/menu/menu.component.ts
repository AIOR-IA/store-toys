import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../../services/app.layout.service';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AppMenuContentService } from '../../services/app.menu.content.service';
import { AppMenuItemComponent } from './menu-item/menu-item.component';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuItemComponent],
    templateUrl: './menu.component.html',
    styleUrl: './menu.component.scss',
})
export class AppMenuComponent implements OnInit {
    menuContentService = inject(AppMenuContentService);
    model = signal([] as any[]);

    constructor(
        public layoutService: LayoutService,
        private readonly router: Router,
    ) {
        effect(
            () => {
                if (this.menuContentService.model()) {
                    this.setMenuItems();
                }
            },
            { allowSignalWrites: true },
        );
    }

    ngOnInit() {
        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe(() => {
                this.setMenuItems();
            });
    }

    setMenuItems() {
        this.model.set(this.menuContentService.model());
    }
}
