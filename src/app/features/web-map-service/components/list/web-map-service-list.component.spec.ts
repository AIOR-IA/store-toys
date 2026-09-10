import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebMapServiceListComponent } from './web-map-service-list.component';
import { EventEmitter, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { SessionService, ToastService } from '@core/services';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { WebMapServiceStateService } from '../../services';
import { MessageService } from 'primeng/api';

describe('WebMapServiceListComponent', () => {
    let component: WebMapServiceListComponent;
    let fixture: ComponentFixture<WebMapServiceListComponent>;

    const stateMock: any = {
        resources: {
            WEB_MAP_SERVICE: 'WEB_MAP_SERVICE',
        },
        pagination: {
            query: '',
            perPage: 10,
            total: 0,
            page: 1,
        },
        items: [],
        findPage: jasmine.createSpy('findPage'),
        reload: jasmine.createSpy('reload'),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.webMapService.breadcrumbs') {
                return of({
                    main: 'WMS',
                    list: 'Listado',
                } as any);
            }
            return of(key);
        },
        use: () => of({}),
        instant: (k: any) => k,
        stream: () => of(''),
        onTranslationChange: new EventEmitter<TranslationChangeEvent>(),
        onLangChange: new EventEmitter<LangChangeEvent>(),
        onDefaultLangChange: new EventEmitter<DefaultLangChangeEvent>(),
    };

    const activatedRouteMock: Partial<ActivatedRoute> = {
        params: of({}),
        queryParams: of({}),
        paramMap: of(convertToParamMap({})),
        queryParamMap: of(convertToParamMap({})),
        snapshot: {
            params: {},
            queryParams: {},
            paramMap: convertToParamMap({}),
            queryParamMap: convertToParamMap({}),
            data: {},
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
        canCreate: () => true,
        canUpdate: () => true,
        canDelete: () => true,
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [WebMapServiceListComponent],
            imports: [
                CommonModule,
                TranslateModule.forRoot(),
            ],
            providers: [
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

        fixture = TestBed.createComponent(WebMapServiceListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
