import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre() {
  return createPreprocessor({ get: new GetFunction({ a: 1 }), i18n: new I18nFunction('en') });
}

describe('sandbox: rejected expressions are left verbatim', () => {
  it.each([
    ['unknown function', '{{ nope() }}'],
    ['bare identifier', '{{ x }}'],
    ['member access', '{{ a.b }}'],
    ['member access on a function name', '{{ get.x }}'],
    ['binary operator', '{{ 1 + 2 }}'],
    ['logical operator', '{{ a && b }}'],
    ['ternary', '{{ a ? b : c }}'],
    ['unary', '{{ -1 }}'],
    ['comparison', '{{ 1 < 2 }}'],
    ['array literal', '{{ [1, 2] }}'],
    ['arrow function', '{{ () => 1 }}'],
    ['template literal', '{{ `x` }}'],
    ['assignment', '{{ a = 1 }}'],
    ['sequence', '{{ a, b }}'],
    ['spread in args', '{{ get("a", ...b) }}'],
    ['empty marker (with space)', '{{ }}'],
  ])('leaves %s untouched', (_label, input) => {
    expect(pre()(input)).toBe(input);
  });

  it('does not match an empty {{}} with no inner content', () => {
    expect(pre()('{{}}')).toBe('{{}}');
  });

  it('resolves valid markers but leaves an invalid one beside them', () => {
    const i18n = new I18nFunction('en');
    i18n.preHook('<mjml><i18n type="json">{ "en": { "hi": "Hello" } }</i18n><mj-body></mj-body></mjml>');
    const p = createPreprocessor({ get: new GetFunction({}), i18n });
    expect(p('{{ i18n("hi") }} {{ 1 + 2 }}')).toBe('Hello {{ 1 + 2 }}');
  });
});
