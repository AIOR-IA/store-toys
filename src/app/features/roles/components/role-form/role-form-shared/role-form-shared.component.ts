import { Component, inject } from '@angular/core';
import { Validators, FormControl } from '@angular/forms';
import { BaseFormComponent } from '@shared/components';
import { IRole } from 'app/features/roles/models';
import { RolesService, RoleStateService } from 'app/features/roles/services';
import { firstValueFrom } from 'rxjs';
import { KEY_TEXT_PATTERN, KeyTextValidator } from '@shared/form-validators';
import { SessionService } from '@core/services';
interface Office {
    name: string;
    code: string;
}
@Component({
    selector: 'app-role-form-shared',
    templateUrl: './role-form-shared.component.html',
    styleUrl: './role-form-shared.component.scss',
})
export class RoleFormSharedComponent extends BaseFormComponent<IRole> {
    override service = inject(RolesService);
    override state = inject(RoleStateService);
    session = inject(SessionService);

    override buildForm(): void {
        let current = {} as IRole;

        if (this.state.current && (this.isUpdateMode || this.isViewMode)) {
            current = this.state.current;
        }

        this.form = this._fb.group({
            id: [current.id],
            name: [
                current.name,
                [
                    Validators.required,
                    Validators.minLength(3),
                    Validators.maxLength(50),
                ],
            ],
            code: [
                current.code,
                [
                    Validators.required,
                    Validators.maxLength(50),
                    KeyTextValidator,
                ],
            ],
            description: [current.description, [Validators.maxLength(255)]],
            enabled: [current.enabled ?? true],
        });

        if (this.isViewMode) {
            this.form.disable();
        }
    }

    generateCode(event: any): void {
        const input = event.target as HTMLInputElement;
        if (!input.value) return;

        const name = input.value;
        let code = name?.toUpperCase().replace(/[^a-zA-Z0-9_]/g, '_');
        this.form.patchValue({ code });
    }

    override onSubmit() {
        this.form.removeControl('selectedOffice');
        super.onSubmit((response) => {
            this.router.navigate(['/admin/roles']);
        });
    }
}
