import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    Component,
    ElementRef,
    Input,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ViewChild,
    inject,
    input,
    model,
    output,
    signal,
    effect,
} from '@angular/core';
import * as L from 'leaflet';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import 'leaflet-draw';

interface Location {
    latitude: number;
    longitude: number;
}

interface WmsLayerConfig {
    url: string;
    layer: string;
    sld?: string;
    cql?: string;
    contentLegend?: string;
    label?: string;
}

export type CommunityMarker = {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    isEcofam?: boolean;
};

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [CommonModule, DialogModule, TooltipModule],
    providers: [],
    templateUrl: './map.component.html',
    styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit, OnChanges, OnDestroy {
    private map!: L.Map;
    public baseMaps: { [key: string]: L.TileLayer } = {};
    public layerControl: L.Control.Layers | null = null;
    currentCenter = input<Location>({ latitude: -17.0, longitude: -64.159 });
    onMarkedEditEventDragend = output<{
        latitude: number;
        longitude: number;
    }>();
    fitBounds = input<any>(null);
    zoomLevel = input<number>(5);
    showMarker = input<boolean>(true);
    draggableMarker = input<boolean>(true);

    wmsPreviewUrl = input<string>('');
    wmsPreviewLayer = input<string>('');
    wmsPreviewSld = input<string>('');
    wmsPreviewCql = input<string>('');
    contentLegend = input<string>('');
    colorLegend = input<string>('');
    geojson = input();
    private layerWmsPreview: any;
    @Input() wmsLayers: WmsLayerConfig[] = [];
    currentBaseLayer: any;
    baseLayer = input<string>('');

    draw = input<boolean>(false);
    geomDraw = input<any | null>(null);
    onDraw = output<any>();
    markerPosition = input<Location | null>(null);


    private marker = L.marker([0, 0], {
        draggable: true,
        icon: L.icon({
            iconUrl: '../../../../assets/layout/icon/marker-icon2.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
        }),
    }).bindPopup('');

    legend: any;
    private legendContainer!: HTMLDivElement;
    divLegend: any;
    ctrlLegend = input<boolean>(false);
    popupVisible = model<boolean>(false);
    popupContent = signal<string>('');

    @ViewChild('mapContainer', { static: true })
    mapContainer!: ElementRef<HTMLDivElement>;

    private drawButtonControl!: L.Control;
    showDataTable = signal(false);
    displayAttributeTable = input<boolean>(false);

    //Statistics
    statisticsSetup = input<{
        title: string;
        columns: any[];
    } | null>(null);
    showStatistics = signal(false);


    // markers
    markersMode = input<'single' | 'multi'>('single');
    markers = input<CommunityMarker[]>([]);
    private markersLayer = L.layerGroup();
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['fitBounds'] && this.fitBounds()) {
            this.mapFitBounds();
        }

        if (
            changes['zoomLevel'] &&
            changes['zoomLevel'].currentValue !==
            changes['zoomLevel'].previousValue &&
            this.map
        ) {
            this.map.setZoom(this.zoomLevel());
        }

        if (
            changes['wmsPreviewLayer'] ||
            changes['wmsPreviewSld'] ||
            changes['wmsPreviewCql']
        ) {
            if (!this.wmsPreviewUrl() || !this.wmsPreviewLayer()) {
                this.showDataTable.set(false);
                this.showStatistics.set(false);
            } else {
                setTimeout(() => this.setWmsPreviewLayer(), 400);
            }
        }


        if (changes['contentLegend'] && this.contentLegend()) {
            this.updateLegend();
        }

        if (changes['wmsLayers']) {
            this.setWmsLayers();
        }

        if (changes['colorLegend'] && this.colorLegend() && this.legend) {
            this.legend.setStyle({
                backgroundColor: this.colorLegend(),
                //color: 'white',
            });
        }

        if (changes['baseLayer']) {
            this.changeBaseMap(this.baseLayer())
        }

        if ((changes['markers'] || changes['markersMode']) && this.map) {
            if (this.markersMode() === 'multi') {
                this.renderMultiMarkers(this.markers());
                if (this.map.hasLayer(this.marker)) this.map.removeLayer(this.marker);
            } else {
                this.markersLayer.clearLayers();
                if (this.showMarker() && !this.map.hasLayer(this.marker)) {
                    this.marker.addTo(this.map);
                }
            }
        }

        if (changes['markerPosition'] && this.map) {
            const pos = this.markerPosition();
            if (pos && Number.isFinite(pos.latitude) && Number.isFinite(pos.longitude)) {
                const ll = L.latLng(pos.latitude, pos.longitude);
                this.marker.setLatLng(ll);

                if (this.markersMode() === 'single' && this.showMarker() && !this.map.hasLayer(this.marker)) {
                    this.marker.addTo(this.map);
                }

                this.map.panTo(ll, { animate: true });
            }
        }
    }

    ngAfterViewInit(): void {
        setTimeout(() => {
            this.initMap();

        }, 200);
    }

    public drawnItems: L.FeatureGroup = L.featureGroup();
    public drawOptions: L.Control.DrawConstructorOptions = {
        position: 'topright',
        draw: {
            polyline: false,
            polygon: {
                showArea: true,
                showLength: true,
                shapeOptions: {
                    showArea: true,
                } as any,
            },
            rectangle: false,
            circle: false,
            //circlemarker: true,
            marker: false,
        },
        edit: {
            featureGroup: this.drawnItems,
            remove: true
        },
    };

    constructor() {
        effect(() => {
            if (!this.map) return;

            const mode = this.markersMode();
            if (mode !== 'multi') {
                // ✅ en single: limpiar capa multi y dejar que funcione lo de siempre
                this.markersLayer.clearLayers();
                return;
            }

            // ✅ en multi: pintar markers múltiples
            this.renderMultiMarkers(this.markers());

            // ✅ en multi: ocultar marker viejo si estuviera
            if (this.map.hasLayer(this.marker)) {
                this.map.removeLayer(this.marker);
            }
        });
    }

    private loadDrawGeoJson(geojson: any): void {
        if (!this.map) return;
        this.drawnItems.clearLayers();
        L.geoJSON(geojson).eachLayer((layer) => this.drawnItems.addLayer(layer));
        this.map.fitBounds(this.drawnItems.getBounds());
    }


    private initMap() {
        this.map = L.map(this.mapContainer.nativeElement).setView(
            [this.currentCenter().latitude, this.currentCenter().longitude],
            5
        );

        this.setBaseMaps();
        this.layerControl = L.control.layers(this.baseMaps).addTo(this.map);

        this.marker.options.draggable = this.draggableMarker();
        if (this.markersMode() === 'single' && this.showMarker()) {
            this.marker.addTo(this.map);
        }


        if (this.draggableMarker()) {
            this.map.on('dblclick', (event: any) => {
                if (this.markersMode() === 'multi') return;

                const newLatLng = L.latLng(event.latlng.lat, event.latlng.lng);
                this.marker.setLatLng(newLatLng);

                if (!this.map.hasLayer(this.marker)) this.marker.addTo(this.map);
                this.setSingleMarkerVisibility(true);

                this.onMarkedEditEventDragend.emit({
                    longitude: event.latlng.lng,
                    latitude: event.latlng.lat,
                });
            });
        }



        if (this.markersMode() === 'single' && this.draggableMarker()) {
            this.marker.on('dragend', (event: any) => {
                const m = event.target;
                const result = m.getLatLng();
                this.onMarkedEditEventDragend.emit({
                    longitude: result.lng,
                    latitude: result.lat,
                });
            });

            this.map.on('click', (e: L.LeafletMouseEvent) => {
                // this.getLayerData(
                //     this.wmsPreviewLayer(),
                //     e.latlng,
                //     this.map?.getZoom()
                // );
            });
        }

        this.legend = new (L.Control.extend({
            options: { position: 'topright' },
            onAdd: (map: any) => {
                const div = L.DomUtil.create('div', 'legend leaflet-control');
                this.legendContainer = div;
                // Evita que los clics en la leyenda se propaguen al mapa
                L.DomEvent.disableClickPropagation(div);
                L.DomEvent.disableScrollPropagation(div);

                div.style.maxWidth = '350px';
                div.style.padding = '8px';
                div.style.backgroundColor = 'white';
                div.style.borderRadius = '6px';
                div.style.boxShadow = '0 1px 5px rgba(0,0,0,0.65)';
                // div.style.maxHeight = '300px';
                // div.style.overflowY = 'auto';

                const headerDiv = L.DomUtil.create('div', 'legend-header', div);
                headerDiv.style.display = 'flex';
                headerDiv.style.justifyContent = 'flex-end';
                headerDiv.style.alignItems = 'center';
                headerDiv.style.marginBottom = '6px';

                const toggleButton = L.DomUtil.create('button', '', headerDiv);
                toggleButton.style.background = 'transparent';
                toggleButton.style.border = 'none';
                toggleButton.style.cursor = 'pointer';
                toggleButton.style.padding = '0';

                const iconImg = L.DomUtil.create('img', '', toggleButton);
                iconImg.src = '../../../../assets/layout/images/close.png';
                iconImg.style.height = '24px';

                const contentDiv = L.DomUtil.create(
                    'div',
                    'legend-content',
                    div
                );
                contentDiv.innerHTML = '<div></div>';
                this.divLegend = contentDiv;

                toggleButton.onclick = () => {
                    const isHidden = contentDiv.style.display === 'none';
                    contentDiv.style.display = isHidden ? 'block' : 'none';
                    iconImg.src = isHidden
                        ? '../../../../assets/layout/images/close.png'
                        : '../../../../assets/layout/images/info.png';
                };

                return div;
            },
        }))();

        this.legend.update = (data: any) => {
            this.divLegend.innerHTML = data;
        };
        this.legend.setStyle = (styles: Partial<CSSStyleDeclaration>) => {
            const container =
                this.legendContainer || (this.legend as any)?._container;
            if (container) Object.assign(container.style, styles);
        };

        this.markersLayer.addTo(this.map);

    }

    private setSingleMarkerVisibility(visible: boolean) {
        const el = (this.marker as any)._icon as HTMLElement | undefined;
        if (el) el.style.display = visible ? '' : 'none';
    }

    private renderMultiMarkers(markers: CommunityMarker[]) {
        if (!this.map) return;

        this.markersLayer.clearLayers();

        const valid = (markers ?? []).filter(m =>
            Number.isFinite(m.latitude) && Number.isFinite(m.longitude)
        );

        for (const m of valid) {
            const popup = `
      <div style="min-width:160px">
        <div style="font-weight:700">${m.name ?? 'Comunidad'}</div>
        <div style="font-size:12px;color:#6b7280">
          ECOFAM: <b>${m.isEcofam ? 'Sí' : 'No'}</b>
        </div>
      </div>
    `;

            L.marker([m.latitude, m.longitude], {
                icon: L.icon({
                    iconUrl: '../../../../assets/layout/icon/marker-icon2.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                }),
            })
                .bindPopup(popup)
                .addTo(this.markersLayer);
        }

        // auto-fit solo si hay varios
        if (valid.length > 1) {
            const bounds = L.latLngBounds(valid.map(v => [v.latitude, v.longitude] as [number, number]));
            this.map.fitBounds(bounds, { padding: [40, 40] });
        } else if (valid.length === 1) {
            this.map.setView([valid[0].latitude, valid[0].longitude], Math.max(this.zoomLevel(), 14));
        }
    }

    private mapFitBounds(): void {
        if (!this.map) return;
        if (!this.fitBounds()) return;

        const feature = this.convertToGeoJsonFeature(this.fitBounds());
        const bboxLayer = L.geoJson(feature);
        const bounds = bboxLayer.getBounds();

        if (!bounds.isValid()) return;

        const zoom = this.calculateZoom(this.zoomLevel());
        const center = bounds.getCenter();

        if (zoom && zoom > 0) {
            this.map.flyTo(center, zoom, {
                animate: true,
                duration: 0.4,
            });
        } else {
            this.map.fitBounds(bounds, {
                padding: [50, 50],
            });
        }

        if (this.showMarker()) {
            this.marker.setLatLng(center);

            if (this.markersMode() === 'single' && !this.map.hasLayer(this.marker)) {
                this.marker.addTo(this.map);
            }
        }
    }

    convertToGeoJsonFeature(parsedBBox: {
        type: string;
        coordinates: any;
    }): any {
        return {
            type: 'Feature',
            geometry: {
                type: parsedBBox.type,
                coordinates: parsedBBox.coordinates,
            },
        };
    }

    private calculateZoom(level: number) {
        if (this.map && level === 0) {
            const calculateZoom = this.getZoomFromFitBounds();
            const zoom = calculateZoom ?? level;
            return zoom;
        }

        return level;
    }

    public setWmsPreviewLayer() {
        const url = this.wmsPreviewUrl();
        const layerName = this.wmsPreviewLayer();
        const sld = this.wmsPreviewSld();
        const cql = this.wmsPreviewCql();

        const needsWmsPreview = url.length > 0 && layerName.length > 0;
        if (!needsWmsPreview) return;

        const params: any = {
            layers: layerName,
            styles: sld || '',
            format: 'image/png',
            transparent: true,
            opacity: 0.8,
            version: '1.3.0',
            fake: Date.now(), // evitar cache
            _ts: Date.now(),
        };

        if (cql && cql.trim().length > 0) {
            params.CQL_FILTER = cql.trim();
        }

        if (this.layerWmsPreview) {
            this.layerWmsPreview.setParams(params);
            this.layerWmsPreview.redraw();
        } else {
            this.layerWmsPreview = L.tileLayer.wms(url, params);
            if (this.map && !this.map.hasLayer(this.layerWmsPreview)) {
                this.layerWmsPreview.addTo(this.map);
                if (this.layerControl)
                    this.layerControl.addOverlay(
                        this.layerWmsPreview,
                        'Selección'
                    );
            }
        }

    }


    private getZoomFromFitBounds() {
        if (this.fitBounds() && this.zoomLevel() === 0) {
            const coords: any = this.fitBounds().coordinates[0];

            // Convertimos [lng, lat] → [lat, lng]
            const latLngs = coords.map(
                ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
            );

            // Creamos los bounds
            const bounds = L.latLngBounds(latLngs);

            // Obtenemos el zoom ideal para ese bounding box
            const zoom = this.map.getBoundsZoom(bounds);
            return zoom;
        }

        return null;
    }

    private updateLegend() {
        if (this.legend) this.legend.update(this.contentLegend());
    }

    private setBaseMaps() {
        this.baseMaps = {
            Base: L.tileLayer(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                {
                    attribution: '&copy; OpenStreetMap contributors',
                    maxZoom: 30,
                }
            ),
            'Google Streets': L.tileLayer(
                'http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
                {
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                }
            ),
            Hibrido: L.tileLayer(
                'http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                }
            ),
            'CARTO dark': L.tileLayer(
                'http://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
            ),
            'ESRI Topo': L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
            ),
            'ESRI Hillshade': L.tileLayer(
                'http://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'
            ),
            'ESRI SATELITAL': L.tileLayer(
                'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ),
        };

        this.baseMaps['Base'].addTo(this.map);
        this.currentBaseLayer = this.baseMaps['Base'];


    }

    changeBaseMap(type: string) {
        setTimeout(() => {
            if (!this.map) return;
            this.map.removeLayer(this.currentBaseLayer);
            this.currentBaseLayer = this.baseMaps[type];
            this.map.addLayer(this.currentBaseLayer);
        }, 400);
    }





    ngOnDestroy(): void {
        if (this.map) {
            this.map.off();
            this.map.remove();
        }
    }


    private setWmsLayers() {
        if (!this.map || !this.layerControl) return;


        for (const config of this.wmsLayers) {
            const { url, layer, sld, cql, label } = config;
            if (!url || !layer) continue;

            const params: any = {
                layers: layer,
                styles: sld || '',
                format: 'image/png',
                transparent: true,
                opacity: 0.8,
                version: '1.3.0',
                _ts: Date.now(),
            };

            if (cql?.trim()) {
                params.CQL_FILTER = cql.trim();
            }
            const wmsLayer = L.tileLayer.wms(url, params);
            //wmsLayer.addTo(this.map);
            this.layerControl.addOverlay(wmsLayer, label || layer);
        }

        //this.bringOverlayLayersToFront();
    }

}
