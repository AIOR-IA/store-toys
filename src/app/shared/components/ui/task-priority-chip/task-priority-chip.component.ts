import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TaskPriority } from 'app/features/law-procedures/models';
import { ChipModule } from 'primeng/chip';

@Component({
    selector: 'app-task-priority-chip',
    standalone: true,
    imports: [CommonModule, ChipModule, TranslateModule],
    templateUrl: './task-priority-chip.component.html',
    styleUrl: './task-priority-chip.component.scss',
})
export class TaskPriorityChipComponent {
    priority = input.required<TaskPriority>();

    get color(): string {
        switch (this.priority()) {
            case TaskPriority.LOWEST:
                return 'bg-gray-100 text-black';
            case TaskPriority.LOW:
                return 'bg-blue-100 text-blue-900';
            case TaskPriority.MEDIUM:
                return 'bg-green-100 text-green-900';
            case TaskPriority.HIGH:
                return 'bg-orange-100 text-orange-900';
            case TaskPriority.HIGHEST:
                return 'bg-red-100 text-red-900';
            default:
                return 'bg-white text-black';
        }
    }
}
