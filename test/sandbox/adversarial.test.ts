import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre(vars: Record<string, unknown> = {}) {
  return createPreprocessor({ get: new GetFunction(vars), i18n: new I18nFunction('en') });
}

describe('sandbox: adversarial', () => {
  it('blocks prototype keys in get() paths (no leak) and does not pollute', () => {
    // With dotWalk's BLOCKED set, a prototype key resolves to the missing-variable
    // fallback rather than leaking the real constructor/prototype object into output.
    // This assertion FAILS if the BLOCKED guard is removed (output would become the
    // stringified constructor), so it is a genuine regression detector.
    const out = pre({ a: 1 })('{{ get("constructor") }}');
    expect(out).toBe('Missing variable: constructor');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('resolves an object-expression __proto__ key cleanly without polluting', () => {
    // Building the object arg via Object.fromEntries makes "__proto__" an OWN property,
    // never touching Object.prototype. i18n("k") has no loaded translations -> key 'k'.
    const out = pre()('{{ i18n("k", { "__proto__": { "polluted": true } }) }}');
    expect(out).toBe('k');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not throw on a deeply nested expression (recursion DoS)', () => {
    const depth = 5000;
    const input = `{{ ${'get('.repeat(depth)}'a'${')'.repeat(depth)} }}`;
    let out: string | undefined;
    expect(() => { out = pre({ a: 1 })(input); }).not.toThrow();
    expect(typeof out).toBe('string');
    expect(out).toBe(input); // unresolved under stack/type failure -> marker left verbatim
  });

  it('leaves an unterminated marker literal (no hang)', () => {
    const input = '{{ i18n("hello"'; // no closing }}
    expect(pre()(input)).toBe(input);
  });

  it('returns quickly and unchanged for a long no-marker string (ReDoS sanity)', () => {
    const input = '{'.repeat(100000);
    // The meaningful guard here is Vitest's test timeout: catastrophic backtracking
    // would time out rather than fail the equality assertion.
    expect(pre()(input)).toBe(input);
  });
});
