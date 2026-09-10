import { Component, computed, effect, ElementRef, inject, signal, untracked } from '@angular/core';
import { LayoutService } from '../../services/app.layout.service';
import { AttachmentService, SessionService } from '@core/services';

@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
})
export class AppSidebarComponent {
    sessionService = inject(SessionService);
    attachService = inject(AttachmentService);

    currentId!: number;
    editMode = signal(false);
    constructor(
        public layoutService: LayoutService,
        public el: ElementRef
    ) {

        effect(() => {
            const isRegistration = this.sessionService.registrationsContext();
            const isRepresentant = this.sessionService.isRepresentant();
        }, { allowSignalWrites: true });
    }



    get photoUrl() {

        return null;
    }
}
