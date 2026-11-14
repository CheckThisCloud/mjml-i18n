import {isMalformedPath, resolvePath, type ResolvedPath} from "../utils/resolvePath";
import {escapeDeep} from "../utils/escapeHtml";
import {ProcessorFunction} from "./ProcessorFunction";

// Distinguishes "no default supplied" from an explicit default of null/undefined.
const NO_FALLBACK = Symbol('no-fallback');

/** Loop variables of one `{{ for }}` iteration, keyed by the loop's alias. */
export type Frame = Record<string, unknown>;

export class GetFunction implements ProcessorFunction {

    /**
     * @param vars   the render's variables
     * @param frames loop variables, innermost first; built by withFrame(), not by hand
     */
    constructor(private vars: Record<string, any>, private frames: Frame[] = []) {
    }

    call(key: string, fallback: unknown = NO_FALLBACK): any {
        // A malformed path is a template-authoring typo, not missing data: surface it
        // distinctly and loudly, and never let a default mask it.
        if (isMalformedPath(key)) {
            return "Invalid variable path: '" + key + "'";
        }

        const missing = 'Missing variable: ' + key;
        const {exists, value} = this.resolve(key);

        if (!exists) {
            return missing; // absent (or a blocked prototype key)
        }
        if (value == null) {
            // present-but-null: the default applies only here. A default is template
            // text, so it is returned as written.
            return fallback === NO_FALLBACK ? missing : fallback;
        }
        // A value is data: it lands in element text and in attribute values, where an
        // unescaped `<` or `"` would turn it into markup.
        return escapeDeep(value);
    }

    /**
     * Raw lookup, unescaped. A loop variable owns its name: when a frame defines the
     * path's first segment, the rest of the path is looked up in that frame only, so a
     * typo after a loop variable stays loud instead of falling through to a global.
     */
    resolve(path: string): ResolvedPath {
        const head = path.split('.')[0];
        const frame = this.frames.find((candidate) => Object.prototype.hasOwnProperty.call(candidate, head));

        return resolvePath(path, frame ?? this.vars);
    }

    /** A copy that also sees `frame`, shadowing globals and outer frames of the same name. */
    withFrame(frame: Frame): GetFunction {
        return new GetFunction(this.vars, [frame, ...this.frames]);
    }
}
