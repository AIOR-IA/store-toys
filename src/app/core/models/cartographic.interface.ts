export interface IDepartment {
    id: number;
    departamento: string;
    estado: boolean;
    bbox: any;
}

export interface IProvince {
    id: number;
    provincia: string;
    departamento: string;
    id_departamento: number;
    bbox: any;
    estado: boolean;
}

export interface IMunicipality {
    id: number;
    municipio: string;
    departamento: string;
    provincia: string;
    id_departamento: number;
    id_provincia: number;
    bbox: any;
    estado: boolean;
}

export interface IStreet {
    id: number;
    calle: string;
    barrio: string;
    municipio: string;
    provincia: string;
    departamento: string;
    id_barrio: number;
    bbox: any;
    estado: boolean;
}

export interface ICartographicCommunity {
    comunidad: string;
    municipio: string;
    provincia: string;
    departamento: string;
    cod_mun: string;
    bbox: any;
}
