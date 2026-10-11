import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ImageCompressorService, ToastService } from '@core/services';
import { SessionService } from '@core/session';
import { ProductsService } from '../../products.service';
import { Product } from '../../product.model';
import { ProductFormDialogComponent } from './product-form-dialog.component';

const photo = () => new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
const flush = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Imagen del producto: "Tomar foto" (archivo) y "Usar cámara" entran por el MISMO
 * `processImage` (compresión → pendingImage → preview). Cancelar en la cámara no
 * toca la imagen que ya tenía el formulario.
 */
describe('ProductFormDialogComponent — imagen', () => {
    const remoteUrl = 'https://firebasestorage.example/products/p1/old.webp';
    const existing = {
        id: 'p1',
        name: 'Pelota',
        description: '',
        priceCents: 1000,
        stock: 3,
        code: '7791234567890',
        imageUrl: remoteUrl,
        imagePath: 'products/p1/old.webp',
        isActive: true,
    } as unknown as Product;

    let fixture: ComponentFixture<ProductFormDialogComponent>;
    let component: ProductFormDialogComponent;
    let compressProductImage: jasmine.Spy;
    let revoke: jasmine.Spy;

    beforeEach(async () => {
        compressProductImage = jasmine
            .createSpy('compressProductImage')
            .and.callFake(async () => new Blob(['webp'], { type: 'image/webp' }));
        revoke = spyOn(URL, 'revokeObjectURL');
        spyOn(URL, 'createObjectURL').and.returnValue('blob:nueva');

        await TestBed.configureTestingModule({
            imports: [ProductFormDialogComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                { provide: ProductsService, useValue: { generateInternalCode: () => of('MP000001') } },
                { provide: ImageCompressorService, useValue: { compressProductImage } },
                { provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
                { provide: SessionService, useValue: { session: signal({ status: 'active', role: 'admin' }) } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ProductFormDialogComponent);
        component = fixture.componentInstance;
    });

    it('usa la misma compresión y preview para archivo y cámara', async () => {
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();

        component.onCameraCaptured(photo());
        await flush();

        expect(compressProductImage).toHaveBeenCalledOnceWith(jasmine.any(File));
        expect(component.pendingImage()).toBeInstanceOf(Blob);
        expect(component.imagePreviewUrl()).toBe('blob:nueva');
    });

    it('"Tomar foto" (archivo) sigue usando el mismo pipeline', async () => {
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        const input = { files: [photo()], value: 'C:\\fakepath\\foto.jpg' } as unknown as HTMLInputElement;

        await component.onImageSelected({ target: input } as unknown as Event);

        expect(compressProductImage).toHaveBeenCalledTimes(1);
        expect(component.pendingImage()).toBeInstanceOf(Blob);
        expect(input.value).toBe('');
    });

    it('K) con imagen existente, Usar foto reemplaza el preview y pendingImage', async () => {
        fixture.componentRef.setInput('visible', true);
        fixture.componentRef.setInput('product', existing);
        fixture.detectChanges();
        expect(component.imagePreviewUrl()).toBe(remoteUrl);

        component.openCamera();
        component.onCameraCaptured(photo());
        await flush();

        expect(component.imagePreviewUrl()).toBe('blob:nueva');
        expect(component.pendingImage()).toBeInstanceOf(Blob);
    });

    it('J) con imagen existente, cancelar la cámara conserva la imagen anterior', () => {
        fixture.componentRef.setInput('visible', true);
        fixture.componentRef.setInput('product', existing);
        fixture.detectChanges();

        component.openCamera();
        component.cameraVisible.set(false); // Cancelar: no llega ninguna foto

        expect(component.imagePreviewUrl()).toBe(remoteUrl);
        expect(component.pendingImage()).toBeNull();
        expect(compressProductImage).not.toHaveBeenCalled();
    });

    it('L) mientras procesa, una segunda foto no inicia otra compresión', async () => {
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        let finish!: () => void;
        compressProductImage.and.returnValue(new Promise<Blob>((resolve) => (finish = () => resolve(new Blob(['x'])))));

        component.onCameraCaptured(photo());
        component.onCameraCaptured(photo());
        expect(compressProductImage).toHaveBeenCalledTimes(1);
        finish();
        await flush();
        expect(component.compressingImage()).toBeFalse();
    });

    it('al reemplazar, revoca la URL de objeto anterior creada por esta vista', async () => {
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        (URL.createObjectURL as jasmine.Spy).and.returnValues('blob:primera', 'blob:segunda');

        component.onCameraCaptured(photo());
        await flush();
        component.onCameraCaptured(photo());
        await flush();

        expect(revoke).toHaveBeenCalledWith('blob:primera');
        expect(component.imagePreviewUrl()).toBe('blob:segunda');
    });

    it('al destruir el formulario revoca la URL de su vista previa', async () => {
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        component.onCameraCaptured(photo());
        await flush();

        fixture.destroy();

        expect(revoke).toHaveBeenCalledWith('blob:nueva');
    });

    it('nunca revoca la URL remota de Storage', () => {
        fixture.componentRef.setInput('visible', true);
        fixture.componentRef.setInput('product', existing);
        fixture.detectChanges();

        fixture.destroy();

        expect(revoke).not.toHaveBeenCalledWith(remoteUrl);
    });
});

/**
 * Imagen opcional (ajuste posterior a la Fase 3, a pedido del cliente): el
 * alta ya no exige foto. Si el vendedor SÍ elige una y la subida falla, el
 * alta entera debe fallar — nunca guardar el producto en silencio sin ella.
 */
describe('ProductFormDialogComponent — imagen opcional', () => {
    const withImage = {
        id: 'p1',
        name: 'Pelota',
        priceCents: 1000,
        stock: 3,
        code: '7791234567890',
        imageUrl: 'https://firebasestorage.example/products/p1/old.webp',
        imagePath: 'products/p1/old.webp',
        isActive: true,
    } as unknown as Product;

    // Histórico/nuevo sin foto: sin `imageUrl` ni `imagePath`, no con strings vacíos.
    const withoutImage = {
        id: 'p2',
        name: 'Carrito',
        priceCents: 2000,
        stock: 1,
        code: '7799999999999',
        isActive: true,
    } as unknown as Product;

    let fixture: ComponentFixture<ProductFormDialogComponent>;
    let component: ProductFormDialogComponent;
    let createProduct: jasmine.Spy;
    let updateProduct: jasmine.Spy;
    let replaceImage: jasmine.Spy;
    let toastError: jasmine.Spy;

    beforeEach(async () => {
        createProduct = jasmine.createSpy('createProduct').and.returnValue(of({ productId: 'new-1' }));
        updateProduct = jasmine.createSpy('updateProduct').and.returnValue(of(undefined));
        replaceImage = jasmine
            .createSpy('replaceImage')
            .and.resolveTo({ imageUrl: 'blob-remote', imagePath: 'products/p1/new.webp' });
        toastError = jasmine.createSpy('error');

        await TestBed.configureTestingModule({
            imports: [ProductFormDialogComponent, TranslateModule.forRoot()],
            providers: [
                provideNoopAnimations(),
                {
                    provide: ProductsService,
                    useValue: { createProduct, updateProduct, replaceImage, generateInternalCode: () => of('MP000001') },
                },
                {
                    provide: ImageCompressorService,
                    useValue: {
                        compressProductImage: jasmine
                            .createSpy('compressProductImage')
                            .and.resolveTo(new Blob(['x'], { type: 'image/webp' })),
                    },
                },
                { provide: ToastService, useValue: { error: toastError, success: jasmine.createSpy('success') } },
                { provide: SessionService, useValue: { session: signal({ status: 'active', role: 'admin' }) } },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ProductFormDialogComponent);
        component = fixture.componentInstance;
    });

    function openCreate(): void {
        fixture.componentRef.setInput('visible', true);
        fixture.detectChanges();
        component.form.patchValue({ name: 'Juguete X', priceBs: 100, stock: 5 });
        component.resolvedCode.set({ code: '7791234567890', codeSource: 'manufacturer' });
    }

    function openEdit(product: Product): void {
        fixture.componentRef.setInput('visible', true);
        fixture.componentRef.setInput('product', product);
        fixture.detectChanges();
    }

    it('sin imagen, el formulario muestra el placeholder "Sin imagen", nunca un <img>', () => {
        openCreate();
        const host = (fixture.nativeElement as HTMLElement).querySelector('app-product-image')!;
        expect(host.querySelector('img')).toBeNull();
        expect(host.textContent).toContain('app.products.form.noImage');
    });

    it('A) crear sin imagen: success, sin bloqueo por imagen', () => {
        openCreate();
        component.submit();
        expect(createProduct).toHaveBeenCalledTimes(1);
        expect(toastError).not.toHaveBeenCalledWith('app.products.messages.imageRequired');
    });

    it('B) sin imagen, createProduct recibe null — el servicio decide no tocar Storage', () => {
        openCreate();
        component.submit();
        expect(createProduct.calls.mostRecent().args[1]).toBeNull();
    });

    it('C) sin imagen, el payload del producto no inventa un string vacío de imagen', () => {
        openCreate();
        component.submit();
        const input = createProduct.calls.mostRecent().args[0];
        expect(input.imageUrl).toBeUndefined();
        expect(input.imagePath).toBeUndefined();
    });

    it('D) "Guardar y cargar otro" sin imagen: success y el formulario queda listo para el siguiente alta', () => {
        openCreate();
        component.submit();
        expect(component.imagePreviewUrl()).toBeNull();
        expect(component.pendingImage()).toBeNull();
        expect(component.resolvedCode()).toBeNull();
    });

    it('E) con imagen elegida, createProduct recibe el Blob comprimido', async () => {
        openCreate();
        component.onCameraCaptured(photo());
        await flush();

        component.submit();

        expect(createProduct.calls.mostRecent().args[1]).toBeInstanceOf(Blob);
    });

    it('F) imagen elegida + falla la creación (Storage u otra etapa): NO guarda el producto en silencio', async () => {
        createProduct.and.returnValue(throwError(() => new Error('storage/unauthorized')));
        openCreate();
        component.onCameraCaptured(photo());
        await flush();

        component.submit();

        expect(toastError).toHaveBeenCalledWith('app.common.errors.general');
        // Sigue ahí: si se hubiera "guardado igual sin foto", se habría limpiado al reiniciar el formulario.
        expect(component.pendingImage()).toBeInstanceOf(Blob);
    });

    it('G) editar producto sin imagen, cambiar solo texto: success sin tocar Storage', () => {
        openEdit(withoutImage);
        component.form.patchValue({ name: 'Carrito rojo' });

        component.submit();

        expect(replaceImage).not.toHaveBeenCalled();
        expect(updateProduct).toHaveBeenCalledOnceWith('p2', jasmine.objectContaining({ name: 'Carrito rojo' }));
        expect(updateProduct.calls.mostRecent().args[1].imageUrl).toBeUndefined();
    });

    it('H) editar producto sin imagen, añadir una: sube y actualiza con la nueva URL', async () => {
        openEdit(withoutImage);
        component.onCameraCaptured(photo());
        await flush();

        component.submit();
        await flush();

        expect(replaceImage).toHaveBeenCalledWith('p2', jasmine.any(Blob), undefined);
        expect(updateProduct.calls.mostRecent().args[1].imageUrl).toBe('blob-remote');
    });

    it('I) editar producto CON imagen sin tocarla: no llama replaceImage, conserva la existente', () => {
        openEdit(withImage);
        component.form.patchValue({ stock: 9 });

        component.submit();

        expect(replaceImage).not.toHaveBeenCalled();
        // No reenvía imageUrl: al no incluirse en el payload, Firestore conserva la que ya tenía.
        expect(updateProduct.calls.mostRecent().args[1].imageUrl).toBeUndefined();
    });

    it('J) editar producto CON imagen y reemplazarla: mismo flujo de reemplazo de siempre', async () => {
        openEdit(withImage);
        component.onCameraCaptured(photo());
        await flush();

        component.submit();
        await flush();

        expect(replaceImage).toHaveBeenCalledWith('p1', jasmine.any(Blob), 'products/p1/old.webp');
    });
});
