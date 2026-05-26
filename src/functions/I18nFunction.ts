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

        // Extract jsonp from <i18n>
        const parser = new XMLParser();
        const doc = parser.parse(xml,);

        if (doc.mjml.i18n) {
            this.translations = JSON.parse(doc.mjml.i18n);
        }
    }
}