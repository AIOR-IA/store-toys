import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { ISystemConfig } from '../models';
import { IHttService } from '@core/models/http-service.interface';
import { Observable } from 'rxjs';
@Injectable()
export class SystemConfigService
    extends BaseHttpService<ISystemConfig>
    implements IHttService<ISystemConfig>
{
    private markdownCache: string | null = null;

    constructor() {
        super('system-configs');
    }

    configSecretKey(): Observable<string> {
          return this.http.get<string>(
              `${this.apiUrl}/webhook`,
              {},
          );
    }

    async getMarkdown(): Promise<string> {
      if (this.markdownCache) {
        return this.markdownCache;
      }

      try {
        const response = await fetch('/assets/webhook.md');
        let markdown = await response.text();

        markdown = markdown.replace(/{{API_URL}}/g,this.apiUrl);

        this.markdownCache = markdown;

        return markdown;
      } catch (error) {
        return 'Error al cargar el contenido.';
      }
    }
}
