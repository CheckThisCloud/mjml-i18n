import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre(vars: Record<string, unknown> = {}) {
  return createPreprocessor({ get: new GetFunction(vars), i18n: new I18nFunction('en') });
}

describe('sandbox: adversarial', () => {
  it('does not pollute Object.prototype via a get() proto path', () => {
    pre({ a: 1 })('{{ get("__proto__.polluted") }}');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not pollute Object.prototype via an object-expression __proto__ key', () => {
    pre()('{{ i18n("k", { "__proto__": { "polluted": true } }) }}');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not throw on a deeply nested expression (recursion DoS)', () => {
    const depth = 5000;
    const input = `{{ ${'get('.repeat(depth)}'a'${')'.repeat(depth)} }}`;
    let out: string | undefined;
    expect(() => { out = pre({ a: 1 })(input); }).not.toThrow();
    expect(typeof out).toBe('string');
  });

  it('leaves an unterminated marker literal (no hang)', () => {
    const input = '{{ i18n("hello"'; // no closing }}
    expect(pre()(input)).toBe(input);
  });

  it('returns quickly and unchanged for a long no-marker string (ReDoS sanity)', () => {
    const input = '{'.repeat(100000);
    expect(pre()(input)).toBe(input);
  });
});
