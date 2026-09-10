import { AbstractControl } from '@angular/forms';

interface TrimmedRequiredError {
    trimmedRequired: boolean;
}

export function trimmedRequiredValidator(
    control: AbstractControl
): TrimmedRequiredError | null {
    if (control.value === null) {
        return null;
    }

    const controlValue: string = control.value.trim();

    if (
        !!controlValue &&
        (controlValue.length === 0 || controlValue !== control.value)
    ) {
        return { trimmedRequired: true };
    }

    return null;
}
