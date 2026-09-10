import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'truncateText',
    standalone: true,
})
export class TruncateTextPipe implements PipeTransform {
    transform(value: string | undefined, maxLength: number): string {
        if (!value) return '';
        try {
            if (value.length <= maxLength) {
                return value;
            } else {
                return `${value.slice(0, maxLength)}...`;
            }
        } catch (e) {
            return value;
        }
    }
}
