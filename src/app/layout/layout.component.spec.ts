import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppLayoutComponent } from './layout.component';
import { Subject } from 'rxjs';
import { AuthService } from '@core/services';
import { NO_ERRORS_SCHEMA, Renderer2 } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { LayoutService } from './services/app.layout.service';


describe('LayoutComponent', () => {
    let component: AppLayoutComponent;
    let fixture: ComponentFixture<AppLayoutComponent>;

    const overlayOpen$ = new Subject<void>();

    const layoutServiceMock: any = {
        overlayOpen$: overlayOpen$,
        state: {
            staticMenuDesktopInactive: false,
            staticMenuMobileActive: false,
            overlayMenuActive: false,
            menuHoverActive: false,
            profileSidebarVisible: false,
        },
        config: () => ({
            colorScheme: 'light',
            menuMode: 'static',
            inputStyle: 'filled',
            ripple: true,
        }),
    };

    const authServiceMock: Partial<AuthService> = {
        startTokenCheck: jasmine.createSpy('startTokenCheck'),
        stopTokenCheck: jasmine.createSpy('stopTokenCheck'),
    };

    const rendererMock: Partial<Renderer2> = {
        listen: () => () => { },
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [AppLayoutComponent],
            imports: [
                RouterTestingModule,
            ],
            providers: [
                { provide: LayoutService, useValue: layoutServiceMock },
                { provide: AuthService, useValue: authServiceMock },
                { provide: Renderer2, useValue: rendererMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(AppLayoutComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should call authService.startTokenCheck on init', () => {
        expect(authServiceMock.startTokenCheck as jasmine.Spy).toHaveBeenCalled();
    });

    it('should return correct containerClass based on layoutService config/state', () => {
        const classes = component.containerClass;

        expect(classes['layout-theme-light']).toBeTrue();
        expect(classes['layout-theme-dark']).toBeFalse();

        expect(classes['layout-static']).toBeTrue();
        expect(classes['layout-overlay']).toBeFalse();

        expect(classes['layout-static-inactive']).toBeFalse();
        expect(classes['layout-overlay-active']).toBeFalse();
        expect(classes['layout-mobile-active']).toBeFalse();

        expect(classes['p-input-filled']).toBeTrue();
        expect(classes['p-ripple-disabled']).toBeFalse();
    });
});
