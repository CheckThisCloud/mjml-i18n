import {resolvePath} from "../utils/resolvePath";
import {ProcessorFunction} from "./ProcessorFunction";

// Distinguishes "no default supplied" from an explicit default of null/undefined.
const NO_FALLBACK = Symbol('no-fallback');

export class GetFunction implements ProcessorFunction {

    constructor(private vars: Record<string, any>) {
    }

    call(key: string, fallback: unknown = NO_FALLBACK): any {
        const missing = 'Missing variable: ' + key;
        const {exists, value} = resolvePath(key, this.vars);

        if (!exists) {
            return missing; // absent (or a blocked prototype key)
        }
        if (value == null) {
            // present-but-null: the default applies only here
            return fallback === NO_FALLBACK ? missing : fallback;
        }
        return value;
    }
}
