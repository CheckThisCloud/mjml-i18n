import { describe, it, expect } from 'vitest';
import { I18nFunction } from '../../src/functions/I18nFunction';

const xml = `<mjml>
  <i18n type="json">{ "cs": { "hello": "Ahoj", "deep": { "key": "X" }, "greet": "Hi {name}" },
    "en": { "hello": "Hello" } }</i18n>
  <mj-body></mj-body>
</mjml>`;

describe('I18nFunction', () => {
  it('falls back to the key when called before preHook', () => {
    expect(new I18nFunction('cs').call('hello')).toBe('hello');
  });

  it('returns a translated string after preHook loads the <i18n> block', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('hello')).toBe('Ahoj');
  });

  it('resolves a nested translation key', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('deep.key')).toBe('X');
  });

  it('falls back to the key for a missing translation', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('absent')).toBe('absent');
  });

  it('applies params via format', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('greet', { name: 'Ada' })).toBe('Hi Ada');
  });

  it('falls back to the key when the locale is absent', () => {
    const fn = new I18nFunction('de');
    fn.preHook(xml);
    expect(fn.call('hello')).toBe('hello');
  });
});

describe('I18nFunction.preHook robustness (hostile input)', () => {
  it('does not throw on rootless / non-mjml XML', () => {
    const fn = new I18nFunction('cs');
    expect(() => fn.preHook('just text, no root element')).not.toThrow();
    expect(fn.call('hello')).toBe('hello'); // degrades to no translations
  });

  it('does not throw when there is no <i18n> block', () => {
    const fn = new I18nFunction('cs');
    expect(() => fn.preHook('<mjml><mj-body></mj-body></mjml>')).not.toThrow();
    expect(fn.call('hello')).toBe('hello');
  });

  it('does not throw on malformed <i18n> JSON', () => {
    const fn = new I18nFunction('cs');
    const bad = '<mjml><i18n type="json">{ not valid json }</i18n><mj-body></mj-body></mjml>';
    expect(() => fn.preHook(bad)).not.toThrow();
    expect(fn.call('hello')).toBe('hello');
  });
});

describe('I18nFunction hostile locale / translations (threat model)', () => {
  it('does not leak prototype internals when the locale is a prototype key', () => {
    const fn = new I18nFunction('constructor');
    fn.preHook(xml); // 'constructor' is NOT an own locale in the loaded table
    expect(fn.call('name')).toBe('name'); // must be key fallback, never 'Object'
  });

  it('falls back to the key for a toString / __proto__ locale', () => {
    const a = new I18nFunction('toString');
    a.preHook(xml);
    expect(a.call('name')).toBe('name'); // never 'toString'
    const b = new I18nFunction('__proto__');
    b.preHook(xml);
    expect(b.call('hello')).toBe('hello');
  });

  it('ignores a non-object <i18n> payload (null / string) and degrades to no translations', () => {
    const fn = new I18nFunction('cs');
    fn.preHook('<mjml><i18n type="json">null</i18n><mj-body></mj-body></mjml>');
    expect(fn.call('hello')).toBe('hello');
    const fn2 = new I18nFunction('cs');
    fn2.preHook('<mjml><i18n type="json">"justastring"</i18n><mj-body></mj-body></mjml>');
    expect(fn2.call('hello')).toBe('hello');
  });
});
