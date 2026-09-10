import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    addressInvalid: boolean;
}
export const ADDRESS_PATTERN = /^[a-zA-Z0-9ñÑáéíóúÁÉÍÓÚüÜ,-.\s/#]+$/;

export function AddressValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    const isValid = ADDRESS_PATTERN.test(controlValue);

    if (!isValid && !!controlValue) {
        return { addressInvalid: true };
    }
    return null;
}
