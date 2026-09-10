import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    invalidCI: boolean;
}
export const CI_PATTERN = /^\d{6,15}$/;

export function CiValidator(control: AbstractControl): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.toString().trim();

    const isValid = CI_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { invalidCI: true };
    }
    return null;
}
