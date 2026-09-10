import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    codeNotPermitted: boolean;
}
export const CODE_TEXT_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export function CodeTextValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = CODE_TEXT_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { codeNotPermitted: true };
    }
    return null;
}
