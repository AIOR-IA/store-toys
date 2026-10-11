import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProductImageComponent } from './product-image.component';

/**
 * Miniatura de producto con placeholder (imagen ya opcional): con `imageUrl`
 * se comporta igual que antes; sin ella, nunca enlaza `[src]` a `undefined`
 * (eso dispara una petición real a la URL `"undefined"`) ni abre el visor.
 */
@Component({
    standalone: true,
    imports: [ProductImageComponent],
    template: `
        <app-product-image
            [src]="src()"
            sizeClass="w-10 h-10"
            [showLabel]="showLabel()"
            (viewRequested)="requested.push($event)"
        ></app-product-image>
    `,
})
class HostComponent {
    src = signal<string | null | undefined>(null);
    showLabel = signal(false);
    requested: string[] = [];
}

describe('ProductImageComponent', () => {
    let fixture: ComponentFixture<HostComponent>;
    let host: HostComponent;

    const img = () => fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    const placeholder = () => fixture.nativeElement.querySelector('[title]') as HTMLElement | null;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [HostComponent, TranslateModule.forRoot()],
        }).compileComponents();
        fixture = TestBed.createComponent(HostComponent);
        host = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('K) con imageUrl muestra un <img> normal con ese src', () => {
        host.src.set('https://cdn.example/p1.webp');
        fixture.detectChanges();
        expect(img()?.src).toContain('https://cdn.example/p1.webp');
        expect(placeholder()).toBeNull();
    });

    it('L) sin imageUrl muestra el placeholder, nunca un <img>', () => {
        host.src.set(undefined);
        fixture.detectChanges();
        expect(img()).toBeNull();
        expect(placeholder()).not.toBeNull();
        expect(placeholder()!.querySelector('i.fa-image')).not.toBeNull();
    });

    it('con imageUrl null (histórico) también muestra el placeholder, no un <img> roto', () => {
        host.src.set(null);
        fixture.detectChanges();
        expect(img()).toBeNull();
        expect(placeholder()).not.toBeNull();
    });

    it('M) el placeholder no es clicable: no emite viewRequested', () => {
        host.src.set(undefined);
        fixture.detectChanges();
        placeholder()!.click();
        expect(host.requested.length).toBe(0);
    });

    it('con imagen, el click SÍ emite viewRequested con esa URL', () => {
        host.src.set('https://cdn.example/p2.webp');
        fixture.detectChanges();
        img()!.click();
        expect(host.requested).toEqual(['https://cdn.example/p2.webp']);
    });

    it('el texto "Sin imagen" solo aparece cuando showLabel es true', () => {
        host.src.set(undefined);
        host.showLabel.set(false);
        fixture.detectChanges();
        expect(placeholder()!.textContent?.trim()).toBe('');

        host.showLabel.set(true);
        fixture.detectChanges();
        expect(placeholder()!.textContent).toContain('app.products.form.noImage');
    });
});
