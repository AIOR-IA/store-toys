import {
    Component,
    inject,
    input,
    model,
    ModelSignal,
    OnInit,
    signal,
    WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthService, SessionService } from '@core/services';
import { SessionRole } from '@core/types';

import { IRole, IRoleUser } from 'app/features/roles/models';

@Component({
    selector: 'app-user-menu-overlay-panel',
    templateUrl: './user-menu-overlay-panel.component.html',
    styleUrl: './user-menu-overlay-panel.component.scss',
})
export class UserMenuOverlayPanelComponent implements OnInit {
    public showRoleDropdown: ModelSignal<boolean> = model(false);

    protected selectedRole: WritableSignal<SessionRole>;
    protected sessionService: SessionService;
    protected roles: WritableSignal<IRole[]>;

    private authService: AuthService;
    private router: Router;
    photoUrl = input<string | null>(null);

    constructor() {
        this.selectedRole = signal({} as SessionRole);
        this.roles = signal([]);

        this.sessionService = inject(SessionService);
        this.authService = inject(AuthService);
        this.router = inject(Router);
    }

    ngOnInit(): void {
        this.initialize();
    }

    public logout(): void {
        this.authService.logout();
    }

    public toggleRoleDropdown(): void {
        this.showRoleDropdown.update((value) => !value);
    }

    public changeRole(): void {
        const roleId = this.selectedRole().id;
        if (roleId) {
            this.showRoleDropdown.set(false);
            this.sessionService.changeRole(roleId);
            this.router.navigate(['/']).then(() => {
                window.location.reload();
            });
        }
    }

    public navigateTo(route: string): void {
        this.router.navigate([route]);
    }

    private initialize(): void {
        this.roles.set(
            this.sessionService
                .user()
                .roleUsers?.map((roleUser: IRoleUser) => roleUser.role) || [],
        );

        this.selectedRole.set(this.sessionService.role());
    }
}
