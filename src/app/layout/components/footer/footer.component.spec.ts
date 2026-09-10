import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppFooterComponent } from './footer.component';
import { LayoutService } from '../../services/app.layout.service';

class MockLayoutService { }

describe('FooterComponent', () => {
    let component: AppFooterComponent;
    let fixture: ComponentFixture<AppFooterComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [AppFooterComponent],
            providers: [
                { provide: LayoutService, useClass: MockLayoutService },
            ],
        })
            .compileComponents();

        fixture = TestBed.createComponent(AppFooterComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should display the authority text', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.textContent)
            .toContain('Autoridad de Fiscalización y Control Social de Bosques y Tierra ©');
    });

    it('should display the current year', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const currentYear = new Date().getFullYear().toString();

        expect(compiled.textContent).toContain(currentYear);
    });

    it('should render the logo with correct src', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const img = compiled.querySelector('img');

        expect(img).toBeTruthy();
        expect(img?.getAttribute('src')).toBe('assets/layout/images/logo.png');
        expect(img?.getAttribute('alt')).toBe('login-image');
    });
});
