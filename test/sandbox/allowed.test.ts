import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const I18N_XML =
  '<mjml><i18n type="json">{ "en": { "hello": "Hello", "greet": "Hi {name}" } }</i18n><mj-body></mj-body></mjml>';

function pre(vars: Record<string, unknown> = {}) {
  const i18n = new I18nFunction('en');
  i18n.preHook(I18N_XML);
  return createPreprocessor({ get: new GetFunction(vars), i18n });
}

describe('sandbox: allowed expressions', () => {
  it('resolves a simple i18n marker', () => {
    expect(pre()('x {{ i18n("hello") }} y')).toBe('x Hello y');
  });

  it('resolves a get marker with a string literal arg', () => {
    expect(pre({ name: 'Ada' })('{{ get("name") }}')).toBe('Ada');
  });

  it('passes a number literal arg through', () => {
    // i18n("greet") has no {0}; number arg is simply accepted without throwing
    expect(pre()('{{ i18n("greet", { name: 7 }) }}')).toBe('Hi 7');
  });

  it('resolves an object-expression argument', () => {
    expect(pre()('{{ i18n("greet", { name: "Ada" }) }}')).toBe('Hi Ada');
  });

  it('resolves a nested call inside an object arg (bottom-up eval)', () => {
    expect(pre({ userName: 'Bob' })('{{ i18n("greet", { name: get("userName") }) }}')).toBe('Hi Bob');
  });

  it('resolves multiple markers in one input', () => {
    expect(pre({ name: 'Ada' })('{{ i18n("hello") }}, {{ get("name") }}')).toBe('Hello, Ada');
  });

  it('trims whitespace inside the marker', () => {
    expect(pre()('{{    i18n("hello")    }}')).toBe('Hello');
  });

  it('forwards a get default literal for a present-but-null value', () => {
    expect(pre({ k: null })('{{ get("k", "fallback") }}')).toBe('fallback');
  });

  it('resolves a nested get(...) as the default', () => {
    expect(pre({ k: null, other: 'Bob' })('{{ get("k", get("other")) }}')).toBe('Bob');
  });
});
