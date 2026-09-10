import { Injectable } from '@angular/core';
import { BaseStateService } from '@core/services';
import { ITheme } from '../models';
import { ThemeService } from './theme.service';

@Injectable({ providedIn: 'root' })
export class ThemeStateService extends BaseStateService<ITheme> {

    constructor() {
        super(ThemeService, {
            sort: 'createdAt',
            order: 'desc',
        });
    }
}

