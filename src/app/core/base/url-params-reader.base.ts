import { inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

export class UrlParamsReader {
    params = signal({} as any);
    protected route = inject(ActivatedRoute);

    constructor() {
        this.readParams();
        this.readQueryParams();
    }

    protected readParams() {
        this.route.params.subscribe((params) => {
            this.params.set({
                ...params,
            });
        });
    }

    protected readQueryParams() {
        this.route.queryParams.subscribe((queryParams) => {
            this.params.set({
                ...this.params(),
                ...queryParams,
            });
        });
    }
}
