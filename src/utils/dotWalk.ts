// Block prototype-chain keys so a path can't read constructor/__proto__ into output
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

export function dotWalk(str: string, obj: Record<string, any> | undefined): any {
    // Splits the string by each dot
    return str.split('.')
        // iterate the string, passing back
        // the property at each path
        .reduce<any>((result, path) => {
            return BLOCKED.has(path) ? undefined : result?.[path];

            // pass in the original object to begin with
        }, obj);
}