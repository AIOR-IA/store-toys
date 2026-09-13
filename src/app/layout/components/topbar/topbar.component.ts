import {
    Component,
    ElementRef,
    computed,
    inject,
    input,
    OnInit,
    signal,
    ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavigationEnd, Router } from '@angular/router';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { LayoutService } from '../../services/app.layout.service';
import { environment } from '../../../../environments/environment';
import { FIREBASE_DEV_PROJECT_ID } from '../../../../environments/environment.model';
import { SessionService } from '@core/session';

/**
 * Barra superior.
 *
 * FASE 1: el avatar muestra las iniciales del usuario y el panel de usuario
 * ofrece "Cerrar sesión" real contra `SessionService.logout()`
 * (docs/architecture/mi-pimpollito-plan.md §6). Todavía no hay navegación por
 * rol ni enlace a un perfil editable — eso es de fases posteriores.
 *
 * FASE 0B: badge de ambiente. **No se basa en `environment.name` ni en
 * `environment.production`** — esos describen qué configuración de Angular
 * generó el build, no contra qué Firebase habla. Se basa en
 * `environment.firebase.projectId`, porque eso es lo que de verdad importa:
 * mientras `mi-pimpollito` (PROD) no exista, un build de **producción** de
 * Angular sigue hablando con el Firebase de **DEV** (plan §5.5, decisión del
 * 2026-09-12), y el badge tiene que seguir viéndose para que eso sea obvio.
 * El día que `environment.production.ts` tenga el `projectId` real de
 * `mi-pimpollito`, el badge desaparece solo, sin tocar este componente.
 */
@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [CommonModule, RouterLink, OverlayPanelModule, TranslateModule],
    templateUrl: './topbar.component.html',
    styleUrl: './topbar.component.scss',
})
export class AppTopbarComponent implements OnInit {
    private readonly sessionService = inject(SessionService);

    showProfile = input<boolean>(true);
    isDarkTheme = signal(false);
    isDevFirebase = environment.firebase.projectId === FIREBASE_DEV_PROJECT_ID;
    firebaseProjectId = environment.firebase.projectId;

    readonly initials = computed(() => {
        const s = this.sessionService.session();
        if (s.status !== 'active') return '';
        const f = s.firstName?.trim()?.[0] ?? '';
        const l = s.lastName?.trim()?.[0] ?? '';
        return (f + l).toUpperCase();
    });

    readonly fullName = computed(() => {
        const s = this.sessionService.session();
        return s.status === 'active' ? `${s.firstName} ${s.lastName}`.trim() : '';
    });

    readonly userEmail = computed(() => {
        const s = this.sessionService.session();
        return s.status === 'active' ? s.email : '';
    });

    @ViewChild('menubutton') menuButton!: ElementRef;

    @ViewChild('overlay') overlay!: OverlayPanel;

    constructor(
        public layoutService: LayoutService,
        private readonly router: Router,
    ) {}

    ngOnInit(): void {
        this.loadTheme();
        this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe(() => {
                this.overlay?.hide();
            });
    }

    navigateTo(route: string): void {
        this.router.navigate([route]);
    }

    public toggleMenu(event: any): void {
        this.overlay?.toggle(event);
    }

    logout(): void {
        this.overlay?.hide();
        this.sessionService.logout().subscribe(() => {
            // Firebase Auth queda sin sesión al resolver `signOut()`; la
            // cadena de sesión reacciona sola, pero navegamos explícitamente
            // para no depender de que algún guard dispare la redirección.
            this.router.navigateByUrl('/auth/login');
        });
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
