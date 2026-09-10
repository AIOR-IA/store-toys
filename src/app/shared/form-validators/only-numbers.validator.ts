import { AbstractControl, ValidationErrors } from '@angular/forms';

interface OnlyNumbersError {
  onlyNumbers: boolean;
}

const ONLY_NUMBERS_REGEX = /^\d+$/;

export function onlyNumbersValidator(
  control: AbstractControl
): OnlyNumbersError | null {
  const v = control.value;
  if (v === null || v === undefined || v === '') {
    return null;
  }

  const str = v.toString().trim();
  const valid = ONLY_NUMBERS_REGEX.test(str);

  return !valid && !!str ? { onlyNumbers: true } : null;
}
