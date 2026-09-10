import { PaginatedResult } from '@core/types';

export interface State<T> {
    items: PaginatedResult<T>;
    current: T | null; //current item of type T
    status: 'idle' | 'loading' | 'success' | 'error';
    [key: string]: any; // New attribute to accept any key and value
}

export interface StaticState {
    [key: string]: any; // New attribute to accept any key and value
    stepValidityMap?: Record<number, boolean>;
}
