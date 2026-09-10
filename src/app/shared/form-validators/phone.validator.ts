import { AbstractControl } from '@angular/forms';

interface ValidatorError {
    phoneInvalid: boolean;
}

// Patrón mejorado para teléfonos válidos de Bolivia
// Acepta: celulares (6/7 + 7 dígitos), fijos sin prefijo (2/3/4 + 6 dígitos), 
// y fijos con prefijo de ciudad completo
export const PHONE_PATTERN = /^(\+591\s?)?([67]\d{7}|[234]\d{6}|(22|33|44|52|62|64|66|46|84)\d{6})$/;

export function PhoneValidator(
    control: AbstractControl
): ValidatorError | null {
    if (control.value === null || control.value === undefined) {
        return null;
    }

    const controlValue: string = control.value.toString().trim();

    // If the field is empty, do not validate (use required validator separately)
    if (!controlValue) {
        return null;
    }

    // Normalize the number by removing spaces, dashes, and parentheses
    const normalizedValue = controlValue.replace(/[\s\-\(\)]/g, '');

    const isValid = PHONE_PATTERN.test(normalizedValue);

    if (!isValid) {
        return { phoneInvalid: true };
    }
    return null;
}
