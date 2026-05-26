import {dotWalk} from "../utils/dotWalk";
import {ProcessorFunction} from "./ProcessorFunction";
import {format} from "../utils/format";
import {XMLParser} from "fast-xml-parser";

export class I18nFunction implements ProcessorFunction
{

    private translations: Record<string, any> = {};

    constructor(private locale: string) {
    };

    call(key: string, params: Record<string, unknown> = {}): any {
        const message = dotWalk(key, this.translations[this.locale]) ?? key;

        return format(message, params);
    }

    preHook(xml: string) {
        let raw: unknown;
        try {
            const doc = new XMLParser().parse(xml);
            raw = doc?.mjml?.i18n;
        } catch {
            return; // unparseable XML -> no translations
        }

        if (typeof raw !== 'string') {
            return; // no <i18n> block (or unexpected shape) -> no translations
        }

        try {
            this.translations = JSON.parse(raw);
        } catch {
            // malformed <i18n> JSON -> degrade to no translations
        }
    }
}