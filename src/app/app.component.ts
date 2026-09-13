import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';
import { NgConfig, PRIMENG_ES } from '@core/config';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SpinnerComponent } from '@shared/components';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService } from '@core/session';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [
        RouterOutlet,
        ToastModule,
        ConfirmDialogModule,
        SpinnerComponent,
        TranslateModule,
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
    title = 'pimpollo-frontend';

    private readonly sessionService = inject(SessionService);

    /**
     * Splash mientras Firebase Auth todavía restaura su estado (plan §6.4).
     * Condicionado al estado de sesión, no a los eventos del router — así el
     * spinner cubre exactamente la ventana en la que "no se sabe todavía",
     * que es lo que hace imposible el parpadeo del login en cada recarga.
     */
    readonly showSplash = computed(
        () => this.sessionService.session().status === 'loading',
    );

    constructor(private primengConfig: PrimeNGConfig) {}

    ngOnInit() {
        this.primengConfig.ripple = NgConfig.ripple;
        this.primengConfig.zIndex = NgConfig.zIndex;
        this.primengConfig.setTranslation(PRIMENG_ES);
    }
}
