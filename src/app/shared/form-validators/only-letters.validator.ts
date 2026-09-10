import { AbstractControl } from '@angular/forms';
import { NORMALIZE_TEXT_PATTERN } from './normalize-text.validator';

export interface OnlyLettersValidatorError {
    onlyLetters: boolean;
}

export function onlyLettersValidator(
    control: AbstractControl
): OnlyLettersValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = NORMALIZE_TEXT_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { onlyLetters: true };
    }

    return null;
}
