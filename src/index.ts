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
 * Ensures the <i18n> head component is registered.
 *
 * `get` (variable interpolation) is always wired and never depends on `locale`.
 * `i18n` (translation) needs a locale to pick a language; `locale` is therefore
 * optional and its absence is governed by an explicit policy:
 *
 *   - `'passthrough'` (default): `i18n` is not wired, so `{{ i18n(...) }}` markers
 *     are left literally untouched — a visible, detectable signal rather than a
 *     silently wrong-language render.
 *   - `'default'`: translate against `defaultLocale` (which is then required).
 *
 * A provided `locale` always wins over `defaultLocale`.
 */
export function createI18nPreprocessor(opts: {
  vars?: Record<string, unknown>;
  locale?: string;
  onMissingLocale?: 'passthrough' | 'default';
  defaultLocale?: string;
}): Preprocessor {
  registerI18nComponent();

  const { vars, locale, onMissingLocale = 'passthrough', defaultLocale } = opts;

  if (onMissingLocale === 'default' && defaultLocale === undefined) {
    throw new Error(
      "createI18nPreprocessor: onMissingLocale 'default' requires a defaultLocale.",
    );
  }

  const functions: Record<string, ProcessorFunction> = {
    get: new GetFunction(vars ?? {}),
  };

  const effectiveLocale =
    locale ?? (onMissingLocale === 'default' ? defaultLocale : undefined);

  if (effectiveLocale !== undefined) {
    functions.i18n = new I18nFunction(effectiveLocale);
  }

  return createPreprocessor(functions);
}
