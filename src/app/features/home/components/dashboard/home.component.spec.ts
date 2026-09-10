import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { HomeComponent } from './home.component';
import { SessionService } from '@core/services';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

describe('HomeComponent', () => {
    let component: HomeComponent;
    let fixture: ComponentFixture<HomeComponent>;

    const sessionServiceMock: any = {
        isAgentOfficer: jasmine.createSpy('isAgentOfficer').and.returnValue(true),
        canRead: jasmine.createSpy('canRead').and.returnValue(false),
        triggerRefreshSidebar: jasmine.createSpy('triggerRefreshSidebar'),
        userRequest: jasmine.createSpy('userRequest').and.returnValue({
            inscriptions: [],
        }),
    };

    const routerMock: any = {
        navigate: jasmine.createSpy('navigate'),
        navigateByUrl: jasmine
            .createSpy('navigateByUrl')
            .and.returnValue(Promise.resolve(true)),
    };

    const translateServiceMock: Partial<TranslateService> = {
        get: (key: any) => {
            if (key === 'app.dashboard.tabs') {
                return of({
                    BUDGET: { label: 'Budget', value: 'BUDGET' },
                    OTHER: { label: 'Other', value: 'OTHER' },
                } as any);
            }
            return of(key);
        },
        instant: (k: any) => k,
    };

    beforeEach(async () => {
        (sessionServiceMock.isAgentOfficer as jasmine.Spy).calls.reset();
        (sessionServiceMock.canRead as jasmine.Spy).calls.reset();
        (sessionServiceMock.triggerRefreshSidebar as jasmine.Spy).calls.reset();
        (sessionServiceMock.userRequest as jasmine.Spy).calls.reset();

        await TestBed.configureTestingModule({
            declarations: [HomeComponent],
            imports: [
                CommonModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: SessionService, useValue: sessionServiceMock },
                { provide: Router, useValue: routerMock },
                { provide: TranslateService, useValue: translateServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        }).compileComponents();

        fixture = TestBed.createComponent(HomeComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

});
