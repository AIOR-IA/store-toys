import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeCardsComponent } from './theme-cards.component';
import { ThemeStateService } from 'app/features/theme/services';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ThemeCardsComponent', () => {
    let component: ThemeCardsComponent;
    let fixture: ComponentFixture<ThemeCardsComponent>;

    const themeStateServiceMock: any = {
        findPage: jasmine.createSpy('findPage').and.returnValue(Promise.resolve()),
        parsePagination: jasmine
            .createSpy('parsePagination')
            .and.callFake((event: any) => event),
    };


    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ThemeCardsComponent],
            providers: [
                { provide: ThemeStateService, useValue: themeStateServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeCardsComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeCardsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
