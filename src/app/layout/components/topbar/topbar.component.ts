import {
    Component,
    ElementRef,
    inject,
    input,
    OnInit,
    Signal,
    signal,
    ViewChild,
} from '@angular/core';
import { MenuItem } from 'primeng/api';
import { LayoutService } from '../../services/app.layout.service';
import {
    AttachmentService,
    SessionService,
    ToastService,
} from '@core/services';
import { NavigationEnd, Router } from '@angular/router';
import { OverlayPanel } from 'primeng/overlaypanel';
import { TranslateService } from '@ngx-translate/core';
import { IUser } from 'app/features/users/models';
import { filter } from 'rxjs';

@Component({
    selector: 'app-topbar',
    templateUrl: './topbar.component.html',
    styleUrl: './topbar.component.scss',
})
export class AppTopbarComponent implements OnInit {
    showRoleDropdown = signal(false);
    items!: MenuItem[];

    translate: TranslateService = inject(TranslateService);
    toastService: ToastService = inject(ToastService);
    sessionService = inject(SessionService);
    attachService = inject(AttachmentService);
    showProfile = input<boolean>(true);
    isDarkTheme = signal(false);

    @ViewChild('menubutton') menuButton!: ElementRef;

    @ViewChild('topbarmenubutton') topbarMenuButton!: ElementRef;

    @ViewChild('topbarmenu') menu!: ElementRef;

    @ViewChild('overlay') overlay!: OverlayPanel;

    @ViewChild('notificationsOverlay') notificationsOverlay!: OverlayPanel;

    constructor(
        public layoutService: LayoutService,
        private readonly router: Router
    ) { }

    ngOnInit(): void {
        this.loadTheme();
        this.initialize();
    }

    navigateTo(route: string): void {
        this.router.navigate([route]);
    }

    public toggleMenu(event: any): void {
        if (this.overlay) {
            this.overlay.toggle(event);
            this.showRoleDropdown.set(false);
        }
    }

    public toggleNotificationMenu(event: any): void {
        if (this.notificationsOverlay) {
            this.notificationsOverlay.toggle(event);
        }
    }

    private initialize(): void {
        this.startListenSocket();

        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe((event: NavigationEnd) => {
                this.overlay?.hide();
            });
    }

    private startListenSocket(): void { }

    get photoUrl() {
        let keyPhoto;
        if (this.sessionService.isRepresentant()) {
        }

        if (keyPhoto) return this.attachService.getFileUrl(keyPhoto);

        return null;
    }

    get initialsName() {
        let initials = '';
        let user: Partial<IUser> = this.sessionService.user();

        if (user.firstName) {
            initials = user.firstName[0];
        }

        if (user.paternalLastName) {
            const ipn = user.paternalLastName[0];
            if (initials !== ipn) initials += ipn;
        }

        return initials;
    }

    private loadTheme(): void {
        const theme = localStorage.getItem('theme');

        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            this.isDarkTheme.set(true);
            return;
        }

        document.body.classList.remove('dark-theme');
        this.isDarkTheme.set(false);
    }

    toggleTheme(): void {
        const isDark = !this.isDarkTheme();

        this.isDarkTheme.set(isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');

        document.body.classList.toggle('dark-theme', isDark);
    }
}
