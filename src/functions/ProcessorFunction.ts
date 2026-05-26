export interface ProcessorFunction {
    call: (...args: any[]) => number|string;
    preHook?: (xml: string) => void;
}