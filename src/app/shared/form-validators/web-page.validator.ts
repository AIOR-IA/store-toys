import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    webPageInvalid: boolean;
}
export const WEB_PAGE_PATTERN =
    /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/i;

export function WebPageValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = WEB_PAGE_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { webPageInvalid: true };
    }
    return null;
}
