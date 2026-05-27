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
        // Only use an OWN locale table — never an inherited one — so a hostile locale
        // like "constructor"/"__proto__"/"toString" can't leak prototype internals.
        const table = Object.prototype.hasOwnProperty.call(this.translations, this.locale)
            ? this.translations[this.locale]
            : undefined;
        const message = dotWalk(key, table) ?? key;
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
            const parsed = JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object') {
                this.translations = parsed;
            }
        } catch {
            // malformed <i18n> JSON -> degrade to no translations
        }
    }
}