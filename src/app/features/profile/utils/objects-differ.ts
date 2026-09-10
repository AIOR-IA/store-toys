export function objectsDiffer(
    original: { [key: string]: any } | null,
    modified: { [key: string]: any } | null,
): boolean {
    if (!original || !modified) return true;

    const originalKeys = Object.keys(original);
    const modifiedKeys = Object.keys(modified);

    if (originalKeys.length !== modifiedKeys.length) {
        return true;
    }

    for (const key of modifiedKeys) {
        if (!(key in original)) {
            return true;
        }
    }

    for (const key of originalKeys) {
        if (!(key in modified)) {
            return true;
        }
    }

    for (const key of originalKeys) {
        if (original[key] !== modified[key]) {
            return true;
        }
    }

    return false;
}
