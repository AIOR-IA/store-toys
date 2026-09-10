import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ICartographicCommunity, IDepartment, IMunicipality, IProvince, IStreet } from '@core/models';
import { SldFile } from '@core/types';
import { environment } from 'environments/environment';
import { map, Observable, tap } from 'rxjs';

@Injectable()
export class CartographicService {
    http = inject(HttpClient);
    apiUrl = environment.API_URL;
    pathContext = 'cartographics';

    findDepartments(query: string | string[]): Observable<IDepartment[]> {
        return this.http.get<IDepartment[]>(
            `${this.apiUrl}/${this.pathContext}/departments`,
            {
                params: { search: query },
            }
        );
    }

    findProvinces(
        query: string,
        depId?: number | number[]
    ): Observable<IProvince[]> {
        let params = new HttpParams().set('search', query);

        if (Array.isArray(depId)) {
            depId.forEach((id) => {
                params = params.append('depId', id.toString());
            });
        } else if (typeof depId === 'number') {
            params = params.set('depId', depId.toString());
        }

        return this.http.get<IProvince[]>(
            `${this.apiUrl}/${this.pathContext}/provinces`,
            { params }
        );
    }

    findMunicipalities(
        query: string,
        depId?: number | number[],
        provId?: number | number[]
    ): Observable<IMunicipality[]> {
        let params: any = { search: query };
        if (provId) {
            params = {
                ...params,
                provId,
            };
        }

        if (depId) {
            params = {
                ...params,
                depId,
            };
        }
        return this.http.get<IMunicipality[]>(
            `${this.apiUrl}/${this.pathContext}/municipalities`,
            { params }
        );
    }

    findStreets(
        query: string,
        dep?: string,
        mun?: string,
        size?: number
    ): Observable<IStreet[]> {
        let params: any = { search: query };
        if (dep) {
            params = {
                ...params,
                dep,
            };
        }

        if (mun) {
            params = {
                ...params,
                mun,
            };
        }

        if (size) {
            params = {
                ...params,
                size,
            };
        }

        return this.http.get<IStreet[]>(
            `${this.apiUrl}/${this.pathContext}/streets`,
            { params }
        );
    }

    findByLatLng(latitude: number, longitude: number): Observable<any[]> {
        const params: any = { latitude, longitude };

        return this.http.get<IMunicipality[]>(
            `${this.apiUrl}/${this.pathContext}/lat-lng`,
            { params }
        );
    }

    importGeodata(attachId: number, data: any = {}) {
        return this.http.post<any>(
            `${this.apiUrl}/${this.pathContext}/import/${attachId}`,
            data
        );
    }

    findGeodata(table: string): Observable<any[]> {
        return this.http.get<any[]>(
            `${this.apiUrl}/${this.pathContext}/import/get-data/${table}`
        );
    }

    uploadSldForGeodata(attachId: number, layer: string) {
        return this.http.post<any>(
            `${this.apiUrl}/${this.pathContext}/upload-sld/${attachId}/${layer}`,
            {}
        );
    }

    readSld(attachId: number): Observable<SldFile> {
        return this.http.get<SldFile>(
            `${this.apiUrl}/${this.pathContext}/read-sld/${attachId}`
        );
    }

    downloadLayer(layer: string): Observable<void> {
        const url = `${this.apiUrl}/${this.pathContext}/${layer}/export-layer`;
        return this.http.get(url, { responseType: 'blob' }).pipe(
            tap((blob: Blob) => {
                const objectUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = `${layer}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(objectUrl);
            }),
            map(() => void 0)
        );
    }

    findCommunities(
        query: string,
        dep?: string,
        mun?: string,
        size?: number
    ) {
        let params: any = { search: query };

        if (dep) params = { ...params, dep };
        if (mun) params = { ...params, mun };
        if (size) params = { ...params, size };

        return this.http.get<ICartographicCommunity[]>(
            `${this.apiUrl}/${this.pathContext}/communities`,
            { params }
        );
    }
}
