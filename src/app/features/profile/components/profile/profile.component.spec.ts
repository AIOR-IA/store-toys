import { CommonModule } from '@angular/common';
import {
    Component,
    EventEmitter,
    input,
    NO_ERRORS_SCHEMA,
    output,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import {
    DefaultLangChangeEvent,
    LangChangeEvent,
    TranslateModule,
    TranslateService,
    TranslationChangeEvent,
} from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { ProfileComponent } from './profile.component';
import { SessionService } from '@core/services';
import { ProfileService } from '../../services/profile.service';
import { MessageService } from 'primeng/api';


@Component({
    selector: 'app-body-header',
    template: '',
})
class BodyHeaderStubComponent {
    breadcrumbs = input<any>();
    viewButtons = input<any>();
    resource = input<any>();
}

@Component({
    selector: 'app-change-password',
    template: '',
})
class ChangePasswordStubComponent {
    userId = input<number>();
    closeEmitter = output<void>();
}


describe('ProfileComponent', () => {
    let component: ProfileComponent;
    let fixture: ComponentFixture<ProfileComponent>;

    const mockUser = {
        id: 1,
        username: 'test.user',
        email: 'test@example.com',
        firstName: 'John',
        paternalLastName: 'Doe',
        maternalLastName: 'Smith',
        idNumber: '1234567',
        idNumberComplement: 'A',
        address: 'Calle Falsa 123',
        cellphone: '70000000',
        flowStatus: 'ACTIVE',
    };

    const sessionServiceMock: any = {
        user: jasmine.createSpy('user').and.returnValue(mockUser),
    };

    const profileServiceMock = {
        update: jasmine.createSpy('update').and.returnValue(of({})),
    };


    const messageServiceMock: any = {
        add: jasmine.createSpy('add'),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.profile') {
                return of({
                    title: 'Perfil',
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
            declarations: [
                ProfileComponent,
                BodyHeaderStubComponent,
                ChangePasswordStubComponent,
            ],
            imports: [
                CommonModule,
                ReactiveFormsModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: SessionService, useValue: sessionServiceMock },
                { provide: ProfileService, useValue: profileServiceMock },
                { provide: MessageService, useValue: messageServiceMock },
                { provide: TranslateService, useValue: translateServiceMock },
            ],
            schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
        }).compileComponents();

        profileServiceMock.update.calls.reset();
        messageServiceMock.add.calls.reset();
        profileServiceMock.update.and.returnValue(of({}));

        fixture = TestBed.createComponent(ProfileComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize form with user data', () => {
        const form = (component as any).profileForm() as any;

        expect(form.get('firstName')?.value).toBe(mockUser.firstName);
        expect(form.get('paternalLastName')?.value).toBe(
            mockUser.paternalLastName,
        );
        expect(form.get('maternalLastName')?.value).toBe(
            mockUser.maternalLastName,
        );
        expect(form.get('idNumber')?.value).toBe(mockUser.idNumber);
        expect(form.get('idNumberComplement')?.value).toBe(
            mockUser.idNumberComplement,
        );
        expect(form.get('address')?.value).toBe(mockUser.address);
        expect(form.get('cellphone')?.value).toBe(mockUser.cellphone);
    });

    it('should load breadcrumbs on ngOnInit', () => {
        const items = (component as any).breadcrumbItems() as any[];

        expect(items.length).toBe(1);
        expect(items[0].label).toBe('Perfil');
        expect(items[0].routerLink).toBe('/profile');
    });

    it('should set hasChanged to true when form is modified', () => {
        expect((component as any).hasChanged()).toBeFalse();

        const form = (component as any).profileForm() as any;
        form.patchValue({ firstName: 'Nuevo Nombre' });
        fixture.detectChanges();

        expect((component as any).hasChanged()).toBeTrue();
    });

    it('should call profileService.update and show success toast on submit', () => {
        const form = (component as any).profileForm() as any;
        expect(form.valid).toBeTrue();

        component.onSubmit();

        expect(profileServiceMock.update).toHaveBeenCalledTimes(1);
        expect(profileServiceMock.update).toHaveBeenCalledWith(mockUser.id, {
            ...form.value,
            flowStatus: mockUser.flowStatus,
        });

        expect((component as any).loading()).toBeFalse();
        expect((component as any).hasChanged()).toBeFalse();

        expect(messageServiceMock.add).toHaveBeenCalledWith(
            jasmine.objectContaining({
                severity: 'success',
                summary: 'Éxito',
                detail: 'Perfil actualizado correctamente.',
            }),
        );
    });

    it('should show error toast when update fails', () => {
        profileServiceMock.update.and.returnValue({
            pipe: () => ({
                subscribe: () => {
                    (component as any).loading.set(false);
                    messageServiceMock.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Error al actualizar el perfil.',
                    });
                },
            }),
        } as any);

        component.onSubmit();

        expect(messageServiceMock.add).toHaveBeenCalledWith(
            jasmine.objectContaining({
                severity: 'error',
                summary: 'Error',
                detail: 'Error al actualizar el perfil.',
            }),
        );
        expect((component as any).loading()).toBeFalse();
    });


    it('should toggle showChangePassword flag', () => {
        expect((component as any).showChangePassword()).toBeFalse();

        component.toggleShowChangePassword();
        expect((component as any).showChangePassword()).toBeTrue();

        component.toggleShowChangePassword();
        expect((component as any).showChangePassword()).toBeFalse();
    });

    it('should reset form and set hasChanged to false on resetForm', () => {
        const form = (component as any).profileForm() as any;
        form.patchValue({ firstName: 'Otro nombre' });
        fixture.detectChanges();
        expect((component as any).hasChanged()).toBeTrue();

        component.resetForm();
        expect((component as any).hasChanged()).toBeFalse();

        const resetForm = (component as any).profileForm() as any;
        expect(resetForm.get('firstName')?.value).toBe(mockUser.firstName);
    });
});
