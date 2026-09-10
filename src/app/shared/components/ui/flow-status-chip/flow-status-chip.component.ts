import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { FlowStatus } from '@core/types';
import { TranslateModule } from '@ngx-translate/core';
import { ChipModule } from 'primeng/chip';

@Component({
    selector: 'app-flow-status-chip',
    standalone: true,
    imports: [CommonModule, ChipModule, TranslateModule],
    templateUrl: './flow-status-chip.component.html',
    styleUrl: './flow-status-chip.component.scss',
})
export class FlowStatusChipComponent {
    status = input.required<FlowStatus>();

    get color(): string {
        switch (this.status()) {
            case FlowStatus.DRAFT:
                return 'bg-gray-500 text-white';
            case FlowStatus.REVIEW:
                return 'bg-blue-500 text-white';
            case FlowStatus.SUBMITTED:
                return 'bg-green-500 text-white';
            case FlowStatus.EVALUATED:
                return 'bg-purple-500 text-white';
            case FlowStatus.APPROVED:
                return 'bg-green-500 text-white';
            case FlowStatus.REJECTED:
                return 'bg-red-500 text-white';
            case FlowStatus.INACTIVE:
                return 'bg-gray-700 text-white';
            case FlowStatus.ARCHIVED:
                return 'bg-brown-500 text-white';
            case FlowStatus.RUNNING:
                return 'bg-green-300 text-black';
            case FlowStatus.STOPPED:
                return 'bg-black text-white';
            case FlowStatus.REQUESTED:
                return 'bg-blue-300 text-black';
            case FlowStatus.ASSIGNED:
                return 'bg-yellow-300 text-black';
            case FlowStatus.PROGRESS:
                return 'bg-yellow-300 text-black';
            case FlowStatus.OBSERVED:
                return 'bg-orange-500 text-white';
            default:
                return 'bg-white text-black';
        }
    }
}
