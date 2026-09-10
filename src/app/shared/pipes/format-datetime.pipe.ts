import { Pipe, type PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatDatetime',
  standalone: true,
})
export class FormatDatetimePipe implements PipeTransform {

  transform(value: string | Date): string {
    const date = new Date(value);
    const days = [
      'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'
    ];
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const dayWeek = days[date.getDay()].toUpperCase();
    const day = date.getDate().toString().padStart(2, '0');
    const mmonth = months[date.getMonth()].toUpperCase();
    const year = date.getFullYear();
    const hour = date.toTimeString().split(' ')[0];

    return `${dayWeek} ${day} DE ${mmonth} DEL ${year} A LAS ${hour}`;
  }

}
