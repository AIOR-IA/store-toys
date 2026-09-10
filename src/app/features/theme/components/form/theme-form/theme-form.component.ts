import { Component, inject, OnInit, signal } from '@angular/core';
import { BaseFormComponent } from '@shared/components';
import { Validators } from '@angular/forms';
import { ITheme } from '../../../models';
import { ThemeService, ThemeStateService } from '../../../services';
import { shortenBlankSpaces } from '@core/utils';

@Component({
    selector: 'app-theme-form',
    templateUrl: './theme-form.component.html',
    styleUrl: './theme-form.component.scss',
})
export class ThemeFormComponent
    extends BaseFormComponent<ITheme>
    implements OnInit
{
    override service = inject(ThemeService);
    override state = inject(ThemeStateService);

    constructor() {
        super();
    }

    override buildForm(): void {
        let current = {} as ITheme;
        if (this.state.current && (this.isUpdateMode || this.isViewMode)) {
            current = this.state.current;
        }

        this.form = this._fb.group({
            id: [current.id],
            title: [
                current.title,
                [
                    Validators.required,
                    Validators.min(2),
                    Validators.maxLength(250),
                ],
            ],
            icon: [current.icon, Validators.required],
            description: [current.description, [Validators.maxLength(500)]],
            enabled: [!!current.enabled],
            color: [current.color],
        });

        if (this.isViewMode) {
            this.form.disable();
        }
    }

    override onSubmit() {
        this.form
            .get('name')
            ?.setValue(shortenBlankSpaces(this.form.get('name')?.value));
        super.onSubmit((response) => {});
    }

    onSelectIcon(event: any) {
        this.form.patchValue({
            icon: event.value,
        });
    }
}
