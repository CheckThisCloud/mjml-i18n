export interface ProcessorFunction {
    call: (...args: any[]) => number|string;
    /** Read-only pass over the raw XML to populate state (e.g. load translations). */
    preHook?: (xml: string) => void;
    /** Rewrite the XML before markers are resolved (e.g. strip a config block). */
    transform?: (xml: string) => string;
}