import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { IHttService } from '@core/models/http-service.interface';
import { IAudit } from '../models';
import { Observable } from 'rxjs';

@Injectable()
export class AuditService
    extends BaseHttpService<IAudit>
    implements IHttService<IAudit>
{
    constructor() {
        super('audit');
    }

    exportXlsx(pagination: any): Observable<ArrayBuffer> {
      const url = `${this.apiUrl}/${this.pathContext}/export-xlsx`;
      return this.http.get(url, {
        params: pagination,
        responseType: 'arraybuffer',
      });
    }
}
