import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    charsNotPermitted: boolean;
}
export const NORMALIZE_TEXT_PATTERN = /^[a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ_\-().\/\s]+$/;

export function NormalizeTextValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = NORMALIZE_TEXT_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { charsNotPermitted: true };
    }
    return null;
}
