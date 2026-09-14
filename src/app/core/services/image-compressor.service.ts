import { Injectable } from '@angular/core';

/** Parámetros de compresión de imagen de producto (plan §9.2). */
const PRODUCT_MAX_DIMENSION_PX = 1600;
const PRODUCT_WEBP_QUALITY = 0.82;

/**
 * Parámetros de compresión de un voucher QR (Fase 5, prompt §12): más
 * dimensión y más calidad que una foto de producto — un voucher solo sirve
 * como evidencia si el texto/monto/número de transacción siguen siendo
 * legibles, así que se prioriza legibilidad sobre peso del archivo.
 */
const VOUCHER_MAX_DIMENSION_PX = 2000;
const VOUCHER_WEBP_QUALITY = 0.9;

/**
 * Compresión de imágenes en el cliente, obligatoria antes de subir a
 * Storage (plan §9.2, CLAUDE.md "Imágenes"): una foto de celular son 3–5 MB,
 * y el bucket de Mi Pimpollito está en `US-CENTRAL1` a propósito por la
 * cuota gratuita — subirlas tal cual multiplicaría por veinte el costo y la
 * velocidad de carga del catálogo en el mostrador.
 *
 * `imageOrientation: 'from-image'` aplica la rotación EXIF: sin esto, las
 * fotos verticales de celular aparecen giradas 90°, el bug clásico de este
 * flujo.
 */
@Injectable({ providedIn: 'root' })
export class ImageCompressorService {
    async compressProductImage(file: File): Promise<Blob> {
        return this.compress(file, PRODUCT_MAX_DIMENSION_PX, PRODUCT_WEBP_QUALITY);
    }

    /** Voucher de pago QR (Fase 5): mismo compresor, calibrado para legibilidad. */
    async compressVoucherImage(file: File): Promise<Blob> {
        return this.compress(file, VOUCHER_MAX_DIMENSION_PX, VOUCHER_WEBP_QUALITY);
    }

    private async compress(file: File, maxDimension: number, quality: number): Promise<Blob> {
        const bitmap = await createImageBitmap(file, {
            imageOrientation: 'from-image',
        });

        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('No se pudo obtener el contexto 2D del canvas.');
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (blob) =>
                    blob
                        ? resolve(blob)
                        : reject(new Error('No se pudo comprimir la imagen.')),
                'image/webp',
                quality,
            );
        });
    }
}
