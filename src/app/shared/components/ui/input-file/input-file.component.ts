import {
    Component,
    inject,
    input,
    OnChanges,
    OnInit,
    output,
    signal,
    SimpleChanges,
    ViewChild,
} from '@angular/core';
import { AttachmentService } from '@core/services';
import { catchError, finalize } from 'rxjs/operators';
import { FileUploadModule } from 'primeng/fileupload';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { IAttachment } from '@core/models';
import { InputFilePreviewerComponent } from './previewer/previewer.component';
import { getFileExtension } from '@core/utils';
import { ConfirmationService, Message } from 'primeng/api';
import { MessagesModule } from 'primeng/messages';
import { FileUpload } from 'primeng/fileupload';
import { TooltipModule } from 'primeng/tooltip';

export type OrientationInputFile = 'horizontal' | 'vertical';
export const LIMIT_FILE_SIZE = 500000000; // 500MB
export const DEFAULT_FILE_SIZE = 100000000; // 100MB
@Component({
    selector: 'app-input-file',
    standalone: true,
    imports: [
        FileUploadModule,
        ProgressSpinnerModule,
        MessageModule,
        MessagesModule,
        InputFilePreviewerComponent,
        TooltipModule,
    ],
    templateUrl: './input-file.component.html',
    styleUrl: './input-file.component.scss',
})
export class InputFileComponent implements OnInit, OnChanges {
    id = input<string>('');
    label = input<string>('Seleccionar');
    accept = input<string>('*');
    multiple = input<boolean>(false);
    maxFiles = input<number>(0);
    dragDrop = input<boolean>(false);
    disabled = input<boolean>(false);
    defaultFiles = input<IAttachment[] | undefined>([]);
    preview = input<boolean>(false);
    orientation = input<OrientationInputFile>('vertical');
    onlinePreview = input<boolean>(false);
    heightPreviewer = input<number>(450);
    placeholder = input<string>();
    onSelect = output<any>();
    onUploaded = output<any>();
    onRemove = output<any>();
    maxFileSize = input<number>(DEFAULT_FILE_SIZE);

    _contentFiles = signal([] as IAttachment[]);
    service = inject(AttachmentService);
    confirmService = inject(ConfirmationService);

    errors: Message[] = [];
    files: File[] = [];
    uploading = false;
    uploaded = false;

    @ViewChild('fileUpload') fileUpload!: FileUpload;

    showDeleteBtn = input<boolean>(true);
    onDeleted = output<IAttachment>();
    private deletingIds = new Set<number>();
    ngOnInit(): void {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['defaultFiles']) {
            this.loadDefaultFiles();
        }
    }

    loadDefaultFiles() {
        const _defaultFiles = this.defaultFiles();
        this._contentFiles.set([]);
        if (_defaultFiles?.length) {
            const cleanedFiles = _defaultFiles.filter((file) => file != null);
            this._contentFiles.set(cleanedFiles);
            cleanedFiles.map((attachment) => {
                const emptyData = new Blob([''], {
                    type: attachment.contentType,
                });
                const arrayOfBlob = new Array<Blob>();
                arrayOfBlob.push(emptyData);
                const file: File = new File(arrayOfBlob, attachment.filename);
                this.files.push(file);
            });
        }
    }

    onChange(event: any) {
        this.errors = [];
        if (!this.isValidTypeFiles(event)) {
            this.errors.push({
                severity: 'error',
                detail: 'Tipo de archivo no permitido',
            });
        }

        const total = event.files.length;

        if (this.maxFiles() > 0 && total > this.maxFiles()) {
            this.errors.push({
                severity: 'error',
                detail: `Máximo de archivos permitidos es ${this.maxFiles()}`,
            });
        }

        const maxFileSize = this.maxFileSize();

        if (maxFileSize > LIMIT_FILE_SIZE) {
            this.errors.push({
                severity: 'error',
                detail: `Máximo permitido por archivo es ${
                    LIMIT_FILE_SIZE / 1000000
                } MB`,
            });
        }

        if (maxFileSize > 0) {
            const _files = Array.from(event.files) as File[];
            for (const file of _files) {
                if (file.size > maxFileSize) {
                    this.errors.push({
                        severity: 'error',
                        detail: `El archivo "${
                            file.name
                        }" excede el tamaño máximo permitido de ${
                            maxFileSize / 1000000
                        } MB`,
                    });
                }
            }
        }

        if (this.errors.length > 0) {
            return;
        }

        this.uploading = true;
        this.uploaded = false;
        this.files.push(...event.files);
        this.onSelect.emit(event.files);
        const formData = new FormData();
        for (const file of event.files) {
            formData.append('files', file, file.name);
        }

        this.service
            .upload(formData)
            .pipe(
                catchError((err) => {
                    this.uploading = false;
                    this.uploaded = false;
                    this.errors = [
                        {
                            severity: 'error',
                            detail:
                                err.error?.message ||
                                'Error al cargar los archivos',
                        },
                    ];
                    return err;
                })
            )
            .subscribe((response) => {
                this._contentFiles.set(response as IAttachment[]);
                this.uploading = false;
                this.uploaded = true;
                this.onUploaded.emit({ event, files: response });

                this.resetUploaderQueue();
            });
    }

    remove(event: any) {
        this.files.splice(this.files.indexOf(event), 1);
        if (this.files.length <= this.maxFiles()) this.errors = [];
        this.onRemove.emit(this.files);
    }

    isValidTypeFiles(event: any): boolean {
        const files = event.files;
        if (this.accept() === '*') return true;
        const accept = this.accept().split(',');
        const pattern = accept
            .map((type) => type.replace(/\//g, '\\/').replace('*', '.*'))
            .join('|');

        const regex = new RegExp(`^(${pattern})$`);
        for (const file of files) {
            if (accept.includes('*')) return true;

            const extension = getFileExtension(file.name) as string;
            if (accept.includes(extension)) return true;
            if (regex.test(file.type)) {
                continue;
            }
            if (!accept.includes(file.type)) return false;
        }

        return true;
    }

    get allowedTypes(): string {
        return this.accept()
            .split(',')
            .map((type) => {
                const name = this.getFileTypeName(type);
                return name;
            })
            .join(', ');
    }

    get isHorizontal() {
        return this.orientation() === 'horizontal';
    }

    getFileTypeName(type: string) {
        const names: any = {
            'application/pdf': 'PDF',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                'Excel',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                'Word',
            'image/*': 'Imagen',
            '.kml': 'KML',
        };

        const result = names[type] ?? type;

        return result;
    }

    onError(event: any) {
        this.errors = [
            {
                severity: 'error',
                detail: event.message || 'Error al cargar el archivo',
            },
        ];
    }

    onCloseError() {
        if (this.fileUpload && this.errors.length === 1) {
            this.fileUpload.clear();
        }
    }

    isDeleting(file: IAttachment): boolean {
        return file?.id != null && this.deletingIds.has(file.id);
    }

    onDeleteFile(file: IAttachment) {
        if (!file?.id) return;

        this.deletingIds.add(file.id);

        this.service
            .delete(file.id)
            .pipe(
                catchError((err) => {
                    this.errors = [
                        {
                            severity: 'error',
                            detail: 'No se pudo eliminar el archivo.',
                        },
                    ];
                    return err;
                }),
                finalize(() => {
                    this.deletingIds.delete(file.id);
                })
            )
            .subscribe((ok: any) => {
                const updated = (this._contentFiles() ?? []).filter(
                    (_file) => _file.id !== file.id
                );
                this._contentFiles.set(updated);

                this.files = this.files.filter(
                    (_file) => _file.name !== file.filename
                );

                this.onDeleted.emit(file);

                this.uploaded = false;
                this.resetUploaderQueue();
            });
    }

    private resetUploaderQueue() {
        if (this.fileUpload) {
            this.fileUpload.clear();
            (this.fileUpload as any)?.advancedFileInput?.nativeElement &&
                ((
                    this.fileUpload as any
                ).advancedFileInput.nativeElement.value = '');
        }
    }

    confirmDelete(file: IAttachment) {
        this.confirmService.confirm({
            accept: () => {
                this.onDeleteFile(file);
            },
        });
    }
}
