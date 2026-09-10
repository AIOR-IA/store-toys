import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeListComponent } from './theme-list.component';
import { of } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { ThemeStateService } from '../../services';

describe('ThemeListComponent', () => {
    let component: ThemeListComponent;
    let fixture: ComponentFixture<ThemeListComponent>;

    const stateMock: any = {
        resources: {
            THEME: 'THEME',
        },
        pagination: {
            query: '',
            page: 1,
            perPage: 10,
            total: 0,
        },
        items: [],
        findPage: jasmine.createSpy('findPage'),
        reload: jasmine.createSpy('reload'),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.theme.breadcrumbs') {
                return of({
                    main: 'Temas',
                    list: 'Lista de temas',
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
        paramMap: of(convertToParamMap({})),
        queryParamMap: of(convertToParamMap({})),
        snapshot: {
            paramMap: convertToParamMap({}),
            queryParamMap: convertToParamMap({}),
        } as any,
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ThemeListComponent],
            imports: [CommonModule, TranslateModule.forRoot()],
            providers: [
                { provide: ThemeStateService, useValue: stateMock },
                { provide: TranslateService, useValue: translateServiceMock },
                { provide: ActivatedRoute, useValue: activatedRouteMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeListComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
