
import jsep from "jsep";
import jsepObject from "@jsep-plugin/object";
import {ProcessorFunction} from "./functions/ProcessorFunction";
import {GetFunction} from "./functions/GetFunction";
import {isMalformedPath, type ResolvedPath} from "./utils/resolvePath";
import {parseTemplate, type Node} from "./blocks/parseTemplate";

jsep.plugins.register(jsepObject);

export type Preprocessor = (xml: string) => string;

type Functions = Record<string, ProcessorFunction>;

/** The variable lookup block statements need; GetFunction provides it. */
type Scope = ProcessorFunction & {
    resolve(path: string): ResolvedPath;
    withFrame(frame: Record<string, unknown>): Scope;
};

function isScope(candidate: unknown): candidate is Scope {
    return typeof (candidate as Scope | undefined)?.resolve === 'function'
        && typeof (candidate as Scope | undefined)?.withFrame === 'function';
}

function isTruthy(value: unknown): boolean {
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function createPreprocessor(allowedFunctions: Functions): Preprocessor {

    function callPreHooks(xml: string) {
        for(const allowedFunc of Object.values(allowedFunctions)) {
            if(typeof allowedFunc.preHook === 'function') {
                allowedFunc.preHook(xml);
            }
        }
    }

    function callTransforms(xml: string): string {
        for(const allowedFunc of Object.values(allowedFunctions)) {
            if(typeof allowedFunc.transform === 'function') {
                xml = allowedFunc.transform(xml);
            }
        }
        return xml;
    }

    function evaluate(node: any, functions: Functions): unknown {
        switch (node.type) {
            case 'Literal':
                return node.value;
            case 'CallExpression': {
                const fnName = node.callee?.name;
                if (!functions[fnName]) {
                    throw new Error('Unknown function: ' + fnName);
                }
                const args = node.arguments.map((arg: any) => evaluate(arg, functions));
                return functions[fnName].call(...args);
            }
            case 'ObjectExpression':
                return Object.fromEntries(
                    node.properties.map((p: any) => [
                        p.key.name ?? p.key.value,
                        evaluate(p.value, functions),
                    ]),
                );
            default:
                throw new Error('Unsupported expression: ' + node.type);
        }
    }

    function evaluateExpression(expression: string, functions: Functions): unknown {
        const node = jsep(expression);
        return evaluate(node, functions);
    }

    /**
     * Reads a block statement's path, or returns the message to print instead: the same
     * sentinels get() prints, so a typo in a block is as loud as a typo in a marker.
     */
    function read(path: string, scope: Scope): { value: unknown } | { message: string } {
        if (isMalformedPath(path)) {
            return { message: "Invalid variable path: '" + path + "'" };
        }
        const {exists, value} = scope.resolve(path);
        if (!exists) {
            return { message: 'Missing variable: ' + path };
        }
        return { value };
    }

    function render(nodes: Node[], scope: Scope, functions: Functions): string {
        let out = '';
        for (const node of nodes) {
            switch (node.kind) {
                case 'text':
                    out += node.text;
                    break;
                case 'error':
                    out += node.message;
                    break;
                case 'expression':
                    try {
                        out += String(evaluateExpression(node.source, functions));
                    } catch {
                        out += node.marker; // unknown/unsupported -> leave the marker untouched
                    }
                    break;
                case 'if': {
                    const result = read(node.path, scope);
                    if ('message' in result) {
                        out += result.message;
                        break;
                    }
                    out += render(isTruthy(result.value) ? node.then : node.otherwise, scope, functions);
                    break;
                }
                case 'for': {
                    const result = read(node.path, scope);
                    if ('message' in result) {
                        out += result.message;
                        break;
                    }
                    if (result.value == null) {
                        break; // an optional list that is not there: nothing to repeat
                    }
                    if (!Array.isArray(result.value)) {
                        out += 'Not a list: ' + node.path;
                        break;
                    }
                    for (const item of result.value) {
                        const inner = scope.withFrame({ [node.alias]: item });
                        // get() is the scope itself, so the body's markers see the alias too.
                        const innerFunctions = functions.get === scope ? { ...functions, get: inner } : functions;
                        out += render(node.body, inner, innerFunctions);
                    }
                    break;
                }
            }
        }
        return out;
    }

    return function(xml: string) {
        callPreHooks(xml);

        // Strip config blocks (e.g. <i18n>) before resolving markers, so they never
        // reach mjml-core and markers inside a stripped block aren't processed.
        xml = callTransforms(xml);

        // Without a get() that can scope, block statements see no variables at all.
        const scope = isScope(allowedFunctions.get) ? allowedFunctions.get : new GetFunction({});

        try {
            return render(parseTemplate(xml), scope, allowedFunctions);
        } catch {
            // Only a pathological template gets here (blocks nested deep enough to exhaust
            // the stack). Like an unsupported marker, it is left as written.
            return xml;
        }
    }
}
