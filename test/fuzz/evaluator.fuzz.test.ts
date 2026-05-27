import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const pre = createPreprocessor({
  get: new GetFunction({ a: 1, b: { c: 2 } }),
  i18n: new I18nFunction('en'),
});

// Tokens biased toward plausibly-hostile expressions.
const token = fc.constantFrom(
  'get', 'i18n', '(', ')', '{', '}', "'a'", '"b"', '.', '+', ',',
  '__proto__', 'constructor', 'prototype', 'x', '1', ' ', '...', '=>', '`', '[', ']', '&&', '?', ':',
);
const expr = fc.array(token, { maxLength: 16 }).map((parts) => parts.join(''));

const protoOwnPropsBefore = Object.getOwnPropertyNames(Object.prototype).length;

describe('fuzz: evaluator invariants', () => {
  it('never throws, never pollutes the prototype, and returns a string', () => {
    fc.assert(
      fc.property(expr, (e) => {
        const input = `{{ ${e} }}`;
        let out: unknown;
        expect(() => { out = pre(input); }).not.toThrow();
        expect(typeof out).toBe('string');
        // Stronger than checking one key name: a pollution of ANY key grows this count.
        expect(Object.getOwnPropertyNames(Object.prototype).length).toBe(protoOwnPropsBefore);
      }),
      { numRuns: 2000 },
    );
  });
});
