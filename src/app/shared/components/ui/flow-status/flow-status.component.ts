import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, input, output } from '@angular/core';
import { SessionService } from '@core/services';
import { FlowStatus } from '@core/types';

import { Messages } from '@shared/constants';
import { ConfirmationService } from 'primeng/api';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TagModule } from 'primeng/tag';

@Component({
    selector: 'app-flow-status',
    standalone: true,
    imports: [CommonModule, SplitButtonModule, TagModule],
    templateUrl: './flow-status.component.html',
    styleUrls: ['./flow-status.component.scss'],
})
export class FlowStatusComponent implements OnInit {
    status = input.required<FlowStatus>();
    resource = input.required<string>();
    approvedLabel = input<string>();
    reviewedLabel = input<string>();
    rejectedLabel = input<string>();
    onUpdate = output<FlowStatus>();

    sessionService = inject(SessionService);
    confirmService = inject(ConfirmationService);
    messages = Messages;
    statuses = [
        {
            label: 'Por Revisar',
            command: () => this.updateFlowStatus(FlowStatus.REVIEW, 'ENVIAR A REVISIÓN'),
        },
        {
            label: 'Aprobado',
            command: () => this.updateFlowStatus(FlowStatus.APPROVED, 'APROBAR'),
        },
        { separator: true },
        {
            label: 'Rechazado',
            command: () => this.updateFlowStatus(FlowStatus.REJECTED, 'RECHAZAR'),
        },
    ];

    constructor() {}

    ngOnInit() {
        this.statuses[0].label = this.reviewedLabel() || 'Por Revisar';
        this.statuses[1].label = this.approvedLabel() || 'Aprobado';
        this.statuses[3].label = this.rejectedLabel() || 'Rechazado';
    }

    updateFlowStatus(status: FlowStatus, action: string) {
        if (this.status() === status) return; // No action if the status is the same
        
        this.confirmService.confirm({
            message: `¿Está seguro de ${action} esta solicitud?`,
            accept: () => {
                this.onUpdate.emit(status);
            },
        });
    }

    get flowStatus(): {
        severity: 'success' | 'info' | 'warning' | 'danger' | 'contrast';
        value: string;
    } {
        let status: {
            severity: 'success' | 'info' | 'warning' | 'danger' | 'contrast';
            value: string;
        } = { severity: 'info', value: 'None' };
        switch (this.status()) {
            case FlowStatus.REVIEW:
                status = {
                    severity: 'warning',
                    value: this.reviewedLabel() || 'Por Revisar',
                };
                break;
            case FlowStatus.SUBMITTED:
                status = { severity: 'info', value: 'Enviado' };
                break;
            case FlowStatus.EVALUATED:
                status = { severity: 'success', value: 'Evaluado' };
                break;
            case FlowStatus.APPROVED:
                status = {
                    severity: 'success',
                    value: this.approvedLabel() || 'Aprobado',
                };
                break;
            case FlowStatus.REJECTED:
                status = {
                    severity: 'danger',
                    value: this.rejectedLabel() || 'Rechazado',
                };
                break;
            case FlowStatus.DRAFT:
                status = {
                    severity: 'contrast',
                    value: 'Borrador',
                };
                break;
            default:
                status = {
                    severity: 'contrast',
                    value: 'Sin Estado',
                };
                break;
        }

        return status;
    }
}
