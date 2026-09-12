import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { ValidationErrors } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { OverlayPanelModule } from 'primeng/overlaypanel';

@Component({
    selector: 'app-field-error',
    standalone: true,
    imports: [TranslateModule, OverlayPanelModule, CommonModule],
    templateUrl: './field-error.component.html',
    styleUrl: './field-error.component.scss',
})
export class FieldErrorComponent {
    errors = input.required<ValidationErrors | null>();
    field = input.required<string>();
    thin = input<boolean>(false);
    errorMsg = input<string>();
    maxlength = 0;
    minlength = 0;
    max = 0;
    min = 0;

    constructor() {}

    get errorsKeys(): string[] {
        return Object.keys(this.errors() || {});
    }

    hasError(errorKey: string): boolean {
        const errors = this.errors();
        if (!errors) {
            return false;
        }

        return errors[this.field()]?.[errorKey];
    }

    getErrorMessage(errorKey: string): string {
        const errors = this.errors();
        if (errors && errorKey === 'minlength') {
            this.minlength = errors['minlength'].requiredLength;
        }
        if (errors && errorKey === 'maxlength') {
            this.maxlength = errors['maxlength'].requiredLength;
        }
        if (errors && errorKey === 'min') {
            this.min = errors['min'].min;
        }
        if (errors && errorKey === 'max') {
            this.max = errors['max'].max;
        }

        let errorMessage = errorKey || 'default';
        errorMessage = `app.common.errors.${errorMessage}`;

        const customErrorMessage = this.errorMsg();

        if (errors && errorKey === 'pattern' && customErrorMessage) {
            errorMessage = customErrorMessage;
        }

        return errorMessage;
    }
}
