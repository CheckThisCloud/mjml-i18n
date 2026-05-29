import { describe, it, expect } from 'vitest';
import { createI18nPreprocessor } from '../../src/index';

const xml = `<mjml>
  <i18n type="json">{ "cs": { "hello-world": "Ahoj světe" }, "en": { "hello-world": "Hello world" } }</i18n>
  <mj-body><mj-text>{{ i18n('hello-world') }} — {{ get('name') }}</mj-text></mj-body>
</mjml>`;

// The preprocessor does not strip the <i18n> block (mjml-core does that), so its
// raw JSON still contains every translation value. Assert on the rendered marker
// region only, never the whole document.
const body = (out: string): string =>
  out.match(/<mj-text>(.*?)<\/mj-text>/s)?.[1] ?? '';

describe('createI18nPreprocessor: locale is optional', () => {
  it('resolves get() when locale is omitted (interpolation does not depend on locale)', () => {
    const pre = createI18nPreprocessor({ vars: { name: 'Ada' } });
    expect(body(pre(xml))).toContain('Ada');
  });

  it('leaves i18n() markers untouched when locale is omitted (default passthrough policy)', () => {
    const pre = createI18nPreprocessor({ vars: { name: 'Ada' } });
    expect(body(pre(xml))).toBe("{{ i18n('hello-world') }} — Ada");
  });

  it('still resolves i18n() when a locale is provided', () => {
    const pre = createI18nPreprocessor({ locale: 'cs', vars: { name: 'Ada' } });
    expect(body(pre(xml))).toBe('Ahoj světe — Ada');
  });
});

describe('createI18nPreprocessor: onMissingLocale="default"', () => {
  it('resolves i18n() via defaultLocale when locale is omitted', () => {
    const pre = createI18nPreprocessor({
      onMissingLocale: 'default',
      defaultLocale: 'en',
    });
    expect(body(pre(xml))).toContain('Hello world');
  });

  it('prefers the requested locale over defaultLocale when both are present', () => {
    const pre = createI18nPreprocessor({
      locale: 'cs',
      onMissingLocale: 'default',
      defaultLocale: 'en',
    });
    expect(body(pre(xml))).toContain('Ahoj světe');
    expect(body(pre(xml))).not.toContain('Hello world');
  });

  it('throws at construction when onMissingLocale="default" but no defaultLocale given', () => {
    expect(() =>
      createI18nPreprocessor({ onMissingLocale: 'default' }),
    ).toThrow();
  });
});
