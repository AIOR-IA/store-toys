import {
    ChangeDetectorRef,
    Component,
    HostBinding,
    Input,
    OnDestroy,
    OnInit,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { LayoutService } from '../../../services/app.layout.service';
import {
    animate,
    state,
    style,
    transition,
    trigger,
} from '@angular/animations';
import { MenuService } from '../../../services/app.menu.service';

@Component({
    selector: '[app-menu-item]',
    templateUrl: './menu-item.component.html',
    styleUrl: './menu-item.component.scss',
    host: {
        '[class.layout-root-menuitem]': 'root',
        '[class.active-menuitem]': 'active',
    },
    animations: [
        trigger('children', [
            state(
                'collapsed',
                style({
                    height: '0',
                })
            ),
            state(
                'expanded',
                style({
                    height: '*',
                })
            ),
            transition(
                'collapsed <=> expanded',
                animate('400ms cubic-bezier(0.86, 0, 0.07, 1)')
            ),
        ]),
    ],
})
export class AppMenuItemComponent implements OnInit, OnDestroy {
    @Input() item: any;

    @Input() index!: number;

    @Input() root!: boolean;

    @Input() parentKey!: string;

    public active = false;

    public menuSourceSubscription: Subscription;

    public menuResetSubscription: Subscription;

    public key: string = '';

    constructor(
        public layoutService: LayoutService,
        private cd: ChangeDetectorRef,
        public router: Router,
        private menuTemplateService: MenuService
    ) {
        this.menuSourceSubscription =
            this.menuTemplateService.menuSource$.subscribe((value) => {
                Promise.resolve(null).then(() => {
                    if (value.routeEvent) {
                        this.active =
                            value.key === this.key ||
                            value.key.startsWith(this.key + '-')
                                ? true
                                : false;
                    } else {
                        if (
                            value.key !== this.key &&
                            !value.key.startsWith(this.key + '-')
                        ) {
                            this.active = false;
                        }
                    }
                });
            });

        this.menuResetSubscription =
            this.menuTemplateService.resetSource$.subscribe(() => {
                this.active = false;
            });

        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe((params) => {
                if (this.item.routerLink) {
                    this.updateActiveStateFromRoute();
                }
            });
    }

    ngOnInit() {
        this.key = this.parentKey
            ? this.parentKey + '-' + this.index
            : String(this.index);

        if (this.item.routerLink) {
            this.updateActiveStateFromRoute();
        }
    }

    updateActiveStateFromRoute() {
        let activeRoute = this.router.isActive(this.item.routerLink[0], {
            paths: 'exact',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored',
        });

        if (activeRoute) {
            this.menuTemplateService.onMenuStateChange({
                key: this.key,
                routeEvent: true,
            });
        }
    }

    itemClick(event: Event) {
        // avoid processing disabled items
        if (this.item.disabled) {
            event.preventDefault();
            return;
        }

        // execute command
        if (this.item.command) {
            this.item.command({ originalEvent: event, item: this.item });
        }

        // toggle active state
        if (this.item.items) {
            this.active = !this.active;
        }

        this.menuTemplateService.onMenuStateChange({ key: this.key });
    }

    get submenuAnimation() {
        return this.root ? 'expanded' : this.active ? 'expanded' : 'collapsed';
    }

    ngOnDestroy() {
        if (this.menuSourceSubscription) {
            this.menuSourceSubscription.unsubscribe();
        }

        if (this.menuResetSubscription) {
            this.menuResetSubscription.unsubscribe();
        }
    }
}
