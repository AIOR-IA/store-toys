import { Pipe, PipeTransform } from '@angular/core';
import { Frequency } from '@core/types';

const FrequencyMap: Record<Frequency, string> = {
    [Frequency.NONE]: 'Ninguna',
    [Frequency.QUARTERLY]: 'Trimestral',
    [Frequency.BIMONTHLY]: 'Bimestral',
    [Frequency.MONTHLY]: 'Mensual',
    [Frequency.BIANNUALLY]: 'Semestral',
    [Frequency.ANNUALLY]: 'Anual',
    [Frequency.EVERY_5_YEARS]: 'Cada 5 años',
    [Frequency.EVERY_10_YEARS]: 'Cada 10 años',
    [Frequency.EVERY_15_YEARS]: 'Cada 15 años',
    [Frequency.EVERY_20_YEARS]: 'Cada 20 años',
    [Frequency.EVERY_25_YEARS]: 'Cada 25 años',
    [Frequency.OTHER]: 'Otro',
};

@Pipe({
    name: 'frequency',
    standalone: true,
})
export class FrequencyPipe implements PipeTransform {
    public transform(value: Frequency): string {
        if (!FrequencyMap[value]) return FrequencyMap[Frequency.OTHER];

        return FrequencyMap[value];
    }
}
