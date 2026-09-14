// `import x from` exigiría `esModuleInterop` (no habilitado en este
// `tsconfig`, plan de no tocar configuración compartida por una sola
// dependencia): `import x = require(...)` funciona igual para el export CJS
// único de `dayjs` y sus plugins.
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

export interface DateKeys {
    dateKey: string; // 'YYYY-MM-DD'
    monthKey: string; // 'YYYY-MM'
    year: number;
}

/**
 * `dateKey`/`monthKey`/`year` en la zona del negocio (plan §17.2).
 *
 * Bolivia está en UTC−4 sin horario de verano y la tienda cierra a las
 * 20:00 — una venta de esa hora ya es el día siguiente en UTC. Calcularlo
 * aquí, en el servidor, es lo único que hace que el cierre de caja cuadre.
 */
export function dateKeys(now = new Date(), zone = 'America/La_Paz'): DateKeys {
    const d = dayjs(now).tz(zone);
    return { dateKey: d.format('YYYY-MM-DD'), monthKey: d.format('YYYY-MM'), year: d.year() };
}
