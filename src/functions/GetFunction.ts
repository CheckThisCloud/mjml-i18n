import {isMalformedPath, resolvePath} from "../utils/resolvePath";
import {ProcessorFunction} from "./ProcessorFunction";

// Distinguishes "no default supplied" from an explicit default of null/undefined.
const NO_FALLBACK = Symbol('no-fallback');

export class GetFunction implements ProcessorFunction {

    constructor(private vars: Record<string, any>) {
    }

    call(key: string, fallback: unknown = NO_FALLBACK): any {
        // A malformed path is a template-authoring typo, not missing data: surface it
        // distinctly and loudly, and never let a default mask it.
        if (isMalformedPath(key)) {
            return "Invalid variable path: '" + key + "'";
        }

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
