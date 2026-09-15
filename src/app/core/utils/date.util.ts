import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Timestamp } from '@angular/fire/firestore';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Formatea un `Timestamp` en la zona del negocio (plan §17.2) — nunca con la
 * hora del navegador. Solo para MOSTRAR: `dateKey`/`monthKey`/`year` ya
 * llegan calculados en servidor (Fase 4, `functions/src/date-keys.ts`); esto
 * es exclusivamente para el comprobante y las pantallas de historial.
 */
export function formatInStoreTimezone(
    timestamp: Timestamp,
    zone: string,
    format = 'DD/MM/YYYY HH:mm',
): string {
    return dayjs(timestamp.toDate()).tz(zone).format(format);
}

/**
 * `dateKey` de "hoy" en la zona del negocio — para que el filtro por
 * defecto del historial (plan §15.5) coincida con el `dateKey` que
 * `createSale` calculó en servidor, sin importar la zona del navegador.
 */
export function todayKeyInZone(zone: string, date = new Date()): string {
    return dayjs(date).tz(zone).format('YYYY-MM-DD');
}

/** `dateKey` ('YYYY-MM-DD') → `Date` a mediodía local, cómodo para un `<p-calendar>`. */
export function dateFromKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

/** Inversa de `dateFromKey`: una fecha elegida en el calendario → su `dateKey`. */
export function dateToKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * `dateKey` ± N días — pura aritmética de calendario sobre el string, sin
 * zona horaria (Fase 7, Reportes): sirve para los presets de rango
 * ("últimos 7 días") y no debe confundirse con `dateKeyRangeToTimestampBounds`
 * (abajo), que sí necesita la zona porque compara contra un `Timestamp` real.
 */
export function shiftDateKey(dateKey: string, days: number): string {
    return dayjs(dateKey, 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
}

/** Primer día del mes de `dateKey` (Fase 7, preset "Este mes"). */
export function monthStartKey(dateKey: string): string {
    return dayjs(dateKey, 'YYYY-MM-DD').startOf('month').format('YYYY-MM-DD');
}

/** Primer día del año de `dateKey` (Fase 7, preset "Este año"). */
export function yearStartKey(dateKey: string): string {
    return dayjs(dateKey, 'YYYY-MM-DD').startOf('year').format('YYYY-MM-DD');
}

/**
 * Convierte un rango `[fromKey, toKey]` (inclusive, en la zona del negocio) a
 * los límites `Timestamp` que corresponden — `end` es EXCLUSIVO (el
 * medianoche del día siguiente a `toKey`). Fase 7: solo lo necesita el conteo
 * de redenciones en `giftCardMovements`, que guarda `createdAt` (Timestamp)
 * y no un `dateKey` propio — todo lo demás en Reportes filtra por `dateKey`
 * directo (plan §17.2, sin convertir zonas).
 */
export function dateKeyRangeToTimestampBounds(
    fromKey: string,
    toKey: string,
    zone: string,
): { start: Timestamp; end: Timestamp } {
    const start = dayjs.tz(fromKey, 'YYYY-MM-DD', zone).startOf('day');
    const end = dayjs.tz(toKey, 'YYYY-MM-DD', zone).add(1, 'day').startOf('day');
    return { start: Timestamp.fromDate(start.toDate()), end: Timestamp.fromDate(end.toDate()) };
}
