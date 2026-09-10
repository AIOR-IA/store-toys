import {
    computed,
    Signal,
    signal,
    WritableSignal,
} from '@angular/core';
import { SystemAccessPermissions } from '@core/types';
import { RESOURCES } from '@shared/constants';
import { StaticState } from '../models/state.interface';

export abstract class BaseStateStaticService {
    protected initialState: StaticState = {
        current: null,
    };
    public state: WritableSignal<StaticState> = signal(this.initialState);

    public resources = RESOURCES;
    public actions = {
        create: SystemAccessPermissions.CAN_CREATE,
        update: SystemAccessPermissions.CAN_UPDATE,
        delete: SystemAccessPermissions.CAN_DELETE,
        read: SystemAccessPermissions.CAN_READ,
        manage: SystemAccessPermissions.CAN_MANAGE,
        master: SystemAccessPermissions.CAN_MASTER,
    };

    constructor() {
    }

    parseFilter(filter: any): string {
        return  JSON.stringify(filter);
    }
    /**
     * Returns a reactive value for a property on the state.
     * This is used when the consumer needs the signal for
     * specific part of the state.
     *
     * @param key - the key of the property to be retrieved
     */
    public select<K extends keyof StaticState>(key: K): Signal<StaticState[K]> {
        return computed(() => this.state()[key]);
    }

    /**
     * This is used to set a new value for a property
     *
     * @param key - the key of the property to be set
     * @param data - the new data to be saved
     */
    public set<K extends keyof StaticState>(key: K, data: StaticState[K]) {
        this.state.update((currentValue) => ({ ...currentValue, [key]: data }));
    }

    /**
     * Sets values for multiple properties on the store
     * This is used when there is a need to update multiple
     * properties in the store
     *
     * @param partialState - the partial state that includes
     *                      the new value to be saved
     */
    public setState(partialState: Partial<StaticState>): void {
        this.state.update((currentValue) => {
            return {
                ...currentValue,
                ...partialState,
            };
        });
    }
}
