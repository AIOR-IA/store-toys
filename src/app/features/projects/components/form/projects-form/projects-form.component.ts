import { Component, inject, OnInit, signal } from '@angular/core';
import { BaseFormComponent } from '@shared/components';
import { Validators } from '@angular/forms';
import { IProject } from '../../../models';
import { ProjectService, ProjectStateService } from '../../../services';
import { NormalizeTextValidator, trimmedRequiredValidator } from '@shared/form-validators';
import { IUser } from 'app/features/users/models';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { UsersService } from 'app/features/users/services';

@Component({
    selector: 'app-projects-form',
    templateUrl: './projects-form.component.html',
    styleUrl: './projects-form.component.scss',
})
export class ProjectFormComponent extends BaseFormComponent<IProject> implements OnInit {
    override service = inject(ProjectService);
    override state = inject(ProjectStateService);
    private userService = inject(UsersService);

    userType = signal<IUser[]>([]);
    userTypeSubject = new Subject<{
        query: string;
        id: number;
        type: string;
    }>();

    constructor(){
        super();
        this.initUsertType();
    }

    override ngOnInit(): void {
        super.ngOnInit();
        this.loadData();
    }


    loadData() {
        this.userTypeSubject.next({ query: '', id: 0, type: '' });
    }

    override buildForm(): void {
        let current = {} as IProject;
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
                    Validators.maxLength(200),
                    trimmedRequiredValidator,
                    NormalizeTextValidator
                ],
            ],
            userId: [current.userId, Validators.required],
            enabled: [this.isCreateMode ? true : !!current.enabled]
        });

        if (this.isViewMode) {
            this.form.disable();
        }
    }

     // instruments Type

    initUsertType() {
        this.userTypeSubject
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe(({ query, id, type }) => {
                this.userService
                    .findAll({
                        query,
                        perPage: 50,
                        sort: 'firstName',
                        order: 'asc',
                        filter: JSON.stringify({ roleCode: 'COLLECTOR' , enabled: true }),
                    })
                    .subscribe((result) => {
                        this.userType.set(result.data);
                    });
            });
    }

    filterUserType(event: any) {
        const query = event.filter;
        const id = this.state.current?.id;
        this.userTypeSubject.next({ query, id, type: '' });
    }
}
