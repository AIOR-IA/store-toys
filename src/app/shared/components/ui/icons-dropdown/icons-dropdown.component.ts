import {
    Component,
    effect,
    OnInit,
    output,
    signal,
    computed,
    Input,
    OnChanges,
    SimpleChanges,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-icons-dropdown',
    standalone: true,
    imports: [
        CommonModule,
        DropdownModule,
        FormsModule,
        TranslateModule,
        ButtonModule,
    ],
    templateUrl: './icons-dropdown.component.html',
    styleUrls: ['./icons-dropdown.component.scss'],
})
export class IconsDropdownComponent implements OnInit, OnChanges {
    // Todos los íconos solid, regular y brands
    freeIcons = signal<
        Array<{ label: string; value: string; search?: { terms: string[] } }>
    >([]);
    // Estado de paginación
    page = signal(1);
    pageSize = signal(100); // Cambia el tamaño de página según lo que necesites

    // Signal computado para los íconos de la página actual
    pagedIcons = computed(() => {
        const all = this.freeIcons();
        const start = (this.page() - 1) * this.pageSize();
        const result = all.slice(start, start + this.pageSize());
        const selectedIcon = this.selectedIconObject();

        let exists = true;
        if (selectedIcon) {
            exists = !!result.find((icon) => icon.value === selectedIcon.value);
        }

        // Si hay un icono seleccionado y no está en la página actual, agregarlo al principio
        if (selectedIcon && !exists) {
            result.unshift(selectedIcon);
        }

        return result;
    });

    @Input() selectedIcon!: string;
    @Input() required: boolean = false;
    selectedIconObject = signal<any>(null);
    onChange = output<any>();

    editMode = signal<boolean>(false);

    constructor(private http: HttpClient) {}

    ngOnInit(): void {
        this.loadIcons();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['selectedIcon'] && this.selectedIcon) {
            this.setViewMode();
            this.setSelectedIcon();
        }
    }

    setViewMode() {
        this.editMode.set(!this.selectedIcon);
    }

    setSelectedIcon() {
        const found = this.freeIcons().find(
            (icon) => icon.value === this.selectedIcon
        );
        this.selectedIconObject.set(found || null);
    }

    loadIcons() {
        this.http
            .get<Record<string, any>>('assets/icons/icons_translated.json')
            .subscribe({
                next: (iconsDataRaw) => {
                    function isIconData(obj: unknown): obj is {
                        styles: string[];
                        search?: { terms: string[] };
                        label: string;
                    } {
                        return (
                            typeof obj === 'object' &&
                            obj !== null &&
                            Array.isArray((obj as any).styles)
                        );
                    }

                    const iconsData =
                        typeof iconsDataRaw === 'object' &&
                        iconsDataRaw !== null
                            ? (iconsDataRaw as Record<string, unknown>)
                            : {};

                    // Filtra solo los iconos que tienen 'solid', 'regular' o 'brands' en styles
                    const icons = Object.entries(iconsData)
                        .filter(
                            ([_, data]) =>
                                isIconData(data) &&
                                (data.styles.includes('solid') ||
                                    data.styles.includes('regular') ||
                                    data.styles.includes('brands'))
                        )
                        .map(([name, data]) => {
                            const iconData = data as {
                                styles: string[];
                                search?: { terms: string[] };
                                label: string;
                            };
                            const styles = iconData.styles;
                            // Prioridad: solid > regular > brands
                            let style = 'fas';
                            if (styles.includes('solid')) {
                                style = 'fas';
                            } else if (styles.includes('regular')) {
                                style = 'far';
                            } else if (styles.includes('brands')) {
                                style = 'fab';
                            }

                            // Usar el label del JSON en lugar del name (clave del objeto)
                            const label =
                                iconData.label ||
                                name
                                    .replace(/-/g, ' ')
                                    .replace(/\b\w/g, (l) => l.toUpperCase());

                            return {
                                label,
                                value: `${style} fa-${name}`,
                                search: iconData.search,
                            };
                        });

                    // Actualiza el signal con los íconos filtrados
                    this.freeIcons.set(icons);
                },
                error: (err) => {
                    console.error('Error loading icons.json:', err);
                },
            });
    }

    // Métodos para cambiar de página
    nextPage() {
        const totalPages = Math.ceil(this.freeIcons().length / this.pageSize());
        if (this.page() < totalPages) {
            this.page.set(this.page() + 1);
        }
    }

    prevPage() {
        if (this.page() > 1) {
            this.page.set(this.page() - 1);
        }
    }

    setPageSize(size: number) {
        this.pageSize.set(size);
        this.page.set(1); // Reinicia a la primera página
    }

    _onChange(event: any) {
        this.onChange.emit(event);
    }

    _onFilter(event: any) {
        this.pagedIcons = computed(() => {
            const all = this.freeIcons().filter(
                (i) =>
                    i.label
                        .toLowerCase()
                        .includes(event.filter.toLowerCase()) ||
                    (i.search?.terms &&
                        i.search.terms.some((term: string) =>
                            term
                                .toLowerCase()
                                .includes(event.filter.toLowerCase())
                        ))
            );
            const start = (this.page() - 1) * this.pageSize();
            return all.slice(start, start + this.pageSize());
        });
    }
}
