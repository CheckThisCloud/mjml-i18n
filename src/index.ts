import { registerComponent } from 'mjml-core';
import I18nBlock from './component/I18nBlock';
import { createPreprocessor, type Preprocessor } from './createPreprocessor';
import { GetFunction } from './functions/GetFunction';
import { I18nFunction } from './functions/I18nFunction';
import type { ProcessorFunction } from './functions/ProcessorFunction';

export { createPreprocessor, GetFunction, I18nFunction };
export type { Preprocessor, ProcessorFunction };

let registered = false;

/** Register the <i18n> head component with mjml-core. Idempotent. */
export function registerI18nComponent(): void {
  if (registered) return;
  registerComponent(I18nBlock);
  registered = true;
}

/**
 * Convenience factory wiring the standard `get` + `i18n` functions for one render.
 * Ensures the <i18n> head component is registered. `vars` is optional.
 */
export function createI18nPreprocessor(opts: {
  vars?: Record<string, unknown>;
  locale: string;
}): Preprocessor {
  registerI18nComponent();
  return createPreprocessor({
    get: new GetFunction(opts.vars ?? {}),
    i18n: new I18nFunction(opts.locale),
  });
}
