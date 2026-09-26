import { ProductDescriptionPipe, ProductNamePipe } from '../pipes/product-text.pipe';
import { formatProductDescription, formatProductName } from './text-format.util';

describe('formatProductName', () => {
    it('pasa el nombre a MAYÚSCULAS (con tildes, ñ y ü)', () => {
        expect(formatProductName('Juguete transformer')).toBe('JUGUETE TRANSFORMER');
        expect(formatProductName('mario y luigi')).toBe('MARIO Y LUIGI');
        expect(formatProductName('Muñeca XYZ')).toBe('MUÑECA XYZ');
        expect(formatProductName('áéí ñandú')).toBe('ÁÉÍ ÑANDÚ');
        expect(formatProductName('pingüino')).toBe('PINGÜINO');
    });

    it('null / undefined / vacío → cadena vacía, sin error', () => {
        expect(formatProductName(null)).toBe('');
        expect(formatProductName(undefined)).toBe('');
        expect(formatProductName('')).toBe('');
    });
});

describe('formatProductDescription', () => {
    it('sentence case: primera letra en mayúscula, el resto en minúscula', () => {
        expect(formatProductDescription('MUÑECA CON ACCESORIOS PARA NIÑAS')).toBe(
            'Muñeca con accesorios para niñas',
        );
        expect(formatProductDescription('juguete de plástico RESISTENTE')).toBe(
            'Juguete de plástico resistente',
        );
        expect(formatProductDescription('muñeca CON ACCESORIOS')).toBe('Muñeca con accesorios');
    });

    it('nunca produce TitleCase', () => {
        expect(formatProductDescription('Muñeca Con Accesorios Para Niñas')).toBe(
            'Muñeca con accesorios para niñas',
        );
    });

    it('sube la inicial de cada oración, también si es acentuada o ñ', () => {
        expect(formatProductDescription('incluye pilas. ÁRBOL de navidad! ¿sirve? sí')).toBe(
            'Incluye pilas. Árbol de navidad! ¿Sirve? Sí',
        );
        expect(formatProductDescription('ñandú de 2.5 cm')).toBe('Ñandú de 2.5 cm');
    });

    it('null / undefined / vacío → cadena vacía, sin error', () => {
        expect(formatProductDescription(null)).toBe('');
        expect(formatProductDescription(undefined)).toBe('');
        expect(formatProductDescription('')).toBe('');
    });
});

describe('pipes productName / productDescription', () => {
    it('delegan en las mismas funciones', () => {
        expect(new ProductNamePipe().transform('mario y luigi')).toBe(formatProductName('mario y luigi'));
        expect(new ProductNamePipe().transform(null)).toBe('');
        expect(new ProductDescriptionPipe().transform('JUGUETE RESISTENTE')).toBe(
            formatProductDescription('JUGUETE RESISTENTE'),
        );
    });
});
