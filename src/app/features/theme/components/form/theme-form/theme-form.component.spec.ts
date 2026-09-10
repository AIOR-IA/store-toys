import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeFormComponent } from './theme-form.component';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ThemeService, ThemeStateService } from 'app/features/theme/services';
import { MessageService } from 'primeng/api';
import { ToastService } from '@core/services';

describe('ThemeFormComponent', () => {
    let component: ThemeFormComponent;
    let fixture: ComponentFixture<ThemeFormComponent>;

    const themeServiceMock: any = {
        create: jasmine.createSpy('create'),
        update: jasmine.createSpy('update'),
    };

    const themeStateServiceMock: any = {
        current: undefined,
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => of(key),
        use: () => of({}),
        instant: (k: any) => k,
        stream: () => of(''),
        onTranslationChange: new EventEmitter<TranslationChangeEvent>(),
        onLangChange: new EventEmitter<LangChangeEvent>(),
        onDefaultLangChange: new EventEmitter<DefaultLangChangeEvent>(),
    };

    const activatedRouteMock: Partial<ActivatedRoute> = {
        params: of({ id: '1' }),
        queryParams: of({}),
        paramMap: of(convertToParamMap({ id: '1' })),
        queryParamMap: of(convertToParamMap({})),
        snapshot: {
            params: { id: '1' },
            queryParams: {},
            paramMap: convertToParamMap({ id: '1' }),
            queryParamMap: convertToParamMap({}),
        } as any,
    };

    const routerMock = {
        navigate: jasmine.createSpy('navigate'),
    };

    const toastServiceMock: any = {
        success: jasmine.createSpy('success'),
        error: jasmine.createSpy('error'),
    };

    const messageServiceMock: any = {
        add: jasmine.createSpy('add'),
    };

    const locationMock: any = {
        back: jasmine.createSpy('back'),
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ThemeFormComponent],
            imports: [
                CommonModule,
                ReactiveFormsModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: ThemeService, useValue: themeServiceMock },
                { provide: ThemeStateService, useValue: themeStateServiceMock },
                { provide: TranslateService, useValue: translateServiceMock },
                { provide: ActivatedRoute, useValue: activatedRouteMock },
                { provide: Router, useValue: routerMock },
                { provide: MessageService, useValue: messageServiceMock },
                { provide: Location, useValue: locationMock },
                { provide: ToastService, useValue: toastServiceMock } as any,
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeFormComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
