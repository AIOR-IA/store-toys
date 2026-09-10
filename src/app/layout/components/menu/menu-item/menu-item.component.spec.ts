import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppMenuItemComponent } from './menu-item.component';
import { of } from 'rxjs';
import { MenuService } from '../../../services/app.menu.service';
import { LayoutService } from '../../../services/app.layout.service';
import { Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';

describe('MenuItemComponent', () => {
    let component: AppMenuItemComponent;
    let fixture: ComponentFixture<AppMenuItemComponent>;

    const layoutServiceMock: Partial<LayoutService> = {};

    const menuServiceMock: Partial<MenuService> = {
        menuSource$: of({ key: '', routeEvent: false } as any),
        resetSource$: of(null),
        onMenuStateChange: jasmine.createSpy('onMenuStateChange'),
    };

    const routerMock: Partial<Router> = {
        events: of(),
        isActive: () => false,
    };

    beforeEach(async () => {

        (menuServiceMock.onMenuStateChange as jasmine.Spy).calls.reset();

        await TestBed.configureTestingModule({
            declarations: [AppMenuItemComponent],
            imports: [
                RouterTestingModule,
                NoopAnimationsModule,
            ],
            providers: [
                { provide: LayoutService, useValue: layoutServiceMock },
                { provide: MenuService, useValue: menuServiceMock },
                { provide: Router, useValue: routerMock },
            ],
            schemas: [NO_ERRORS_SCHEMA],
        })
            .compileComponents();

        fixture = TestBed.createComponent(AppMenuItemComponent);
        component = fixture.componentInstance;

        component.item = {
            label: 'Test',
            visible: true,
        };
        component.index = 0;
        component.parentKey = '';
        component.root = true;

        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should return "expanded" for submenuAnimation when root is true', () => {
        component.root = true;
        component.active = false;

        expect(component.submenuAnimation).toBe('expanded');
    });

    it('should return "expanded" when not root and active is true', () => {
        component.root = false;
        component.active = true;

        expect(component.submenuAnimation).toBe('expanded');
    });

    it('should return "collapsed" when not root and active is false', () => {
        component.root = false;
        component.active = false;

        expect(component.submenuAnimation).toBe('collapsed');
    });

    it('should not execute command when item is disabled', () => {
        const evt = new MouseEvent('click');
        const commandSpy = jasmine.createSpy('command');

        component.item = {
            disabled: true,
            command: commandSpy,
        };

        component.itemClick(evt);

        expect(commandSpy).not.toHaveBeenCalled();
        expect(menuServiceMock.onMenuStateChange as jasmine.Spy).not.toHaveBeenCalled();
    });

    it('should execute command and notify menuService when item is enabled', () => {
        const evt = new MouseEvent('click');
        const commandSpy = jasmine.createSpy('command');

        component.key = '0';
        component.item = {
            disabled: false,
            command: commandSpy,
            items: [{}],
        };

        component.itemClick(evt);

        expect(commandSpy).toHaveBeenCalled();
        expect((menuServiceMock.onMenuStateChange as jasmine.Spy)).toHaveBeenCalledWith({ key: '0' });
        expect(component.active).toBeTrue();
    });
});
