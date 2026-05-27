import { createRequire } from 'node:module';
import I18nBlock from '../../src/component/I18nBlock';
import type { Preprocessor } from '../../src/index';
export type { Preprocessor };

// mjml v5 ships CJS; load it the same way scratch.ts does to sidestep interop.
const require = createRequire(import.meta.url);
const { registerComponent } = require('mjml-core');
const mjml = require('mjml');

// The custom <i18n> head component must be registered before rendering.
registerComponent(I18nBlock);

export type MjmlResult = { html: string; errors?: unknown[] };

export function render(src: string, preprocessors: Preprocessor[]): Promise<MjmlResult> {
  return mjml(src, { preprocessors });
}
