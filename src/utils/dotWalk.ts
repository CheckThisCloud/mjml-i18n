import {resolvePath} from "./resolvePath";

// Resolve a dot-path to its value, or undefined when the path doesn't fully exist.
// Callers that need to tell "absent" from "present-but-null" should use resolvePath.
export function dotWalk(str: string, obj: Record<string, any> | undefined): any {
    return resolvePath(str, obj).value;
}
