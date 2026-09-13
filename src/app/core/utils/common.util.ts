import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const isObjectEmpty = (obj: object): boolean => {
    return Object.keys(obj).length === 0;
};

export const objectEntries = (obj: object): [string, any][] => {
    return Object.entries(obj);
};

export const objectKeys = (obj: object): string[] => {
    return Object.keys(obj);
};

export function shortenBlankSpaces(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

export function minArrayLength(min: number) {
    return (control: AbstractControl): ValidationErrors | null => {
        const value = control.value;
        if (Array.isArray(value) && value.length >= min) {
            return null;
        }
        return {
            minArrayLength: { requiredLength: min, actualLength: value.length },
        };
    };
}

export function mustBeTrueValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        return control.value === true ? null : { mustBeTrue: true };
    };
}

export function getFileExtension(filename: string): string | null {
    const trimmed = filename.trim().toLowerCase();
    const lastDotIndex = trimmed.lastIndexOf('.');

    if (lastDotIndex === -1 || lastDotIndex === trimmed.length - 1) {
        return null;
    }

    return trimmed.slice(lastDotIndex);
}

export function isDateObject(value: any): boolean {
    return value instanceof Date && !isNaN(value.getTime());
}

export function isDateString(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}

export function isValidDate(value: any): boolean {
    return isDateObject(value) || isDateString(value);
}

export function mbToBytes(mb: number): number {
    return mb * 1000000;
}
