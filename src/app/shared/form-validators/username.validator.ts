import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    invalidUsername: boolean;
}
export const USERNAME_TEXT_PATTERN = /^[a-zA-Z0-9_.]+$/;

export function UsernameValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = USERNAME_TEXT_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { invalidUsername: true };
    }
    return null;
}
