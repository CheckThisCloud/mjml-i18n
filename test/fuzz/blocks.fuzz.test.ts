import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const pre = createPreprocessor({
  get: new GetFunction({ xs: [1, 2], ys: [], a: true, b: 0, n: null, obj: { list: ['x'] }, s: '<&>' }),
  i18n: new I18nFunction('en'),
});

// Statements and markers in any order, balanced or not, plus text between them.
const piece = fc.constantFrom(
  '{{ for x in xs }}', '{{ for y in ys }}', '{{ for z in obj.list }}', '{{ for q in missing }}',
  '{{ for x in a }}', '{{ for __proto__ in xs }}', '{{ endfor }}',
  '{{ if a }}', '{{ if b }}', '{{ if n }}', '{{ if missing }}', '{{ if x }}', '{{ if a.. }}',
  '{{ else }}', '{{ endif }}',
  '{{ get("x") }}', '{{ get("s") }}', '{{ get("constructor") }}', '{{ i18n("k") }}', '{{ 1 + 2 }}',
  'text', '<mj-text>', '</mj-text>', '{', '}', '{{', '}}', ' ', '\n',
);
const template = fc.array(piece, { maxLength: 40 }).map((parts) => parts.join(''));

const protoOwnPropsBefore = Object.getOwnPropertyNames(Object.prototype).length;

describe('fuzz: block invariants', () => {
  it('never throws, never pollutes the prototype, and returns a string', () => {
    fc.assert(
      fc.property(template, (t) => {
        let out: unknown;
        expect(() => { out = pre(t); }).not.toThrow();
        expect(typeof out).toBe('string');
        expect(Object.getOwnPropertyNames(Object.prototype).length).toBe(protoOwnPropsBefore);
      }),
      { numRuns: 3000 },
    );
  });

  it('never lets a raw value character through from vars', () => {
    fc.assert(
      fc.property(template, (t) => {
        // `s` holds "<&>"; wherever it is printed it must arrive escaped.
        const out = pre(t);
        const printedRaw = out.includes('<&>') && !t.includes('<&>');
        expect(printedRaw).toBe(false);
      }),
      { numRuns: 3000 },
    );
  });

  it('is deterministic for the same template', () => {
    fc.assert(
      fc.property(template, (t) => {
        expect(pre(t)).toBe(pre(t));
      }),
      { numRuns: 500 },
    );
  });

  it('renders a balanced if/else as exactly one of its branches', () => {
    const word = fc.stringMatching(/^[a-z]{1,8}$/);
    fc.assert(
      fc.property(fc.boolean(), word, word, (flag, yes, no) => {
        const p = createPreprocessor({ get: new GetFunction({ flag }) });
        expect(p(`{{ if flag }}${yes}{{ else }}${no}{{ endif }}`)).toBe(flag ? yes : no);
      }),
    );
  });

  it('repeats a for body exactly once per item', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 999 }), { maxLength: 50 }), (items) => {
        const p = createPreprocessor({ get: new GetFunction({ items }) });
        expect(p('{{ for i in items }}{{ get("i") }};{{ endfor }}')).toBe(items.map((i) => `${i};`).join(''));
      }),
    );
  });
});
