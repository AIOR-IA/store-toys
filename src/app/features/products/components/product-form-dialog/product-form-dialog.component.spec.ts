import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ImageCompressorService, ToastService } from '@core/services';
import { SessionService } from '@core/session';
import { ProductsService } from '../../products.service';
import { Product } from '../../product.model';
import { ProductFormDialogComponent } from './product-form-dialog.component';

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

    const photo = () => new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const flush = () => new Promise((resolve) => setTimeout(resolve));

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
