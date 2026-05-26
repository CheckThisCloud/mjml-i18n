
import jsep from "jsep";
import jsepObject from "@jsep-plugin/object";
import {ProcessorFunction} from "./functions/ProcessorFunction";

jsep.plugins.register(jsepObject);

export function createPreprocessor(allowedFunctions: Record<string, ProcessorFunction>) {

    function callPreHooks(xml: string) {
        for(const allowedFunc of Object.values(allowedFunctions)) {
            if(typeof allowedFunc.preHook === 'function') {
                allowedFunc.preHook(xml);
            }
        }
    }

    function evaluate(node: any): unknown {
        switch (node.type) {
            case 'Literal':
                return node.value;
            case 'CallExpression': {
                const fnName = node.callee?.name;
                if (!allowedFunctions[fnName]) {
                    throw new Error('Unknown function: ' + fnName);
                }
                const args = node.arguments.map(evaluate);
                return allowedFunctions[fnName].call(...args);
            }
            case 'ObjectExpression':
                return Object.fromEntries(
                    node.properties.map((p: any) => [
                        p.key.name ?? p.key.value,
                        evaluate(p.value),
                    ]),
                );
            default:
                throw new Error('Unsupported expression: ' + node.type);
        }
    }

    function evaluateExpression(expression: string): unknown {
        const node = jsep(expression);
        return evaluate(node);
    }

    return function(xml: string) {
        callPreHooks(xml);

        return xml.replace(/{{(.+?)}}/g, (whole: string, inner: string) => {
            try {
                return String(evaluateExpression(inner.trim()));
            } catch {
                return whole; // unknown/unsupported -> leave the marker untouched
            }
        });
    }
}