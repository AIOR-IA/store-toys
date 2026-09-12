import {
    Component,
    ElementRef,
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
import { filter } from 'rxjs';
import { LayoutService } from '../../services/app.layout.service';
import { environment } from '../../../../environments/environment';
import { FIREBASE_DEV_PROJECT_ID } from '../../../../environments/environment.model';

/**
 * Barra superior.
 *
 * FASE 0A: desacoplada de la sesión heredada de SAHTOSO. El avatar, las
 * iniciales del usuario y el menú de usuario se reconectan en la FASE 1 contra
 * `core/session/session.service.ts` (ver docs/architecture/mi-pimpollito-plan.md §6).
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
    imports: [CommonModule, RouterLink, OverlayPanelModule],
    templateUrl: './topbar.component.html',
    styleUrl: './topbar.component.scss',
})
export class AppTopbarComponent implements OnInit {
    showProfile = input<boolean>(true);
    isDarkTheme = signal(false);
    isDevFirebase = environment.firebase.projectId === FIREBASE_DEV_PROJECT_ID;
    firebaseProjectId = environment.firebase.projectId;

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
