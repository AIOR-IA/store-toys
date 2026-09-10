/**
 * Pagination configuration for data queries
 *
 * @description Type that defines pagination, sorting, and filtering parameters
 * for API queries. All properties are optional to allow flexibility in usage.
 *
 * @example
 * ```typescript
 * const paginationConfig: Pagination = {
 *   page: 1,
 *   perPage: 10,
 *   sort: 'createdAt',
 *   order: 'desc',
 *   query: 'search term',
 *   filter: { status: 'active' }
 * };
 * ```
 */
export type Pagination = {
    /**
     * Page number to query (1-based)
     * @default 1
     */
    page?: number;

    /**
     * Number of items per page
     * @default 10
     */
    perPage?: number;

    /**
     * Field to sort the results by
     * @example 'createdAt', 'name', 'id'
     */
    sort?: string;

    /**
     * Sorting direction
     * @default 'asc'
     */
    order?: 'asc' | 'desc';

    /**
     * Search term to filter results
     * @description Used for free text search across relevant fields
     */
    query?: string;

    /**
     * Additional filters to apply to the query
     * @description Dynamic object containing specific filtering criteria
     * @example { status: 'active', category: 'user' }
     */
    filter?: any;
};

export interface PaginatedResult<T> {
    data: T[];
    meta: {
        total: number;
        lastPage: number;
        page: number;
        perPage: number;
        prev: number | null;
        next: number | null;
    };
}

export const DEFAULT_PAGES = 5;

export type DataPagination = {
    first: number;
    rows: number;
    sortOrder: number;
    sortField: string;
    query?: string;
    summary?: boolean;
    [key: string]: any;
};

export interface RawPaginatedResult<T> {
    data: T[];
    totalPages: number;
    currentPage: number;
    first: number;
    total: number;
    summary?: any;
};
