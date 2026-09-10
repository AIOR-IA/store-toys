import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    keyNotPermitted: boolean;
}
export const KEY_TEXT_PATTERN = /^[a-zA-Z0-9_]+$/;

export function KeyTextValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = KEY_TEXT_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { keyNotPermitted: true };
    }
    return null;
}
