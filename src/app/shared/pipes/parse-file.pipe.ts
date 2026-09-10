import { Pipe, PipeTransform } from '@angular/core';
import { IAttachment } from '@core/models';

@Pipe({
    name: 'parseFile',
    standalone: true,
})
export class ParseFilePipe implements PipeTransform {
    public transform(file: IAttachment | undefined): IAttachment[] {
        if (!file) return [];

        return [file];
    }
}
