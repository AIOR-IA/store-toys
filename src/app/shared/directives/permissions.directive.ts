import { Directive, ElementRef, inject, input, OnInit } from '@angular/core';
import { SystemAccessPermissions } from '@core/types';
import { SessionService } from '@core/services';
import { camelCase } from 'lodash';
import { RESOURCES } from '@shared/constants';

@Directive({
    selector: '[appPermissions]',
    standalone: true,
})
export class PermissionsDirective implements OnInit {
    resource = input.required<string | string[]>();
    action = input.required<SystemAccessPermissions>();
    publicView = input<boolean>(false);

    sessionService = inject(SessionService);
    constructor(private el: ElementRef) {}

    ngOnInit() {
        let hasAccess = this.publicView();
        if (Array.isArray(this.resource())) {
            for (const resource of this.resource()) {
                hasAccess = this.hasPermission(resource, this.action());
                if (hasAccess) break;
            }
        } else {
            hasAccess = this.hasPermission(
                this.resource() as string,
                this.action(),
            );
        }

        if (!hasAccess) {
            // remove element from DOM
            this.el.nativeElement.remove();
        }
    }

    hasPermission(resource: string, action: SystemAccessPermissions) {
        if (this.publicView()) return true;

        const dynamicFnName = camelCase(action);

        return (this.sessionService as any)[dynamicFnName](resource);
    }
}
