import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebMapServiceEditComponent } from './web-map-service-edit.component';
import { of } from 'rxjs';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { WebMapServiceStateService } from 'app/features/web-map-service/services';
import { CommonModule } from '@angular/common';

describe('WebMapServiceEditComponent', () => {
    let component: WebMapServiceEditComponent;
    let fixture: ComponentFixture<WebMapServiceEditComponent>;

    const stateMock: any = {
        resources: {
            WEB_MAP_SERVICE: 'WEB_MAP_SERVICE',
        },
        current: {},
        findItem: jasmine.createSpy('findItem').and.returnValue(Promise.resolve({})),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.webMapService') {
                return of({
                    breadcrumbs: {
                        main: 'Web Map Service',
                        list: 'Listado',
                        edit: 'Editar',
                    },
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
        params: of({ id: '1', uuid: 'mock-uuid' }),
        queryParams: of({}),
        paramMap: of(convertToParamMap({ id: '1', uuid: 'mock-uuid' })),
        queryParamMap: of(convertToParamMap({})),
        snapshot: {
            params: { id: '1', uuid: 'mock-uuid' },
            queryParams: {},
            paramMap: convertToParamMap({ id: '1', uuid: 'mock-uuid' }),
            queryParamMap: convertToParamMap({}),
        } as any,
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [WebMapServiceEditComponent],
            imports: [
                CommonModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: WebMapServiceStateService, useValue: stateMock },
                { provide: TranslateService, useValue: translateServiceMock },
                { provide: ActivatedRoute, useValue: activatedRouteMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(WebMapServiceEditComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
