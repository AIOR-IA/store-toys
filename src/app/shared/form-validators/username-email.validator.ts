import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    usrOrEmailInvalid: boolean;
}
export const USERNAME_EMAIL_TEXT_PATTERN =
    /^([a-zA-Z0-9_.]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

export function UsernameOrEmailValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = USERNAME_EMAIL_TEXT_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { usrOrEmailInvalid: true };
    }
    return null;
}
