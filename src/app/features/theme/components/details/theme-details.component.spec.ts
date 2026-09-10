import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeDetailsComponent } from './theme-details.component';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { of } from 'rxjs';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ThemeStateService } from '../../services';

describe('ThemeDetailsComponent', () => {
    let component: ThemeDetailsComponent;
    let fixture: ComponentFixture<ThemeDetailsComponent>;

    const themeStateServiceMock: any = {
        resources: {
            THEME: 'THEME',
            GEOGRAPHIC_LAYER: 'GEOGRAPHIC_LAYER',
        },
        findItem: jasmine.createSpy('findItem').and.returnValue(of({
            id: 1,
            title: 'Tema de prueba',
        })),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.theme') {
                return of({
                    breadcrumbs: {
                        main: 'Temas',
                        list: 'Lista de temas',
                        details: 'Detalles',
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
            declarations: [ThemeDetailsComponent],
            imports: [
                CommonModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: ThemeStateService, useValue: themeStateServiceMock },
                { provide: TranslateService, useValue: translateServiceMock },
                { provide: ActivatedRoute, useValue: activatedRouteMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeDetailsComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeDetailsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
