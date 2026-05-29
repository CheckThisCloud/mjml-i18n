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
            // stopNodes keeps the <i18n> body as RAW text instead of parsing its
            // contents as child XML — so translation values may contain markup
            // (<strong>…</strong>), bare & and < without breaking extraction.
            const doc = new XMLParser({ stopNodes: ['mjml.i18n'] }).parse(xml);
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

    transform(xml: string): string {
        // Remove the <i18n> config block before the XML reaches mjml-core. mjml
        // would otherwise try to parse any markup inside it as child components
        // and reject it ("Element strong doesn't exist"). The block is plain JSON,
        // so </i18n> never appears inside it -> a non-greedy match is safe.
        return xml.replace(/<i18n\b[^>]*>[\s\S]*?<\/i18n>/gi, '');
    }
}