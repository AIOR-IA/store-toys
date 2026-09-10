import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    latNotPermitted: boolean;
}
const LATITUDE_PATTERN = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)$/;

export function LatitudeValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.toString().trim();

    const isValid = LATITUDE_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { latNotPermitted: true };
    }
    return null;
}
