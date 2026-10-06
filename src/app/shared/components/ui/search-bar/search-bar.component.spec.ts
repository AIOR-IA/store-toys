import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { SearchBarComponent } from './search-bar.component';

@Component({
    standalone: true,
    imports: [SearchBarComponent],
    template: `<app-search-bar [selectOnSearch]="selectOnSearch" (onSearch)="searches.push($event)"></app-search-bar>`,
})
class HostComponent {
    selectOnSearch = false;
    searches: string[] = [];
}

describe('SearchBarComponent — selección tras buscar', () => {
    let fixture: ComponentFixture<HostComponent>;
    let host: HostComponent;

    const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
    const enter = () => {
        input().dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
        fixture.detectChanges();
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [HostComponent, TranslateModule.forRoot()],
            providers: [provideNoopAnimations()],
        }).compileComponents();
        fixture = TestBed.createComponent(HostComponent);
        host = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('con selectOnSearch, Enter emite la búsqueda y deja el texto seleccionado', () => {
        host.selectOnSearch = true;
        fixture.detectChanges();
        input().value = 'GC100-001';
        input().dispatchEvent(new Event('input'));
        enter();
        expect(host.searches).toEqual(['GC100-001']);
        expect(input().selectionStart).toBe(0);
        expect(input().selectionEnd).toBe('GC100-001'.length);
    });

    it('sin selectOnSearch, Enter no toca la selección (otras búsquedas no cambian)', () => {
        input().value = 'ABC';
        input().dispatchEvent(new Event('input'));
        input().setSelectionRange(1, 1);
        enter();
        expect(host.searches).toEqual(['ABC']);
        expect(input().selectionStart).toBe(1);
        expect(input().selectionEnd).toBe(1);
    });
});
