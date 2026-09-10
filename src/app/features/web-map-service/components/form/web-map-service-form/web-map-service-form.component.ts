import { Component, inject, OnInit, signal } from '@angular/core';
import { BaseFormComponent } from '@shared/components';
import { Validators } from '@angular/forms';
import { IWebMapService } from '../../../models';
import { WebMapServiceService, WebMapServiceStateService } from '../../../services';
import { shortenBlankSpaces } from '@core/utils';

@Component({
  selector: 'app-web-map-service-form',
  templateUrl: './web-map-service-form.component.html',
  styleUrl: './web-map-service-form.component.scss'
})
export class WebMapServiceFormComponent extends BaseFormComponent<IWebMapService> implements OnInit {
  override service = inject(WebMapServiceService);
  override state = inject(WebMapServiceStateService);

  constructor() {
    super()
  }

  override buildForm(): void {
    let current = {} as IWebMapService;
    if (this.state.current && (this.isUpdateMode || this.isViewMode)) {
      current = this.state.current;
    }

    this.form = this._fb.group({
      id: [current.id],
      url: [
        current.url,
        [
          Validators.required,
          Validators.pattern(
            /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i
          ), // patrón para validar URLs
        ],
      ],
      layer: [
        current.layer,
        [
          Validators.required,
          Validators.maxLength(120),
        ],
      ],
      label: [
        current.label,
        [
          Validators.required,
          Validators.maxLength(100),
        ],
      ],
      group: [
        current.group,
        [
          Validators.required,
          Validators.maxLength(100),
        ],
      ],
      description: [
        current.description,
        [
          Validators.maxLength(500),
        ],
      ],
      opacity: [
        current.opacity ?? 1,
        [
          Validators.required,
          Validators.min(0),
          Validators.max(1),
        ],
      ],
      enabled: [!!current.enabled]
    });

    if (this.isViewMode) {
      this.form.disable();
    }
  }

  override onSubmit() {
    this.form.get('name')?.setValue(shortenBlankSpaces(this.form.get('name')?.value));
    super.onSubmit((response) => {
    });
  }
}
