import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    longNotPermitted: boolean;
}
const LONGITUDE_PATTERN = /^[-+]?((1[0-7]\d|0?\d{1,2})(\.\d+)?|180(\.0+)?)$/;

export function LongitudeValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.toString().trim();

    const isValid = LONGITUDE_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { longNotPermitted: true };
    }
    return null;
}
