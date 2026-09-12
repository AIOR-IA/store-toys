import {
    Component,
    OnDestroy,
    Renderer2,
    ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ToastModule } from 'primeng/toast';
import { AppSidebarComponent } from './components/sidebar/sidebar.component';
import { LayoutService } from './services/app.layout.service';
import { AppTopbarComponent } from './components/topbar/topbar.component';
import { AppFooterComponent } from './components/footer/footer.component';

@Component({
    selector: 'app-layout',
    standalone: true,
    imports: [
        CommonModule,
        RouterOutlet,
        ToastModule,
        AppTopbarComponent,
        AppSidebarComponent,
        AppFooterComponent,
    ],
    templateUrl: './layout.component.html',
    styleUrl: './layout.component.scss',
})
export class AppLayoutComponent implements OnDestroy {
    overlayMenuOpenSubscription: Subscription;

    menuOutsideClickListener: any;

    profileMenuOutsideClickListener: any;

    @ViewChild(AppSidebarComponent) appSidebar!: AppSidebarComponent;

    @ViewChild(AppTopbarComponent) appTopbar!: AppTopbarComponent;

    constructor(
        public layoutService: LayoutService,
        public renderer: Renderer2,
        public router: Router,
    ) {
        this.overlayMenuOpenSubscription =
            this.layoutService.overlayOpen$.subscribe(() => {
                if (!this.menuOutsideClickListener) {
                    this.menuOutsideClickListener = this.renderer.listen(
                        'document',
                        'click',
                        (event) => {
                            const isOutsideClicked = !(
                                this.appSidebar.el.nativeElement.isSameNode(
                                    event.target,
                                ) ||
                                this.appSidebar.el.nativeElement.contains(
                                    event.target,
                                ) ||
                                this.appTopbar.menuButton.nativeElement.isSameNode(
                                    event.target,
                                ) ||
                                this.appTopbar.menuButton.nativeElement.contains(
                                    event.target,
                                )
                            );

                            if (isOutsideClicked) {
                                this.hideMenu();
                            }
                        },
                    );
                }

                if (this.layoutService.state.staticMenuMobileActive) {
                    this.blockBodyScroll();
                }
            });

        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe(() => {
                this.hideMenu();
                this.hideProfileMenu();
            });
    }

    hideMenu() {
        this.layoutService.state.overlayMenuActive = false;
        this.layoutService.state.staticMenuMobileActive = false;
        this.layoutService.state.menuHoverActive = false;
        if (this.menuOutsideClickListener) {
            this.menuOutsideClickListener();
            this.menuOutsideClickListener = null;
        }
        this.unblockBodyScroll();
    }

    hideProfileMenu() {
        this.layoutService.state.profileSidebarVisible = false;
        if (this.profileMenuOutsideClickListener) {
            this.profileMenuOutsideClickListener();
            this.profileMenuOutsideClickListener = null;
        }
    }

    blockBodyScroll(): void {
        document.body.classList.add('blocked-scroll');
    }

    unblockBodyScroll(): void {
        document.body.classList.remove('blocked-scroll');
    }

    get containerClass() {
        return {
            'layout-theme-light':
                this.layoutService.config().colorScheme === 'light',
            'layout-theme-dark':
                this.layoutService.config().colorScheme === 'dark',
            'layout-overlay':
                this.layoutService.config().menuMode === 'overlay',
            'layout-static': this.layoutService.config().menuMode === 'static',
            'layout-static-inactive':
                this.layoutService.state.staticMenuDesktopInactive &&
                this.layoutService.config().menuMode === 'static',
            'layout-overlay-active': this.layoutService.state.overlayMenuActive,
            'layout-mobile-active':
                this.layoutService.state.staticMenuMobileActive,
            'p-input-filled':
                this.layoutService.config().inputStyle === 'filled',
            'p-ripple-disabled': !this.layoutService.config().ripple,
        };
    }

    ngOnDestroy() {
        if (this.overlayMenuOpenSubscription) {
            this.overlayMenuOpenSubscription.unsubscribe();
        }

        if (this.menuOutsideClickListener) {
            this.menuOutsideClickListener();
        }
    }
}
