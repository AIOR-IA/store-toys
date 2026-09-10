import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebMapServiceCreateComponent } from './web-map-service-create.component';
import { of } from 'rxjs';
import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { DefaultLangChangeEvent, LangChangeEvent, TranslateModule, TranslateService, TranslationChangeEvent } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';

describe('WebMapServiceCreateComponent', () => {
    let component: WebMapServiceCreateComponent;
    let fixture: ComponentFixture<WebMapServiceCreateComponent>;

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.webMapService') {
                return of({
                    breadcrumbs: {
                        main: 'Web Map Service',
                        list: 'Listado',
                        create: 'Crear',
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
            declarations: [WebMapServiceCreateComponent],
            imports: [
                CommonModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: TranslateService, useValue: translateServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(WebMapServiceCreateComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
