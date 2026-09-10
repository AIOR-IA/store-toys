import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeOptionsComponent } from './theme-options.component';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ThemeService, ThemeStateService } from 'app/features/theme/services';
import { SessionService, ToastService } from '@core/services';
import { ConfirmationService } from 'primeng/api';
import { Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ThemeOptionsComponent', () => {
    let component: ThemeOptionsComponent;
    let fixture: ComponentFixture<ThemeOptionsComponent>;

    const stateMock: any = {
        reload: jasmine.createSpy('reload'),
    };

    const serviceMock: any = {
        delete: jasmine.createSpy('delete').and.returnValue(of({})),
    };

    const sessionServiceMock: any = {
        canUpdate: jasmine.createSpy('canUpdate').and.returnValue(true),
        canDelete: jasmine.createSpy('canDelete').and.returnValue(true),
    };

    const toastServiceMock: any = {
        success: jasmine.createSpy('success'),
        error: jasmine.createSpy('error'),
    };

    const confirmationServiceMock: any = {
        confirm: jasmine.createSpy('confirm'),
    };

    const routerMock: any = {
        navigate: jasmine.createSpy('navigate'),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.common') {
                return of({
                    options: 'Opciones',
                    details: 'Detalles',
                    edit: 'Editar',
                    delete: 'Eliminar',
                } as any);
            }
            return of(key);
        },
    } as any;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ThemeOptionsComponent],
            providers: [
                { provide: ThemeStateService, useValue: stateMock },
                { provide: ThemeService, useValue: serviceMock },
                { provide: SessionService, useValue: sessionServiceMock },
                { provide: ToastService, useValue: toastServiceMock },
                { provide: ConfirmationService, useValue: confirmationServiceMock },
                { provide: Router, useValue: routerMock },
                { provide: TranslateService, useValue: translateServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeOptionsComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeOptionsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
