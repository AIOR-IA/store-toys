import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppSidebarComponent } from './sidebar.component';
import { SessionService } from '@core/services';
import { LayoutService } from '../../services/app.layout.service';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { AttachmentService } from '../../../core/services/attachment.service';
import { OfficerRegistrationStateService } from '../../../features/officers/registrations/services/registrations-state.service';
import { LegalUserRequestService } from '../../../features/public/user-request/juridical/services/lega-user-request.service';
import { UserRequestService } from '../../../features/public/user-request/natural/services/user-request.service';
import { of } from 'rxjs';
import { ILegalUserRequest } from 'app/features/public/user-request/juridical/models/legal-user-request.interface';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';


describe('SidebarComponent', () => {
    let component: AppSidebarComponent;
    let fixture: ComponentFixture<AppSidebarComponent>;

    const layoutServiceMock: Partial<LayoutService> = {
        onMenuToggle: jasmine.createSpy('onMenuToggle'),
    };

    const sessionServiceMock: Partial<SessionService> = {
        isAgentOfficer: () => false,
        isRepresentant: () => false,
        registrationsContext: () => false,
        refresSideBar: () => { },
        user: () => ({}),
        userRequest: signal<any>({ uuid: '123', id: 1 }),
    } as any;

    const attachmentServiceMock: Partial<AttachmentService> = {
        getFileUrl: (key: string) => `url/${key}`,
    };

    const officerRegStateMock: Partial<OfficerRegistrationStateService> = {
        pagination: { filter: '' },
        findPage: (_args: any) => Promise.resolve(),
    };

    const legalUserRequestServiceMock: Partial<LegalUserRequestService> = {
        findByUuid: (_uuid: string) => of({} as ILegalUserRequest),
    };

    const userRequestServiceMock: Partial<UserRequestService> = {
        findByUuid: (_uuid: string) => of({ uuid: '123', id: 1 } as any),
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [AppSidebarComponent],
            imports: [
                TranslateModule.forRoot(),
            ],
            providers: [
                { provide: LayoutService, useValue: layoutServiceMock },
                { provide: SessionService, useValue: sessionServiceMock },
                { provide: AttachmentService, useValue: attachmentServiceMock },
                { provide: OfficerRegistrationStateService, useValue: officerRegStateMock },
                { provide: LegalUserRequestService, useValue: legalUserRequestServiceMock },
                { provide: UserRequestService, useValue: userRequestServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(AppSidebarComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should render app-menu when user is not agent officer', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const menu = compiled.querySelector('app-menu');
        expect(menu).toBeTruthy();
    });

    it('should call layoutService.onMenuToggle when sidebar button is clicked', () => {
        const buttonDe = fixture.debugElement.query(
            By.css('.sidebar-button button')
        );

        expect(buttonDe).toBeTruthy();

        buttonDe.triggerEventHandler('click', null);

        expect(layoutServiceMock.onMenuToggle).toHaveBeenCalled();
    });
});
