import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuditComponent } from './audit.component';
import { AuditService, AuditStateService } from '../../services';
import { IAudit, AuditAction } from '../../models';

import {
  TranslateModule,
  TranslateService,
  TranslationChangeEvent,
  LangChangeEvent,
  DefaultLangChangeEvent,
} from '@ngx-translate/core';

import { of } from 'rxjs';
import { CalendarModule } from 'primeng/calendar';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

describe('AuditComponent', () => {
  let component: AuditComponent;
  let fixture: ComponentFixture<AuditComponent>;

  const stateMock: any = {
    resources: {
      AUDIT: 'AUDIT',
    },
    items: [] as IAudit[],
    meta: {
      perPage: 10,
      first: 1,
      total: 0,
    },
    loading: false,
    findPage: jasmine.createSpy('findPage').and.returnValue(Promise.resolve()),
    parsePagination: jasmine
      .createSpy('parsePagination')
      .and.callFake((event: any) => ({
        page: event.first,
        perPage: event.rows,
      })),
  };

  const auditServiceMock: Partial<AuditService> = {
    exportXlsx: jasmine
      .createSpy('exportXlsx')
      .and.returnValue(of(new ArrayBuffer(10))),
  };

  const translateServiceMock: Partial<TranslateService> = {
    get: (key: any) => {
      if (key === 'app.menu.admin') {
        return of({ title: 'Admin', audit: 'Auditoría' });
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
      declarations: [AuditComponent],
      imports: [
        FormsModule,
        CalendarModule,
        TableModule,
        ButtonModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: AuditStateService, useValue: stateMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: TranslateService, useValue: translateServiceMock },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call state.findPage on init with sort createdAt desc', () => {
    const spy = stateMock.findPage as jasmine.Spy;
    spy.calls.reset();

    component.ngOnInit();

    expect(spy).toHaveBeenCalledWith({
      sort: 'createdAt',
      order: 'desc',
    });
  });

  it('should load breadcrumbs correctly', () => {
    component.loadBreadcrumb();

    const items = component.breadcrumbItems();
    expect(items.length).toBe(2);
    expect(items[0].routerLink).toBe('/admin');
    expect(items[1].routerLink).toBe('/admin/audit');
  });

  it('should call parsePagination and findPage in loadLazy', () => {
    const event = { first: 2, rows: 20 };
    const parseSpy = stateMock.parsePagination as jasmine.Spy;
    const findSpy = stateMock.findPage as jasmine.Spy;

    parseSpy.calls.reset();
    findSpy.calls.reset();
    parseSpy.and.returnValue({ page: 2, perPage: 20 } as any);

    component.loadLazy(event as any);

    expect(parseSpy).toHaveBeenCalledWith(event);
    expect(findSpy).toHaveBeenCalledTimes(1);

    const arg = findSpy.calls.mostRecent().args[0];
    expect(arg.page).toBe(2);
    expect(arg.perPage).toBe(20);
    expect(arg.sort).toBe('createdAt');
    expect(arg.order).toBe('desc');
  });

  it('should build translated action key from getKeyTranslatedAction', () => {
    const key = component.getKeyTranslatedAction('CREATE' as AuditAction);
    expect(key).toBe('app.audit.actions.create');
  });

  it('should not search when dates are not set in onSearch', () => {
    const findSpy = stateMock.findPage as jasmine.Spy;
    findSpy.calls.reset();

    component.dates = undefined;
    component.minDate.set(null);
    component.maxDate.set(null);

    component.onSearch(' 192.168.1.1 ');

    expect(component.ipAddress).toBe('192.168.1.1');
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('should search with filters when dates are set in onSearch', () => {
    const findSpy = stateMock.findPage as jasmine.Spy;
    findSpy.calls.reset();

    const start = new Date('2025-01-01T00:00:00Z');
    const end = new Date('2025-01-02T00:00:00Z');
    component.dates = [start, end];

    component.onSearch('10.0.0.1');

    expect(findSpy).toHaveBeenCalledTimes(1);

    const arg = findSpy.calls.mostRecent().args[0];
    expect(arg.page).toBe(1);

    const filter = JSON.parse(arg.filter);
    expect(filter.ipAddress).toBe('10.0.0.1');
    expect(filter.rangeDate.start).toBe(new Date(start).toISOString());
    expect(filter.rangeDate.end).toBe(new Date(end).toISOString());
  });

  it('onChangeDates should call findPage and reset minDate & maxDate', () => {
    const findSpy = stateMock.findPage as jasmine.Spy;
    findSpy.calls.reset();

    const start = new Date('2025-01-03T00:00:00Z');
    const end = new Date('2025-01-04T00:00:00Z');
    component.dates = [start, end];

    component.onChangeDates();

    expect(findSpy).toHaveBeenCalled();
    expect(component.minDate()).toBeNull();
    expect(component.maxDate()).toBeNull();
  });

  it('downloadXlsx should call auditService.exportXlsx with filters and trigger download', () => {
    const exportSpy = auditServiceMock.exportXlsx as jasmine.Spy;
    exportSpy.calls.reset();

    const start = new Date('2025-01-01T00:00:00Z');
    const end = new Date('2025-01-02T00:00:00Z');

    component.dates = [start, end];
    component.ipAddress = '127.0.0.1';

    const createObjectURLSpy = spyOn(window.URL, 'createObjectURL').and.returnValue('blob:url');
    const revokeSpy = spyOn(window.URL, 'revokeObjectURL').and.stub();
    const clickSpy = jasmine.createSpy('click');

    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    component.downloadXlsx();

    expect(exportSpy).toHaveBeenCalledTimes(1);

    const args = exportSpy.calls.mostRecent().args[0];
    expect(args.page).toBe(1);
    expect(args.perPage).toBe(500);

    const filter = JSON.parse(args.filter);
    expect(filter.ipAddress).toBe('127.0.0.1');
    expect(filter.rangeDate.start).toBe(new Date(start).toISOString());
    expect(filter.rangeDate.end).toBe(new Date(end).toISOString());

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });
});
