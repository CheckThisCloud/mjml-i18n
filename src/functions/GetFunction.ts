import {ProcessorFunction} from "./ProcessorFunction";

// Block prototype-chain keys so a path can't read constructor/__proto__ into output
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

// Distinguishes "no default supplied" from an explicit default of null/undefined.
const NO_FALLBACK = Symbol('no-fallback');

function hasOwn(parent: any, key: string): boolean {
    return !BLOCKED.has(key)
        && parent != null
        && typeof parent === 'object'
        && Object.prototype.hasOwnProperty.call(parent, key);
}

export class GetFunction implements ProcessorFunction {

    constructor(private vars: Record<string, any>) {
    }

    call(key: string, fallback: unknown = NO_FALLBACK): any {
        const missing = 'Missing variable: ' + key;
        const segments = key.split('.');

        // Walk every segment but the last to reach the final value's parent.
        // A missing key on any parent means the path is absent -> sentinel.
        let parent: any = this.vars;
        for (let i = 0; i < segments.length - 1; i++) {
            if (!hasOwn(parent, segments[i])) {
                return missing;
            }
            parent = parent[segments[i]];
        }

        const final = segments[segments.length - 1];
        if (!hasOwn(parent, final)) {
            return missing; // absent
        }

        const value = parent[final];
        if (value == null) {
            // present-but-null: the default applies only here
            return fallback === NO_FALLBACK ? missing : fallback;
        }
        return value;
    }
}
