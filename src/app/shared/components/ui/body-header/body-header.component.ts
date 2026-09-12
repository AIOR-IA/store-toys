import { CommonModule } from '@angular/common';
import {
    Component,
    inject,
    input,
    model,
    OnChanges,
    output,
    signal,
    SimpleChanges,
    WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GRID_VIEW, LIST_VIEW } from '@shared/constants';
import { MenuItem } from 'primeng/api';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SplitButtonModule } from 'primeng/splitbutton';

@Component({
    selector: 'app-body-header',
    standalone: true,
    imports: [
        CommonModule,
        BreadcrumbModule,
        SelectButtonModule,
        FormsModule,
        SplitButtonModule,
        ButtonModule,
    ],
    templateUrl: './body-header.component.html',
    styleUrl: './body-header.component.scss',
})
export class BodyHeaderComponent implements OnChanges {
    breadcrumbs = input.required<MenuItem[]>();
    options = input<MenuItem[]>([]);
    createPath = input<string>();
    createParams = input<any>();
    createLabel = input<string>('Nuevo');
    viewButtons = input<boolean>(true);

    home!: MenuItem;
    mainOption: WritableSignal<MenuItem | undefined> = signal(undefined);
    dropDownOptions = signal<MenuItem[]>([]);

    view = model<string>(LIST_VIEW);
    onViewChange = output<string>();

    stateOptions: any[] = [
        { icon: 'fas fa-list', value: LIST_VIEW },
        { icon: 'fas fa-table-cells-large', value: GRID_VIEW },
    ];

    ngOnInit() {
        this.home = { icon: 'fas fa-home', routerLink: '/' };
        this.loadViewStored();
        this.setMainOption();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['options']) {
            this.setMainOption();
        }
    }

    emitView() {
        localStorage.setItem('view', this.view());
        this.onViewChange.emit(this.view());
    }

    setMainOption() {
        if (!this.options().length) return;

        //get first option and set it as main option after that remove the option from the list
        this.mainOption.set(this.options()[0]);
        this.dropDownOptions.set(this.options().slice(1));
    }

    loadViewStored() {
        const storedView = localStorage.getItem('view');
        if (storedView) {
            this.view.set(storedView);
            this.emitView();
        }
    }

    callCommand(option: MenuItem | undefined, event: any) {
        if (!option) return;

        if (option.command) {
            return option.command(event);
        }
    }
}
