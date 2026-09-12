import { Component, OnInit } from '@angular/core';
import {
    NavigationCancel,
    NavigationEnd,
    NavigationError,
    NavigationStart,
    Router,
    RouterOutlet,
} from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';
import { NgConfig } from '@core/config';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SpinnerComponent } from '@shared/components';
import { TranslateModule } from '@ngx-translate/core';
import { showHideSpinner } from '@core/utils';
import { PRIMENG_ES } from '@core/config';

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

    constructor(
        private primengConfig: PrimeNGConfig,
        private router: Router,
    ) {
        this.initLoaderSppiner();
    }

    ngOnInit() {
        this.primengConfig.ripple = NgConfig.ripple;
        this.primengConfig.zIndex = NgConfig.zIndex;
        this.primengConfig.setTranslation(PRIMENG_ES);
    }

    initLoaderSppiner() {
        this.router.events.subscribe((event) => {
            if (event instanceof NavigationStart) {
                showHideSpinner(true);
            } else if (
                event instanceof NavigationEnd ||
                event instanceof NavigationCancel ||
                event instanceof NavigationError
            ) {
                showHideSpinner(false);
            }
        });
    }
}
