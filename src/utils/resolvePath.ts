// Block prototype-chain keys so a path can't read constructor/__proto__ into output.
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

export interface ResolvedPath {
    /** True only when every segment (including the leaf) is an own, non-prototype key. */
    exists: boolean;
    /** The resolved value; undefined when the path does not fully exist. */
    value: any;
}

/**
 * A path is malformed when it is empty or has any empty segment ("", "a.", ".a",
 * "a..b", "."). These are template-authoring typos rather than missing data, so
 * callers can surface them distinctly from a merely-absent key.
 */
export function isMalformedPath(str: string): boolean {
    return str.split('.').some((segment) => segment === '');
}

function hasOwn(parent: any, key: string): boolean {
    return !BLOCKED.has(key)
        && parent != null
        && typeof parent === 'object'
        && Object.prototype.hasOwnProperty.call(parent, key);
}

/**
 * Walk a dot-path over `obj`, distinguishing an absent key from a present-but-null one.
 * A present-but-null/undefined leaf still reports `exists: true` (the key is there);
 * only a genuinely missing segment reports `exists: false`.
 */
export function resolvePath(str: string, obj: Record<string, any> | undefined): ResolvedPath {
    const segments = str.split('.');

    // Walk every segment but the leaf to reach the leaf's parent.
    let parent: any = obj;
    for (let i = 0; i < segments.length - 1; i++) {
        if (!hasOwn(parent, segments[i])) {
            return { exists: false, value: undefined };
        }
        parent = parent[segments[i]];
    }

    const leaf = segments[segments.length - 1];
    return hasOwn(parent, leaf)
        ? { exists: true, value: parent[leaf] }
        : { exists: false, value: undefined };
}
