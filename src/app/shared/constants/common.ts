import { FilterTabOption } from '@shared/components';

/** Modos de visualización de los listados. */
export const GRID_VIEW = 'GRID_VIEW';
export const LIST_VIEW = 'LIST_VIEW';
export const TREE_VIEW = 'TREE_VIEW';

/** Retardo estándar para los buscadores (ms). */
export const DEBOUNCE_TIME = 300;

/** Opción "Todos" de las pestañas de filtro. */
export const AllOption: FilterTabOption<any> = {
    label: 'Todos',
    value: { id: 0 },
    icon: '',
};
