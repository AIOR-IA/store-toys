import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AuditService } from './audit.service';

describe('AuditService', () => {
    let service: AuditService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [AuditService],
        });

        service = TestBed.inject(AuditService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should have correct base endpoint', () => {
        expect((service as any).pathContext).toBe('audit');
    });
});
