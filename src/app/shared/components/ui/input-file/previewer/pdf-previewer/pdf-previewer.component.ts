import { Component, input, model, signal, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { CommonModule } from '@angular/common';
import * as pdfjsLib from 'pdfjs-dist';

// Configurar worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';

@Component({
    selector: 'app-pdf-previewer',
    standalone: true,
    imports: [CommonModule, ProgressBarModule, PdfViewerModule, ButtonModule, DialogModule],
    templateUrl: './pdf-previewer.component.html',
    styleUrl: './pdf-previewer.component.scss',
})
export class PdfPreviewerComponent implements OnInit, OnChanges {
    fileUrl = input.required<string>();
    fileDownloadUrl = input.required<string>();
    online = input<boolean>(false);
    height = input<number>(450);
    showThumbnail = input<boolean>(true);
    thumbnailWidth = input<number>(200);
    thumbnailHeight = input<number>(250);
    
    loadingPdf = signal<boolean>(false);
    loadingThumbnail = signal<boolean>(false);
    viewPdfOnline = signal<boolean>(false);
    viewModal = model<boolean>(false);
    thumbnailUrl = signal<string | null>(null);
    thumbnailError = signal<boolean>(false);

    constructor() {}

    ngOnInit() {
        if (this.showThumbnail()) {
            this.generateThumbnail();
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['fileUrl'] && this.showThumbnail()) {
            this.generateThumbnail();
        }
    }

    afterPdfLoadComplete(event: any): void {
        this.loadingPdf.set(false);
    }

    onViewPDF() {
        if (this.online()) {
            this.viewPdfOnline.set(true);
        } else {
            this.viewModal.set(true);
        }
    }

    onDownloadPDF() {
        window.open(this.fileDownloadUrl(), '_blank');
    }

    private async generateThumbnail(): Promise<void> {
        if (!this.fileUrl()) return;

        this.loadingThumbnail.set(true);
        this.thumbnailError.set(false);

        try {
            const thumbnailDataUrl = await this.createPdfThumbnail(this.fileUrl());
            this.thumbnailUrl.set(thumbnailDataUrl);
        } catch (error) {
            console.error('Error generating PDF thumbnail:', error);
            this.thumbnailError.set(true);
            this.thumbnailUrl.set(null);
        } finally {
            this.loadingThumbnail.set(false);
        }
    }

    private async createPdfThumbnail(pdfUrl: string): Promise<string> {
        try {
            // Cargar el PDF
            const response = await fetch(pdfUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            // Obtener la primera página
            const page = await pdf.getPage(1);
            
            // Configurar el viewport (escala para el thumbnail)
            const desiredWidth = this.thumbnailWidth();
            const viewport = page.getViewport({ scale: 1 });
            const scale = desiredWidth / viewport.width;
            const scaledViewport = page.getViewport({ scale });
            
            // Crear canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error('Could not get canvas context');
            }
            
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            
            // Renderizar la página en el canvas
            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport
            };
            
            await page.render(renderContext).promise;
            
            // Convertir canvas a imagen base64
            return canvas.toDataURL('image/png', 0.8);
            
        } catch (error) {
            console.error('Error creating PDF thumbnail:', error);
            throw error;
        }
    }

    onThumbnailClick() {
        this.onViewPDF();
    }

    retryThumbnail() {
        this.generateThumbnail();
    }
}
