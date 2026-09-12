import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { ValidationErrors } from '@angular/forms';
import { OverlayPanelModule } from 'primeng/overlaypanel';

/**
 * Mensajes de error de formulario, en español y sin librería de traducción.
 * Las claves corresponden a los validadores de Angular y a los propios
 * de `shared/form-validators`.
 */
const ERROR_MESSAGES: Record<string, string> = {
    required: 'Campo requerido',
    email: 'El correo no tiene un formato válido',
    minlength: 'Debe tener al menos {value} caracteres',
    maxlength: 'Debe tener como máximo {value} caracteres',
    min: 'El valor mínimo es {value}',
    max: 'El valor máximo es {value}',
    pattern: 'El formato no es válido',
    alreadyExist: 'Ya existe un registro con este {field}',
    mustBeTrue: 'Debe aceptar para continuar',
    minArrayLength: 'Debe seleccionar al menos {value} elemento(s)',
    onlyLetters: 'Solo se permiten letras',
    onlyNumbers: 'Solo se permiten números',
    invalidCi: 'El documento de identidad no es válido',
    invalidPhone: 'El teléfono no es válido',
    invalidWebPage: 'La dirección web no es válida',
    invalidAddress: 'La dirección no es válida',
    invalidCodeText: 'El código no es válido',
    invalidKeyText: 'La clave no es válida',
    trimmedRequired: 'Campo requerido',
    default: 'El valor no es válido',
};

@Component({
    selector: 'app-field-error',
    standalone: true,
    imports: [OverlayPanelModule, CommonModule],
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

        const customErrorMessage = this.errorMsg();
        if (errors && errorKey === 'pattern' && customErrorMessage) {
            return customErrorMessage;
        }

        const template =
            ERROR_MESSAGES[errorKey || 'default'] ?? ERROR_MESSAGES['default'];

        return template
            .replace('{value}', String(this.valueFor(errorKey)))
            .replace('{field}', this.field());
    }

    private valueFor(errorKey: string): number {
        switch (errorKey) {
            case 'minlength':
                return this.minlength;
            case 'maxlength':
                return this.maxlength;
            case 'min':
                return this.min;
            case 'max':
                return this.max;
            default:
                return 0;
        }
    }
}
