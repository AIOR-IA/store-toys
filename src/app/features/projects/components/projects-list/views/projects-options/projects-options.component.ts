import { Component, inject } from '@angular/core';
import { BaseItemOptionsComponent } from '@shared/components';
import { IBaseStateService } from '@core/models';
import { IHttService } from '@core/models/http-service.interface';
import { RESOURCES } from '@shared/constants';
import { IProject } from '../../../../models';
import { ProjectService, ProjectStateService } from '../../../../services';

@Component({
  selector: 'app-projects-options',
  templateUrl: './projects-options.component.html',
  styleUrl: './projects-options.component.scss'
})
export class ProjectOptionsComponent extends BaseItemOptionsComponent<IProject> {
    override state: IBaseStateService<IProject> = inject(ProjectStateService);
    override service: IHttService<IProject> = inject(ProjectService);

    override loadOptions(t: Record<string, string>): void {
        this.items.set([
            {
                label: t['options'],
                items: [
                    {
                        label: t['details'],
                        icon: 'fas fa-eye',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.goTo(`/admin/projects/${itemId}`);
                        },
                    },
                    {
                        label: t['edit'],
                        icon: 'fas fa-pencil-alt',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.goTo(`/admin/projects/${itemId}/edit`);
                        },
                        visible: this.sessionService.canUpdate(RESOURCES.PROJECT),
                    },
                    {
                        label: t['delete'],
                        icon: 'fas fa-trash-alt',
                        command: () => {
                            this.delete();
                        },
                        visible: this.sessionService.canDelete(RESOURCES.PROJECT),
                    },
                    {
                        label: t['communities'],
                        icon: 'fas fa-tents',
                        command: () => {
                            const itemId = this.item().uuid;
                            this.goTo(`/admin/projects/communities/${itemId}/list`);
                        },
                    },
                ],
            },
        ]);
    }
}
