import { Component, OnInit } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { PrimeNGConfig } from 'primeng/api';
import { NgConfig } from './core/config';
import { ToastModule } from 'primeng/toast';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';
import { AppLayoutModule } from './layout/layout.module';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SpinnerComponent } from '@shared/components';
import { showHideSpinner } from '@core/utils';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [
        RouterOutlet,
        ToastModule,
        MessageModule,
        ButtonModule,
        AppLayoutModule,
        ConfirmDialogModule,
        TranslateModule,
        SpinnerComponent
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent {
    title = 'sahtoso-frontend';

    constructor(
        private primengConfig: PrimeNGConfig,
        private translate: TranslateService,
        private router: Router,
    ) {
        // Set the default language for translation
        translate.setDefaultLang('es');
        translate.use('es');
        this.initLoaderSppiner();
    }

    ngOnInit() {
        this.primengConfig.ripple = NgConfig.ripple;

        this.primengConfig.zIndex = NgConfig.zIndex;

        this.translate.get('app.ng').subscribe((res) => {
            this.primengConfig.setTranslation(res);
        });
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
