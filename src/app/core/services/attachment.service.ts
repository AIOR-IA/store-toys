import { inject, Injectable } from '@angular/core';
import { lastValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { IAttachment } from '@core/models';

@Injectable({
    providedIn: 'root',
})
export class AttachmentService {
    _urlCtxPath = 'attachment';
    http = inject(HttpClient);
    apiUrl = environment.API_URL;

    constructor() { }

    upload(data: FormData): Observable<IAttachment[]> {
        return this.http.post<IAttachment[]>(
            `${this.apiUrl}/${this._urlCtxPath}/upload`,
            data
        );
    }

    getFile(key: string, download?: boolean) {
        let options = {};
        if (download) {
            options = {
                params: {
                    download,
                },
            };
        }
        return this.http.get<IAttachment[]>(
            `${this.apiUrl}/${this._urlCtxPath}/${key}`,
            options
        );
    }

    getFileUrl(key: string, download?: boolean) {
        if (!key) return '#';

        const url = encodeURI(`${this.apiUrl}/${this._urlCtxPath}/${key}`);

        if (download) return `${url}?download=${download}`;

        return url;
    }

    findOne(id: number, params?: any): Promise<IAttachment> {
        return lastValueFrom(this.http.get<IAttachment>(`${this.apiUrl}/${this._urlCtxPath}/id/${id}`, { params }));
    }

    delete(id: number) {
        return this.http.delete<void>(`${this.apiUrl}/attachment/${id}`);
    }

    getFileAsBlob(key: string): Promise<Blob> {
        console.log('[ATTACHMENT] calling backend key=', key);
        return lastValueFrom(
            this.http.get(`${this.apiUrl}/attachment/${key}`, {
                responseType: 'blob',
            })
        );
    }
}
