import { Inject, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IHttService } from '@core/models/http-service.interface';
import { environment } from 'environments/environment';

@Injectable()
export class BaseSingleHttpService {
    pathContext!: string;
    http = inject(HttpClient);
    apiUrl = environment.API_URL;

    constructor(@Inject(String) _path: string) {
        this.pathContext = _path;
    }
}
