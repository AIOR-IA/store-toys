import { Pipe, PipeTransform } from '@angular/core';
import { formatProductDescription, formatProductName } from '../utils/text-format.util';

/** Nombre de producto en MAYÚSCULAS — solo presentación; delega en `formatProductName`. */
@Pipe({ name: 'productName', standalone: true })
export class ProductNamePipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        return formatProductName(value);
    }
}

/** Descripción en «sentence case» — solo presentación; delega en `formatProductDescription`. */
@Pipe({ name: 'productDescription', standalone: true })
export class ProductDescriptionPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        return formatProductDescription(value);
    }
}
