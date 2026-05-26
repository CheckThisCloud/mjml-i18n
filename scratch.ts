import { registerComponent } from 'mjml-core';
import { readFileSync, writeFileSync } from 'node:fs';
import I18nBlock from "./src/component/I18nBlock";
import {createPreprocessor} from "./src/createPreprocessor";
import {GetFunction} from "./src/functions/GetFunction";
import {I18nFunction} from "./src/functions/I18nFunction";

const mjml = require('mjml');

const preprocessor = createPreprocessor({
    'get': new GetFunction({}),
    'i18n': new I18nFunction('cs'),
});


async function main() {

    registerComponent(I18nBlock);

    const src = readFileSync('./fixture.mjml', 'utf8');
    const { html, errors } = await mjml(src, {
        preprocessors: [
            preprocessor
        ]
    });

    if (errors?.length) {
        console.error(errors);
    }

    writeFileSync('./out.html', html);
    console.log('ok');
}

main();