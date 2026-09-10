import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { User } from '../../features/users/models/user.model';
import { CURRENT_ROLE_ID_KEY, DEFAULT_ROLES, SessionRole } from '@core/types';
import { SystemPermissions } from '@core/config';


@Injectable({
    providedIn: 'root',
})
export class SessionService {
    authService = inject(AuthService);
    user = signal({} as Partial<User>);
    role = signal({} as SessionRole);
    availableRoles = signal([] as SessionRole[]);

    private _registrationsContext = signal(false);
    private _legalUserRequestActionsBlocked = signal(false);

    registrationsContext() {
        return this._registrationsContext();
    }
    setRegistrationsContext(v: boolean) {
        this._registrationsContext.set(v);
    }

    private _refresSideBar = signal(0);
    refresSideBar = this._refresSideBar.asReadonly();

    triggerRefreshSidebar() {
        this._refresSideBar.update((v) => v + 1);
    }

    constructor() {
        this.getUserFromToken();
    }

    changeRole(id: number) {
        const found = this.availableRoles().find((role) => role.id === id);
        if (!found) return;

        this.storeCurrentRoleId(id);
        this.role.set(found as SessionRole);
    }

    isMasterAdmin(): boolean {
        return this.role().code === DEFAULT_ROLES.MASTER_ADMIN;
    }

    isAgentOfficer(): boolean {
        return (
            this.role().code === DEFAULT_ROLES.AGENT_OFFICER ||
            this.isRepresentant()
        );
    }

    isRepresentant() {
        //Legal User Request
        return this.role().code === DEFAULT_ROLES.REPRESENTANT;
    }

    isOfficeAdmin() {
        return this.role().code === DEFAULT_ROLES.OFFICE_ADMIN;
    }


    legalUserRequestActionsBlocked() {
        return this._legalUserRequestActionsBlocked();
    }

    setLegalUserRequestActionsBlocked(value: boolean) {
        this._legalUserRequestActionsBlocked.set(value);
    }

    isAdmin() {
        return this.isMasterAdmin() || this.isOfficeAdmin();
    }

    none(resource: string): boolean {
        return false;
    }

    canRead(resource: string): boolean {
        return (
            this.verify(SystemPermissions.RIGHT_READ, resource) ||
            this.canApprove(resource) ||
            this.canManage(resource) ||
            this.canMaster(resource)
        );
    }

    canUpdate(resource: string): boolean {
        return (
            this.verify(SystemPermissions.RIGHT_UPDATE, resource) ||
            this.canManage(resource) ||
            this.canMaster(resource)
        );
    }

    canCreate(resource: string): boolean {
        return (
            this.verify(SystemPermissions.RIGHT_CREATE, resource) ||
            this.canManage(resource) ||
            this.canMaster(resource)
        );
    }

    canDelete(resource: string): boolean {
        return (
            this.verify(SystemPermissions.RIGHT_DELETE, resource) ||
            this.canManage(resource) ||
            this.canMaster(resource)
        );
    }

    canManage(resource: string): boolean {
        return (
            this.verify(SystemPermissions.RIGHT_MANAGE, resource) ||
            this.canMaster(resource)
        );
    }

    canMaster(resource: string): boolean {
        return this.verify(SystemPermissions.RIGHT_MASTER, resource);
    }

    canSeeMenu(resource: string): boolean {
        return (
            this.canRead(resource) &&
            (this.canUpdate(resource) ||
                this.canCreate(resource) ||
                this.canApprove(resource) ||
                this.canDelete(resource))
        );
    }

    canSeeMany(resources: string[]) {
        let canSee = false;
        for (const r of resources) {
            canSee = this.canSeeMenu(r);
            if (canSee) break;
        }

        return canSee;
    }

    canApprove(resource: string): boolean {
        return (
            this.verify(SystemPermissions.RIGHT_APPROVER, resource) ||
            this.canMaster(resource)
        );
    }

    hasMasterPersmission(resource: string) {
        return this.hasExactPermission(
            SystemPermissions.RIGHT_MASTER,
            resource,
        );
    }

    hasManagePersmission(resource: string) {
        return this.hasExactPermission(
            SystemPermissions.RIGHT_MANAGE,
            resource,
        );
    }

    hasApproverPersmission(resource: string) {
        return this.hasExactPermission(
            SystemPermissions.RIGHT_APPROVER,
            resource,
        );
    }

    isApproverForResource(resource: string): boolean {
        return (
            this.hasApproverPersmission(resource) ||
            this.hasMasterPersmission(resource) ||
            this.hasManagePersmission(resource)
        );
    }

    //permission ios the bitwise value of the permission
    private verify(permission: number, resource: string) {
        if (!this.role()) return false;
        return this.parseRight(permission, resource);
    }

    //permission ios the bitwise value of the permission
    private parseRight(permission: number, resource: string): boolean {
        const permissionResource = this.role()?.permissions?.find(
            (p) => p.resource?.code === resource,
        );

        if (!permissionResource) return false;
        return !!(permission & permissionResource.permission);
    }

    private hasExactPermission(permission: number, resource: string): boolean {
        const permissionResource = this.role()?.permissions?.find(
            (p) => p.resource?.code === resource,
        );
        if (!permissionResource) return false;
        // Check if the permission matches exactly
        return permission === permissionResource.permission;
    }

    private storeCurrentRoleId(id: number) {
        sessionStorage.setItem(CURRENT_ROLE_ID_KEY, id.toString());
    }

    private getCurrentRoleId() {
        return sessionStorage.getItem(CURRENT_ROLE_ID_KEY);
    }

    private getUserFromToken() {
        const token = this.authService.getToken();
        if (!token) return;

        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const decodedData = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join(''),
        );

        const payload = JSON.parse(decodedData);
        if (!payload) return;

        const user = new User(payload);
        this.user.set(user);
        // this.entity.set(user.entity);
        this.availableRoles.set(user.roleUsers.map((ru) => ru.role));
        const currentRoleId = this.getCurrentRoleId();
        let roleUser;
        if (user.role) {
            this.role.set(user.role);

        }
        if (currentRoleId) {
            roleUser = user.roleUsers.find(
                (ru) => ru.role.id === +currentRoleId,
            );
        } else roleUser = user.roleUsers[0];
        if (roleUser) this.role.set(roleUser.role);
    }
}
