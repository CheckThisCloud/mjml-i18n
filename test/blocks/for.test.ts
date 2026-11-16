import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const I18N_XML = `<mjml><i18n type="json">{
  "en": { "guests": "{count} guests", "line": "{name}: {count}", "title": "Today" }
}</i18n><mj-body></mj-body></mjml>`;

function pre(vars: Record<string, unknown> = {}) {
  const i18n = new I18nFunction('en');
  i18n.preHook(I18N_XML);
  return createPreprocessor({ get: new GetFunction(vars), i18n });
}

describe('blocks: for', () => {
  it('repeats the body once per item', () => {
    expect(pre({ items: [1, 2, 3] })('{{ for item in items }}x{{ endfor }}')).toBe('xxx');
  });

  it('exposes the item under the alias', () => {
    expect(pre({ items: ['a', 'b'] })('{{ for item in items }}[{{ get("item") }}]{{ endfor }}')).toBe('[a][b]');
  });

  it('exposes item fields through a dot-path', () => {
    const vars = { orders: [{ id: 7, total: 10 }, { id: 8, total: 20 }] };
    expect(pre(vars)('{{ for order in orders }}#{{ get("order.id") }}={{ get("order.total") }};{{ endfor }}'))
      .toBe('#7=10;#8=20;');
  });

  it('keeps the original order', () => {
    expect(pre({ n: [3, 1, 2] })('{{ for x in n }}{{ get("x") }}{{ endfor }}')).toBe('312');
  });

  it('iterates a list found at a dot-path', () => {
    expect(pre({ report: { rows: ['r1', 'r2'] } })('{{ for row in report.rows }}{{ get("row") }} {{ endfor }}'))
      .toBe('r1 r2 ');
  });

  it('renders nothing for an empty list', () => {
    expect(pre({ items: [] })('a{{ for item in items }}x{{ endfor }}b')).toBe('ab');
  });

  it('renders nothing for a null list (an optional list that is not there today)', () => {
    expect(pre({ items: null })('a{{ for item in items }}x{{ endfor }}b')).toBe('ab');
  });

  it('passes a loop variable into i18n params', () => {
    const vars = { events: [{ guests: 12 }, { guests: 3 }] };
    expect(pre(vars)('{{ for e in events }}{{ i18n("guests", { count: get("e.guests") }) }}, {{ endfor }}'))
      .toBe('12 guests, 3 guests, ');
  });

  it('mixes loop variables and globals in i18n params', () => {
    const vars = { site: 'Shop', counts: [1, 2] };
    expect(pre(vars)('{{ for c in counts }}{{ i18n("line", { name: get("site"), count: get("c") }) }} {{ endfor }}'))
      .toBe('Shop: 1 Shop: 2 ');
  });

  it('still resolves globals inside the body', () => {
    expect(pre({ sep: '|', items: [1, 2] })('{{ for i in items }}{{ get("i") }}{{ get("sep") }}{{ endfor }}'))
      .toBe('1|2|');
  });

  it('still resolves translations inside the body', () => {
    expect(pre({ items: [1, 2] })('{{ for i in items }}{{ i18n("title") }} {{ endfor }}')).toBe('Today Today ');
  });

  it('lets the alias shadow a global of the same name inside the loop only', () => {
    const vars = { item: 'global', items: ['local'] };
    expect(pre(vars)('{{ get("item") }}/{{ for item in items }}{{ get("item") }}{{ endfor }}/{{ get("item") }}'))
      .toBe('global/local/global');
  });

  it('does not leak the alias after the loop', () => {
    expect(pre({ items: ['a'] })('{{ for item in items }}{{ endfor }}{{ get("item") }}')).toBe('Missing variable: item');
  });

  it('keeps the item’s missing fields loud instead of reading a global', () => {
    const vars = { item: { name: 'global' }, items: [{}] };
    expect(pre(vars)('{{ for item in items }}{{ get("item.name") }}{{ endfor }}')).toBe('Missing variable: item.name');
  });

  it('applies a get() default to a present-but-null item field', () => {
    const vars = { items: [{ note: null }, { note: 'hi' }] };
    expect(pre(vars)('{{ for item in items }}{{ get("item.note", "-") }} {{ endfor }}')).toBe('- hi ');
  });

  it('escapes item values', () => {
    expect(pre({ names: ['<b>', 'R&D'] })('{{ for n in names }}{{ get("n") }} {{ endfor }}')).toBe('&lt;b&gt; R&amp;D ');
  });

  it('accepts aliases with underscores, digits and a dollar sign', () => {
    expect(pre({ xs: [1] })('{{ for _a1$ in xs }}{{ get("_a1$") }}{{ endfor }}')).toBe('1');
  });

  it('tolerates extra whitespace inside the statement markers', () => {
    expect(pre({ xs: [1, 2] })('{{   for   x   in   xs   }}{{ get("x") }}{{   endfor   }}')).toBe('12');
  });

  it('keeps markup in the body intact for every item', () => {
    const src = '{{ for e in events }}<mj-section><mj-text>{{ get("e") }}</mj-text></mj-section>{{ endfor }}';
    expect(pre({ events: ['A', 'B'] })(src))
      .toBe('<mj-section><mj-text>A</mj-text></mj-section><mj-section><mj-text>B</mj-text></mj-section>');
  });

  describe('nesting', () => {
    it('iterates a list held by the outer item', () => {
      const vars = { days: [{ label: 'Sat', events: ['Fair', 'Ball'] }, { label: 'Sun', events: ['Run'] }] };
      const src = '{{ for day in days }}{{ get("day.label") }}:{{ for e in day.events }} {{ get("e") }}{{ endfor }};{{ endfor }}';
      expect(pre(vars)(src)).toBe('Sat: Fair Ball;Sun: Run;');
    });

    it('sees the outer alias from the inner body', () => {
      const vars = { days: [{ label: 'Sat', events: ['Fair', 'Ball'] }] };
      const src = '{{ for day in days }}{{ for e in day.events }}{{ get("day.label") }}-{{ get("e") }} {{ endfor }}{{ endfor }}';
      expect(pre(vars)(src)).toBe('Sat-Fair Sat-Ball ');
    });

    it('lets an inner alias shadow the outer one with the same name', () => {
      const vars = { rows: [['a', 'b'], ['c']] };
      const src = '{{ for x in rows }}{{ for x in x }}{{ get("x") }}{{ endfor }}|{{ endfor }}';
      expect(pre(vars)(src)).toBe('ab|c|');
    });

    it('iterates two independent lists as a cross product', () => {
      const src = '{{ for a in as }}{{ for b in bs }}{{ get("a") }}{{ get("b") }} {{ endfor }}{{ endfor }}';
      expect(pre({ as: ['1', '2'], bs: ['x', 'y'] })(src)).toBe('1x 1y 2x 2y ');
    });

    it('combines with if on a loop variable', () => {
      const vars = { events: [{ name: 'A', problem: 'Domain' }, { name: 'B', problem: null }] };
      const src = '{{ for e in events }}{{ get("e.name") }}{{ if e.problem }} ({{ get("e.problem") }}){{ endif }};{{ endfor }}';
      expect(pre(vars)(src)).toBe('A (Domain);B;');
    });

    it('combines with if/else around the loop for an empty state', () => {
      const src = '{{ if items }}{{ for i in items }}{{ get("i") }}{{ endfor }}{{ else }}none{{ endif }}';
      expect(pre({ items: [] })(src)).toBe('none');
      expect(pre({ items: ['a', 'b'] })(src)).toBe('ab');
    });

    it('evaluates if inside a loop per item', () => {
      const src = '{{ for n in ns }}{{ if n }}T{{ else }}F{{ endif }}{{ endfor }}';
      expect(pre({ ns: [1, 0, 2, null] })(src)).toBe('TFTF');
    });
  });

  describe('a list that cannot be read stays loud', () => {
    it('prints the missing-variable sentinel for an absent list and renders no body', () => {
      expect(pre({})('{{ for item in items }}x{{ endfor }}')).toBe('Missing variable: items');
    });

    it('prints the missing-variable sentinel for an absent nested list', () => {
      expect(pre({ a: {} })('{{ for x in a.list }}x{{ endfor }}')).toBe('Missing variable: a.list');
    });

    it('prints the invalid-path error for a malformed list path', () => {
      expect(pre({})('{{ for x in a..b }}x{{ endfor }}')).toBe("Invalid variable path: 'a..b'");
    });

    it.each([
      ['a string', 'abc'],
      ['a number', 5],
      ['an object', { a: 1 }],
      ['true', true],
    ])('prints a not-a-list error for %s', (_label, value) => {
      expect(pre({ v: value })('{{ for x in v }}x{{ endfor }}')).toBe('Not a list: v');
    });

    it('treats a blocked prototype key as absent', () => {
      expect(pre({})('{{ for x in constructor }}x{{ endfor }}')).toBe('Missing variable: constructor');
    });

    it('reports a missing list per outer item', () => {
      const vars = { days: [{ events: ['a'] }, {}] };
      const src = '{{ for day in days }}{{ for e in day.events }}{{ get("e") }}{{ endfor }};{{ endfor }}';
      expect(pre(vars)(src)).toBe('a;Missing variable: day.events;');
    });
  });

  describe('statement shapes that are not a for are left alone', () => {
    it.each([
      ['a call-shaped for', '{{ for(x in xs) }}'],
      ['for … of', '{{ for x of xs }}'],
      ['a missing alias', '{{ for in xs }}'],
      ['a missing list', '{{ for x in }}'],
      ['a dotted alias', '{{ for a.b in xs }}'],
      ['an alias starting with a digit', '{{ for 1x in xs }}'],
      ['two aliases', '{{ for k, v in xs }}'],
      ['a capitalised For', '{{ For x in xs }}'],
    ])('leaves %s untouched', (_label, input) => {
      expect(pre({ xs: [1] })(input)).toBe(input);
    });
  });

  it('prints a Date field of an item as a date, also when handed on as an i18n param', () => {
    const date = new Date('2026-11-14T00:00:00Z');
    const out = pre({ items: [{ name: 'Ada', when: date }] })(
      "{{ for item in items }}{{ get('item.when') }}|{{ i18n('line', { name: get('item.name'), count: get('item.when') }) }}{{ endfor }}",
    );
    expect(out).toBe(String(date) + '|Ada: ' + String(date));
    expect(out).not.toContain('[object Object]');
  });
});
