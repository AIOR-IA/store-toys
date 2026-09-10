import { Component, inject, input } from '@angular/core';
import { IAttachment } from '@core/models';
import { AttachmentService } from '@core/services';
import { FileTypes } from '@core/types';
import { ImageModule } from 'primeng/image';
import { PdfPreviewerComponent } from './pdf-previewer/pdf-previewer.component';

@Component({
    selector: 'app-input-file-previewer',
    standalone: true,
    imports: [ImageModule, PdfPreviewerComponent],
    templateUrl: './previewer.component.html',
    styleUrl: './previewer.component.scss',
})
export class InputFilePreviewerComponent {
    file = input.required<IAttachment>();
    preview = input<boolean>(false);
    onlinePreview = input<boolean>(false);
    height = input<number>(450);
    service = inject(AttachmentService);

    isImage(type: string) {
        return type?.includes('image/');
    }

    isPDF(type: string) {
        return type === FileTypes.PDF;
    }

    fileIcon(type: string): string {
        if (type === FileTypes.PDF) return 'fas fa-file-pdf';
        if (type === FileTypes.EXCEL) return 'fas fa-file-excel';
        if (type === FileTypes.WORD) return 'fas fa-file-word';
        if (type?.includes('image/')) return 'fas fa-image';
        return 'fas fa-file';
    }
}
