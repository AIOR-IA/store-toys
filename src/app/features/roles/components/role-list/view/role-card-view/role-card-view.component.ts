import { Component, inject, OnInit } from '@angular/core';
import { RoleStateService } from 'app/features/roles/services';

@Component({
    selector: 'app-role-card-view',
    templateUrl: './role-card-view.component.html',
    styleUrl: './role-card-view.component.scss',
})
export class RoleCardViewComponent implements OnInit {
    state = inject(RoleStateService);

    ngOnInit(): void {
        this.state.findPage({});
    }
}
