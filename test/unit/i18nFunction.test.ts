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
