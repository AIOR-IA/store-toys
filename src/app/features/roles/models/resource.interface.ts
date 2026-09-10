export type ResourceType = 'MODULE' | 'COMPONENT';
export interface IResource {
    id: number; // Id of the resource
    name: string; // Name of the resource
    description?: string; // Description of the resource
    code: string; // Code of the resource
    type: ResourceType; // Type of the resource
    enabled: boolean; // Indicates if the resource is enabled
    createdAt: Date; // Date and time when the record was created
    updatedAt: Date; // Date and time when the record was updated
}
