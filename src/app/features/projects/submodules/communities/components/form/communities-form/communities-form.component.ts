import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { BaseFormComponent } from '@shared/components';
import { Validators } from '@angular/forms';
import { ICommunity } from '../../../models';
import { CommunityService, CommunityStateService } from '../../../services';
import { LatitudeValidator, LongitudeValidator, NormalizeTextValidator, trimmedRequiredValidator } from '@shared/form-validators';
import { CartographicService } from '@core/services';
import { catchError, debounceTime, distinctUntilChanged, of, Subject } from 'rxjs';
import { ICartographicCommunity, IDepartment, IMunicipality, IStreet } from '@core/models';
import { ActivatedRoute } from '@angular/router';
import { AfterViewInit, NgZone, ViewChild } from '@angular/core';
@Component({
    selector: 'app-communities-form',
    templateUrl: './communities-form.component.html',
    styleUrl: './communities-form.component.scss',
})
export class CommunityFormComponent extends BaseFormComponent<ICommunity> implements OnInit, AfterViewInit {
    override service = inject(CommunityService);
    override state = inject(CommunityStateService);
    cartoService = inject(CartographicService);
    private route = inject(ActivatedRoute);

    community = signal<ICommunity[]>([]);
    entitiesSubject = new Subject<{
        query: string;
        id: number | undefined;
        type: string;
    }>();
    // departments = computed(() => [] as IDepartment[]);
    // municipalities = computed(() => [] as IMunicipality[]);
    departments = signal<IDepartment[]>([]);
    municipalities = signal<IMunicipality[]>([]);

    currentDep = signal<IDepartment | null>(null);
    currentMun = signal<IMunicipality | null>(null);
    municipalitiesSubject = new Subject<{ query: string; depId?: number }>();


    // currentDep = computed<IDepartment | undefined>(() => undefined);
    // currentMun = computed<IMunicipality | undefined>(() => undefined);

    activeIndex = signal(0);
    selectedBounds = signal<any>(null);
    selectedZoom = signal<number>(10);
    showMarker = signal<boolean>(false);
    markerPosition = signal<{ latitude: number; longitude: number } | null>(null);
    @ViewChild('latIN', { static: false }) latIN!: any;
    @ViewChild('lngIN', { static: false }) lngIN!: any;

    private zone = inject(NgZone);

    constructor() {
        super();
        this.initEvents();
        this.loadDepartments();

        effect(
            () => {
                setTimeout(() => {
                    const lat = this.form?.get('latitude')?.value;
                    const lng = this.form?.get('longitude')?.value;

                    this.showMarker.set(!!(lat && lng));

                    if (lat && lng) {
                        const polygon = {
                            type: 'Point',
                            coordinates: [lng, lat],
                        };

                        this.selectedBounds.set(polygon);
                        this.selectedZoom.set(18);
                    }
                }, 300);
            },
            { allowSignalWrites: true }
        );
    }

    ngAfterViewInit(): void {
        this.attachPasteHandler(this.latIN, 'latitude');
        this.attachPasteHandler(this.lngIN, 'longitude');
    }

    override ngOnInit(): void {
        super.ngOnInit?.();

        this.form.get('latitude')?.valueChanges
            .pipe(debounceTime(250), distinctUntilChanged())
            .subscribe(() => this.syncMarkerFromForm());

        this.form.get('longitude')?.valueChanges
            .pipe(debounceTime(250), distinctUntilChanged())
            .subscribe(() => this.syncMarkerFromForm());

        setTimeout(() => this.syncMarkerFromForm(true), 0);
    }

    public syncMarkerFromForm(forceZoom = false) {
        const lat = this.parseCoord(this.form.get('latitude')?.value);
        const lng = this.parseCoord(this.form.get('longitude')?.value);

        const valid = lat !== null && lng !== null;
        this.showMarker.set(valid);

        if (!valid) return;

        this.markerPosition.set({ latitude: lat!, longitude: lng! });

        if (forceZoom) this.selectedZoom.set(15);
    }

    override buildForm(): void {
        let current = {} as ICommunity;
        if (this.state.current && (this.isUpdateMode || this.isViewMode)) {
            current = this.state.current;
            this.preloadMunicipality(current);
        }

        this.form = this._fb.group({
            id: [current.id],
            name: [
                current.name,
                [
                    Validators.required,
                ],
            ],
            cod_mun: [current.cod_mun, []],
            department: [current.department, [Validators.required]],
            province: [current.province],
            municipality: [current.municipality, [Validators.required]],
            latitude: [current.latitude, [LatitudeValidator, Validators.required]],
            longitude: [current.longitude, [LongitudeValidator, Validators.required]],
            enabled: [this.isCreateMode ? true : !!current.enabled]
        });

        if (current?.latitude && current?.longitude) {
            // this.loadLatLongInfo(current.latitude, current.longitude);
            this.showMarker.set(true);
            this.markerPosition.set({ latitude: current.latitude, longitude: current.longitude });
            this.selectedZoom.set(16);
        }

        if (this.isViewMode) {
            this.form.disable();
        }
    }

    initEvents() {
        this.entitiesSubject
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe(({ query, id, type }) => {
                this.service
                    .findAll({
                        query,
                        perPage: 50,
                        sort: 'name',
                        order: 'asc',
                        filter: JSON.stringify({ excludeId: id, type: type }),
                    })
                    .subscribe((result) => {

                        this.community.set(result.data);
                    });
            });

        this.municipalitiesSubject
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe(({ query, depId }) => {
                this.loadMunicipalities(query, depId);
            });
    }

    filterEntities(event: any) {
        const query = event.filter;
        const id = this.state.current?.id;
        this.entitiesSubject.next({ query, id, type: '' });
    }


    loadDepartments(query: string = '') {
        this.cartoService.findDepartments(query).subscribe((result) => {
            this.departments.set(result);
        });
    }

    onSelectDepartment(event: any) {
        const found = this.departments().find(
            (d) => d.departamento === event.value
        );

        this.currentDep.set(found ?? null);
        this.currentMun.set(null);
        this.municipalities.set([]);

        this.form.patchValue({
            municipality: null,
            province: null,
            cod_mun: null,

            latitude: null,
            longitude: null,
        }, { emitEvent: false });

        this.showMarker.set(false);
        this.markerPosition.set(null);

        if (!found) {
            this.selectedBounds.set(null);
            return;
        }

        this.loadMunicipalities('', found.id);

        this.focusMapByBbox(found.bbox, 7);
    }

    loadMunicipalities(query: string = '', depId?: number) {
        this.cartoService
            .findMunicipalities(query, depId)
            .subscribe((result) => {
                this.municipalities.set(result);
            });
    }


    onSelectMunicipality(event: any) {
        const found = this.municipalities().find(
            (m) => m.municipio === event.value
        );

        this.currentMun.set(found ?? null);

        if (!found) return;

        this.form.patchValue({
            municipality: found.municipio,
            province: found.provincia,

            // También limpiamos coordenadas anteriores
            latitude: null,
            longitude: null,
        }, { emitEvent: false });

        this.showMarker.set(false);
        this.markerPosition.set(null);

        this.focusMapByBbox(found.bbox, 11);
    }

    filterMunicipalities(event: any) {
        const query = event.filter;
        const depId = this.currentDep()?.id;
        this.municipalitiesSubject.next({ query, depId });
    }

    eventDragend(event: any) {
        const lat = Math.round(event.latitude * 1000000) / 1000000;
        const lng = Math.round(event.longitude * 1000000) / 1000000;

        this.form.patchValue(
            { latitude: lat, longitude: lng },
            { emitEvent: false }
        );

        this.showMarker.set(true);
        this.markerPosition.set({ latitude: lat, longitude: lng });
    }

    override onSubmit(): void {
        if (this.form.invalid) {
            this.totast.error('app.common.errors.invalidForm');
            return;
        }

        const postData = this.form.value;
        const isUpdate = !!postData?.id;

        if (isUpdate) {
            super.onSubmit(() => {
                if (this._redirectAfterUpdate()) {
                    this.router.navigate([`/admin/projects/communities/${this.projectUuid}/list`]);
                }
            });
            return;
        }

        if (!this.projectId || Number.isNaN(this.projectId)) {
            this.totast.error('app.common.errors.invalidForm');
            return;
        }

        const { id, ...dto } = postData;

        this.saving.set(true);

        this.service.createInProject(this.projectId, dto)
            .pipe(
                catchError((error) => {
                    this.totast.error('app.common.messages.notCreated');
                    this.saving.set(false);
                    return of(null);
                })
            )
            .subscribe((response) => {
                if (!response) return;

                this.totast.success('app.common.messages.created');
                this.onSaved.emit(response as ICommunity);

                if (this._redirectAfterCreate()) {
                    this.router.navigate([`/admin/projects/communities/${this.projectUuid}/list`]);
                }

                this.saving.set(false);
            });
    }

    private get projectId() {
        return Number(this.route.snapshot.paramMap.get('id'));
    }

    private get projectUuid() {
        return this.route.snapshot.paramMap.get('uuid')!;
    }

    private parseCoord(value: unknown): number | null {
        if (value === null || value === undefined) return null;

        const coordinates = String(value).trim();

        if (!coordinates.length) return null;

        const n = Number(coordinates.replace(',', '.'));

        return Number.isFinite(n) ? n : null;
    }

    private attachPasteHandler(comp: any, field: 'latitude' | 'longitude') {
        const inputEl: HTMLInputElement | null =
            (comp?.el?.nativeElement?.querySelector?.('input') as HTMLInputElement) ??
            (comp?.input?.nativeElement as HTMLInputElement) ??
            null;

        if (!inputEl) return;

        inputEl.addEventListener('paste', (ev: ClipboardEvent) => {
            const text = ev.clipboardData?.getData('text') ?? '';
            if (!text) return;

            ev.preventDefault();

            const cleaned = text
                .trim()
                .replace(/\s+/g, ' ')
                .replace(/[°,\u00B0]/g, '')
                .replace(/[()]/g, '');

            const nums = cleaned
                .split(/[ ,]+/)
                .filter(Boolean)
                .map((p) => Number(p.replace(',', '.')))
                .filter((n) => Number.isFinite(n));

            if (!nums.length) return;

            this.zone.run(() => {
                if (nums.length >= 2) {
                    const [lat, lng] = nums;

                    this.form.patchValue({ latitude: lat, longitude: lng });
                } else {
                    this.form.get(field)?.setValue(nums[0]);
                }

                this.syncMarkerFromForm(true);
            });
        });
    }

    private preloadMunicipality(current: ICommunity) {
        const dep = this.departments().find(d => d.departamento === current.department);

        if (!dep) return;

        this.cartoService.findMunicipalities('', dep.id).subscribe((munis) => {
            this.municipalities.set(munis);

            const found = munis.find(m => m.municipio === current.municipality);

            if (found) {
                this.form.patchValue({
                    municipality: found.municipio,
                    province: current.province ?? found.provincia,
                });
            }
        });
    }

    private focusMapByBbox(bbox: string | any, zoom: number) {
        if (!bbox) return;

        const parsed = typeof bbox === 'string'
            ? JSON.parse(bbox)
            : bbox;

        this.selectedBounds.set(null);

        setTimeout(() => {
            this.selectedZoom.set(zoom);
            this.selectedBounds.set(parsed);
        }, 0);
    }
}
