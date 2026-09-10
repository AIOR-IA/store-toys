import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeEditComponent } from './theme-edit.component';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { of } from 'rxjs';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ThemeStateService } from 'app/features/theme/services';
import { CommonModule } from '@angular/common';

describe('ThemeEditComponent', () => {
    let component: ThemeEditComponent;
    let fixture: ComponentFixture<ThemeEditComponent>;

    const themeStateServiceMock: any = {
        findItem: jasmine.createSpy('findItem').and.returnValue(
            of({
                id: 1,
                name: 'Tema de prueba',
            }),
        ),
        resources: {
            THEME: 'THEME',
        },
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.webMapService') {
                return of({
                    breadcrumbs: {
                        main: 'Web Map Service',
                        list: 'Lista de temas',
                        edit: 'Editar tema',
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
            declarations: [ThemeEditComponent],
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
            .overrideComponent(ThemeEditComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeEditComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
