// The operation '<<' is a bitwise left shift operator. It shifts the bits of the number to the left by the number of bits specified.
export const SystemPermissions = Object.freeze({
    RIGHT_NONE: 0, // No permissions
    RIGHT_READ: 1 << 1, // Permission to read
    RIGHT_UPDATE: 1 << 2, // Permission to update
    RIGHT_CREATE: 1 << 3, // Permission to create
    RIGHT_DELETE: 1 << 4, // Permission to delete
    RIGHT_MANAGE: 1 << 5, // Permission to manage
    RIGHT_MASTER: 1 << 6, // Master permission with all rights
    RIGHT_APPROVER: 1 << 7, // Permission to approve, reject, and review
});
