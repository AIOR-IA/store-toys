import { Injectable } from '@angular/core';

/** Parámetros de compresión de imagen de producto (plan §9.2). */
const MAX_DIMENSION_PX = 1600;
const WEBP_QUALITY = 0.82;

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
        const bitmap = await createImageBitmap(file, {
            imageOrientation: 'from-image',
        });

        const scale = Math.min(
            1,
            MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height),
        );
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
                WEBP_QUALITY,
            );
        });
    }
}
