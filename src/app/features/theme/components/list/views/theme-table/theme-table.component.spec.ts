import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeTableComponent } from './theme-table.component';
import { ThemeStateService } from 'app/features/theme/services';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ThemeTableComponent', () => {
    let component: ThemeTableComponent;
    let fixture: ComponentFixture<ThemeTableComponent>;

    const themeStateServiceMock: any = {
        findPage: jasmine.createSpy('findPage').and.returnValue(Promise.resolve()),
        parsePagination: jasmine.createSpy('parsePagination').and.callFake((event: any) => ({
            page: event?.page ?? 1,
            perPage: event?.rows ?? 10,
        })),
        pagination: {
            page: 1,
            perPage: 10,
            total: 0,
        },
        items: [],
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ThemeTableComponent],
            providers: [
                { provide: ThemeStateService, useValue: themeStateServiceMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .overrideComponent(ThemeTableComponent, {
                set: { template: '' },
            })
            .compileComponents();

        fixture = TestBed.createComponent(ThemeTableComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
