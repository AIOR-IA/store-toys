import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginComponent } from './login.component';
import { of, Subject, throwError } from 'rxjs';
import { AuthService, SessionService } from '@core/services';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('LoginComponent', () => {
    let component: LoginComponent;
    let fixture: ComponentFixture<LoginComponent>;

    const queryParams$ = new Subject<any>();

    const authServiceMock: Partial<AuthService> = {
        login: jasmine.createSpy('login').and.returnValue(new Subject<any>()),
        requestUser: jasmine.createSpy('requestUser').and.returnValue(of({ token: 'abc123' } as any)),
        validateActivation: jasmine.createSpy('validateActivation').and.returnValue(of({ valid: true })),
    };

    const sessionServiceMock: Partial<SessionService> = {
        canRead: jasmine.createSpy('canRead').and.returnValue(true),
    };

    const routerMock: Partial<Router> = {
        navigate: jasmine.createSpy('navigate'),
    };

    const messageServiceMock: Partial<MessageService> = {
        add: jasmine.createSpy('add'),
    };

    const activatedRouteMock: Partial<ActivatedRoute> = {
        queryParams: queryParams$.asObservable(),
    };

    const USER = 'USER';
    const AGENT_OFFICER = 'AGENT_OFFICER';

    beforeEach(async () => {

        (authServiceMock.login as jasmine.Spy).calls.reset();
        (authServiceMock.requestUser as jasmine.Spy).calls.reset();
        (authServiceMock.validateActivation as jasmine.Spy).calls.reset();
        (sessionServiceMock.canRead as jasmine.Spy).calls.reset();
        (routerMock.navigate as jasmine.Spy).calls.reset();
        (messageServiceMock.add as jasmine.Spy).calls.reset();

        await TestBed.configureTestingModule({
            declarations: [LoginComponent],
            imports: [
                ReactiveFormsModule,
                RouterTestingModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                FormBuilder,
                { provide: AuthService, useValue: authServiceMock },
                { provide: SessionService, useValue: sessionServiceMock },
                { provide: Router, useValue: routerMock },
                { provide: MessageService, useValue: messageServiceMock },
                { provide: ActivatedRoute, useValue: activatedRouteMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(LoginComponent);
        component = fixture.componentInstance;

        queryParams$.next({});

        fixture.detectChanges();
    });

    it('should createss', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize loginForm and activationForm', () => {
        expect(component.loginForm).toBeTruthy();
        expect(component.activationForm).toBeTruthy();
        expect(component.expired()).toBeFalse();
    });

    it('should set expired to true when query param expired = true', () => {
        component.expired.set(false);
        queryParams$.next({ expired: 'true' });

        expect(component.expired()).toBeTrue();
    });

    it('should open popup and set userType and context on openPopup', () => {
        component.openPopup(USER);

        expect(component.showPopup).toBeTrue();
        expect(component.userType).toBe(USER);
        expect(component.loginForm.value.context).toBe(USER);
    });

    it('should close popup and reset userType on closePopup', () => {
        component.openPopup(AGENT_OFFICER);
        expect(component.showPopup).toBeTrue();

        component.closePopup();

        expect(component.showPopup).toBeFalse();
        expect(component.userType).toBeNull();
    });

    it('should open activate popup and reset state', () => {
        // ensuciamos un poco el estado antes
        component.showActivatePopup = false;
        component.activateError.set(true);
        component.activateSuccess.set(true);
        component.verified.set(true);
        component.activationForm.patchValue({ email: 'test@test.com' });

        component.openActivatePopup();

        expect(component.showActivatePopup).toBeTrue();
        expect(component.activateError()).toBeFalse();
        expect(component.activateSuccess()).toBeFalse();
        expect(component.verified()).toBeNull();
        expect(component.activationForm.value.email).toBeNull();
    });

    it('should close activate popup on closeActivatePopup', () => {
        component.showActivatePopup = true;

        component.closeActivatePopup();

        expect(component.showActivatePopup).toBeFalse();
    });

    it('should not call authService.login when form is invalid', () => {
        component.loginForm.patchValue({
            username: null,
            password: null,
            context: null,
        });

        component.onSubmit();

        expect(authServiceMock.login as jasmine.Spy).not.toHaveBeenCalled();
    });

    it('should call authService.login when form is valid', () => {
        component.loginForm.patchValue({
            username: 'user@test.com',
            password: '12345678',
            context: USER,
        });

        component.onSubmit();

        expect(authServiceMock.login as jasmine.Spy).toHaveBeenCalledWith(
            'user@test.com',
            '12345678',
            USER,
        );
    });

    it('should handle login error and set errorLogin to true', () => {
        (authServiceMock.login as jasmine.Spy).and.returnValue(
            throwError(() => new Error('Login error')),
        );

        component.loginForm.patchValue({
            username: 'user@test.com',
            password: '12345678',
            context: USER,
        });

        component.onSubmit();

        expect(messageServiceMock.add as jasmine.Spy).toHaveBeenCalled();
        expect(component.errorLogin()).toBeTrue();
    });

    it('should call authService.requestUser and navigate on userRequest', () => {
        component.userRequest();

        expect(authServiceMock.requestUser as jasmine.Spy).toHaveBeenCalled();
        expect(routerMock.navigate as jasmine.Spy).toHaveBeenCalledWith(
            ['public/user-request', 'abc123'],
        );
    });

    it('should not call validateActivation if activationForm is invalid', () => {
        component.activationForm.patchValue({ email: null });

        component.activateAccount();

        expect(authServiceMock.validateActivation as jasmine.Spy).not.toHaveBeenCalled();
    });

    it('should call validateActivation and set success state when valid is true', () => {
        (authServiceMock.validateActivation as jasmine.Spy).and.returnValue(
            of({ valid: true }),
        );

        component.activationForm.patchValue({ email: 'test@test.com' });

        component.activateAccount();

        expect(authServiceMock.validateActivation as jasmine.Spy).toHaveBeenCalledWith({
            email: 'test@test.com',
        });

        expect(component.verified()).toBeTrue();
        expect(component.activateSuccess()).toBeTrue();
        expect(component.activateError()).toBeFalse();
        expect(component.activating()).toBeFalse();
    });

    it('should set error state when validateActivation returns valid false', () => {
        (authServiceMock.validateActivation as jasmine.Spy).and.returnValue(
            of({ valid: false }),
        );

        component.activationForm.patchValue({ email: 'test@test.com' });

        component.activateAccount();

        expect(component.verified()).toBeFalse();
        expect(component.activateSuccess()).toBeFalse();
        expect(component.activateError()).toBeTrue();
        expect(component.activating()).toBeFalse();
    });

    it('should set error state when validateActivation throws error', () => {
        (authServiceMock.validateActivation as jasmine.Spy).and.returnValue(
            throwError(() => new Error('Activation error')),
        );

        component.activationForm.patchValue({ email: 'test@test.com' });

        component.activateAccount();

        expect(component.verified()).toBeFalse();
        expect(component.activateSuccess()).toBeFalse();
        expect(component.activateError()).toBeTrue();
        expect(component.activating()).toBeFalse();
    });
});
