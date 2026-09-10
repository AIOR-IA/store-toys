import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { of, Subject } from 'rxjs';
import { ConfirmationService, PrimeNGConfig } from 'primeng/api';
import { TranslateService, TranslationChangeEvent, LangChangeEvent, DefaultLangChangeEvent } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { EventEmitter } from '@angular/core';

describe('AppComponent', () => {

    const translateServiceMock: Partial<TranslateService> = {
        setDefaultLang: (_lang: string) => { },
        use: (_lang: string) => of({}),
        get: (_key: any) => of({}),
        stream: (_key: any) => of(''),
        instant: (_key: any) => '',

        onTranslationChange: new EventEmitter<TranslationChangeEvent>(),
        onLangChange: new EventEmitter<LangChangeEvent>(),
        onDefaultLangChange: new EventEmitter<DefaultLangChangeEvent>(),
    };

    const primengConfigMock: Partial<PrimeNGConfig> = {
        ripple: false,
        zIndex: {},
        setTranslation: () => { },
    };

    const routerMock: Partial<Router> = {
        events: of(),
    };

    const confirmationServiceMock: Partial<ConfirmationService> = {
        confirm: (_c: any) => ({} as ConfirmationService),
        close: () => ({} as ConfirmationService),
        requireConfirmation$: of(),
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AppComponent],
            providers: [
                { provide: TranslateService, useValue: translateServiceMock },
                { provide: PrimeNGConfig, useValue: primengConfigMock },
                { provide: Router, useValue: routerMock },
                { provide: ConfirmationService, useValue: confirmationServiceMock },
            ],
        }).compileComponents();
    });

    it('should create the app', () => {
        const fixture = TestBed.createComponent(AppComponent);
        const app = fixture.componentInstance;
        expect(app).toBeTruthy();
    });

    it(`should have the 'abt-frontend' title`, () => {
        const fixture = TestBed.createComponent(AppComponent);
        const app = fixture.componentInstance;
        expect(app.title).toEqual('abt-frontend');
    });

});
