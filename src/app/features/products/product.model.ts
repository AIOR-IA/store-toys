import { Timestamp } from '@angular/fire/firestore';
import { BarcodeFormat, CodeSource } from '@core/utils';

/**
 * Modelo de `products/{autoId}` (plan §8.4), adaptado a las decisiones
 * confirmadas por el cliente para la Fase 3:
 *
 * - Sin variantes por color: un modelo con varios colores es UN producto con
 *   UN código y UN stock conjunto (no hay `ProductVariant`).
 * - `codeSource`/`barcodeFormat` reemplazan el supuesto de que todo código de
 *   fábrica es EAN-13: ~10% de los juguetes no trae código y recibe uno
 *   interno (Code 128); el resto conserva el código de fábrica tal cual,
 *   sea cual sea su simbología real.
 *
 * El ID del documento es Auto-ID de Firestore — nunca el código de barras
 * (plan §13.1): el código cambia (reetiquetado, EAN distinto de otro
 * proveedor, dígito corregido) y el `productId` es la identidad estable a la
 * que apuntan ventas y stock.
 */
export interface Product {
    id: string; // del ID del documento — NO se guarda en el documento
    name: string;
    description?: string;

    priceCents: number; // entero. Bs 10,50 → 1050 (plan §17.1)
    stock: number; // entero. Puede ser negativo (Fase 4, venta sin stock)

    code: string; // código principal actual: interno o de fábrica
    codeSource: CodeSource;
    barcodeFormat: BarcodeFormat;

    imageUrl: string; // obligatoria
    imagePath: string;

    isActive: boolean; // soft delete

    /** Nombre normalizado → búsqueda por prefijo y orden alfabético (plan §12.2). */
    nameLower: string;

    createdBySellerId: string; // quién lo cargó (decisión C-3)
    createdBySellerName: string; // snapshot

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/**
 * Índice técnico `barcodes/{code}` → producto (plan §8.5, §14.1). No es un
 * módulo visible: resuelve el escaneo y garantiza la unicidad del código por
 * la identidad del ID del documento.
 *
 * `kind` describe la PROCEDENCIA del código (de fábrica vs. generado por la
 * tienda), no su simbología exacta — eso lo dice `barcodeFormat` en
 * `Product`. Se conserva el nombre `kind`/`'ean'` del plan (§8.5) por
 * continuidad con el modelo documentado; en la práctica "ean" agrupa
 * cualquier código que trajo el fabricante, sea o no EAN-13 real.
 */
export interface BarcodeIndex {
    code: string; // del ID del documento
    productId: string;
    kind: 'ean' | 'internal';
    createdAt: Timestamp;
}

/** `counters/internalCode` — generador de códigos propios (plan §14.2). */
export interface Counter {
    seq: number;
    updatedAt: Timestamp;
}
