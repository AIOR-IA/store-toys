import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebMapServiceFormComponent } from './web-map-service-form.component';
import { of } from 'rxjs';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { EventEmitter, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { SessionService, ToastService } from '@core/services';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { WebMapServiceService, WebMapServiceStateService } from 'app/features/web-map-service/services';
import { MessageService } from 'primeng/api';

describe('WebMapServiceFormComponent', () => {
    let component: WebMapServiceFormComponent;
    let fixture: ComponentFixture<WebMapServiceFormComponent>;

    const webMapServiceMock: any = {
        create: jasmine.createSpy('create').and.returnValue(of({})),
        update: jasmine.createSpy('update').and.returnValue(of({})),
    };

    const stateMock: any = {
        current: {},
        mode: 'create',
        resources: {},
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
        params: of({ id: null }),
        queryParams: of({}),
        paramMap: of(convertToParamMap({})),
        queryParamMap: of(convertToParamMap({})),
        snapshot: {
            params: {},
            queryParams: {},
            paramMap: convertToParamMap({}),
            queryParamMap: convertToParamMap({}),
            data: { mode: 'create' },
        } as any,
    };

    const routerMock = {
        navigate: jasmine.createSpy('navigate'),
    };

    const toastServiceMock = {
        success: jasmine.createSpy('success'),
        error: jasmine.createSpy('error'),
    };

    const sessionServiceMock: Partial<SessionService> = {
        user: signal({ id: 1 } as any),
    };


    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [WebMapServiceFormComponent],
            imports: [
                CommonModule,
                ReactiveFormsModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: WebMapServiceService, useValue: webMapServiceMock },
                { provide: WebMapServiceStateService, useValue: stateMock },
                { provide: TranslateService, useValue: translateServiceMock },
                { provide: ActivatedRoute, useValue: activatedRouteMock },
                { provide: Router, useValue: routerMock },
                { provide: ToastService, useValue: toastServiceMock },
                { provide: SessionService, useValue: sessionServiceMock },
                { provide: MessageService, useValue: {} },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(WebMapServiceFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
