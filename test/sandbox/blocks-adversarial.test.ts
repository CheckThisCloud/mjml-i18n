import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre(vars: Record<string, unknown> = {}) {
  return createPreprocessor({ get: new GetFunction(vars), i18n: new I18nFunction('en') });
}

const protoKeysBefore = Object.getOwnPropertyNames(Object.prototype).length;

describe('sandbox: blocks under adversarial input', () => {
  it('does not throw on blocks nested deep enough to exhaust the stack', () => {
    const depth = 20000;
    const input = '{{ if a }}'.repeat(depth) + 'x' + '{{ endif }}'.repeat(depth);
    let out: string | undefined;
    expect(() => { out = pre({ a: true })(input); }).not.toThrow();
    expect(out).toBe(input); // too deep to render -> left as written, like an unsupported marker
  });

  it('renders moderately deep nesting correctly', () => {
    const depth = 200;
    const input = '{{ if a }}'.repeat(depth) + 'x' + '{{ endif }}'.repeat(depth);
    expect(pre({ a: true })(input)).toBe('x');
  });

  it('does not throw on thousands of unclosed blocks', () => {
    const input = '{{ for x in xs }}'.repeat(5000);
    let out: string | undefined;
    expect(() => { out = pre({ xs: [] })(input); }).not.toThrow();
    expect(typeof out).toBe('string');
  });

  it('does not throw on thousands of stray closing statements', () => {
    const input = '{{ endif }}{{ endfor }}{{ else }}'.repeat(5000);
    expect(() => pre()(input)).not.toThrow();
  });

  it('does not pollute the prototype through a __proto__ alias', () => {
    const out = pre({ xs: [{ polluted: true }] })('{{ for __proto__ in xs }}{{ get("__proto__.polluted") }}{{ endfor }}');
    expect(out).toBe('Missing variable: __proto__.polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).length).toBe(protoKeysBefore);
  });

  it.each(['constructor', 'prototype', '__proto__'])('cannot iterate the prototype chain through %s', (key) => {
    expect(pre({ a: [1] })(`{{ for x in a.${key} }}x{{ endfor }}`)).toBe(`Missing variable: a.${key}`);
  });

  it.each(['constructor', 'prototype', '__proto__'])('cannot branch on the prototype chain through %s', (key) => {
    expect(pre({ a: {} })(`{{ if a.${key} }}T{{ else }}F{{ endif }}`)).toBe(`Missing variable: a.${key}`);
  });

  it('does not re-evaluate a value that looks like a marker', () => {
    // A value is data: printing `{{ get("secret") }}` must not resolve it.
    const out = pre({ secret: 's3cret', items: ['{{ get("secret") }}'] })('{{ for i in items }}{{ get("i") }}{{ endfor }}');
    expect(out).not.toContain('s3cret');
  });

  it('does not treat a value that looks like a block statement as a block', () => {
    const out = pre({ items: ['{{ endfor }}', 'b'] })('{{ for i in items }}[{{ get("i") }}]{{ endfor }}');
    expect(out).toBe('[{{ endfor }}][b]');
  });

  it('leaves statements inside the stripped <i18n> block alone', () => {
    const i18n = new I18nFunction('en');
    const xml = '<mjml><i18n type="json">{ "en": { "k": "{{ for x in xs }}" } }</i18n><mj-body>{{ i18n("k") }}</mj-body></mjml>';
    i18n.preHook(xml);
    const p = createPreprocessor({ get: new GetFunction({ xs: [1, 2] }), i18n });
    // The translation is printed as text; its content is not parsed as a block.
    expect(p(xml)).toBe('<mjml><mj-body>{{ for x in xs }}</mj-body></mjml>');
  });

  it('expands a large list without trouble', () => {
    const items = Array.from({ length: 10000 }, (_, i) => i);
    const out = pre({ items })('{{ for i in items }}{{ get("i") }},{{ endfor }}');
    expect(out.split(',').length - 1).toBe(10000);
  });

  it('returns quickly for a long run of opening braces next to statements (ReDoS sanity)', () => {
    // The marker match starts at the first `{{`, so the braces swallow `if a` into one
    // unsupported marker (left verbatim) and the endif is then a stray. The guard here
    // is Vitest's timeout: catastrophic backtracking would time out.
    const input = '{'.repeat(50000) + '{{ if a }}x{{ endif }}';
    let out: string | undefined;
    expect(() => { out = pre({ a: true })(input); }).not.toThrow();
    expect(out).toBe('{'.repeat(50000) + '{{ if a }}xUnexpected endif');
  });
});
