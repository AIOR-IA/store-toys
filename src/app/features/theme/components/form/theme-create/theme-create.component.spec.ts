import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeCreateComponent } from './theme-create.component';
import { of } from 'rxjs';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';

describe('ThemeCreateComponent', () => {
    let component: ThemeCreateComponent;
    let fixture: ComponentFixture<ThemeCreateComponent>;

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.theme') {
                return of({
                    breadcrumbs: {
                        main: 'Temas',
                        list: 'Lista de temas',
                        create: 'Crear tema',
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


    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ThemeCreateComponent],
            imports: [
                CommonModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: TranslateService, useValue: translateServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeCreateComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeCreateComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
