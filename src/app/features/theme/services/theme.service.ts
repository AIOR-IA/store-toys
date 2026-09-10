import { Injectable } from '@angular/core';
import { BaseHttpService } from '@core/services';
import { ITheme } from '../models';
import { IHttService } from '@core/models/http-service.interface';

@Injectable({
  providedIn: 'root'
})
export class ThemeService
  extends BaseHttpService<ITheme>
  implements IHttService<ITheme> {
  constructor() {
    super('theme');
  }
}

