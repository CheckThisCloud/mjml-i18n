import {dotWalk} from "../utils/dotWalk";
import {ProcessorFunction} from "./ProcessorFunction";

export class GetFunction implements ProcessorFunction {

    constructor(private vars: Record<string, any>) {
    }

    call(key: string): any {
        return dotWalk(key, this.vars) ?? 'Missing variable: ' + key + '';
    }
}