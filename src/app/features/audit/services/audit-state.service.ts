import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { IAudit } from '../models';
import { AuditService } from './audit.service';

@Injectable({ providedIn: 'root' })
export class AuditStateService extends BaseStateService<IAudit> {
    constructor() {
        super(AuditService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}
