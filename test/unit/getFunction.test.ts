import { describe, it, expect } from 'vitest';
import { GetFunction } from '../../src/functions/GetFunction';

describe('GetFunction', () => {
  it('returns a present variable', () => {
    expect(new GetFunction({ name: 'Ada' }).call('name')).toBe('Ada');
  });

  it('walks nested variables', () => {
    expect(new GetFunction({ user: { name: 'Ada' } }).call('user.name')).toBe('Ada');
  });

  it('returns a missing-variable message for an absent key', () => {
    expect(new GetFunction({}).call('nope')).toBe('Missing variable: nope');
  });

  it('treats a blocked prototype key as missing', () => {
    expect(new GetFunction({ a: 1 }).call('__proto__')).toBe('Missing variable: __proto__');
  });

  it('returns a falsy value (0) rather than the fallback', () => {
    expect(new GetFunction({ count: 0 }).call('count')).toBe(0);
  });

  describe('with a default argument', () => {
    it('returns the sentinel for a present-but-null value when no default is given', () => {
      expect(new GetFunction({ k: null }).call('k')).toBe('Missing variable: k');
    });

    it('returns the default for a present-but-null value', () => {
      expect(new GetFunction({ k: null }).call('k', 'foo')).toBe('foo');
    });

    it('returns the default for a present-but-undefined value', () => {
      expect(new GetFunction({ k: undefined }).call('k', 'foo')).toBe('foo');
    });

    it('returns the sentinel for an absent key even when a default is given', () => {
      expect(new GetFunction({}).call('missing', 'foo')).toBe('Missing variable: missing');
    });

    it('returns the real value, ignoring the default', () => {
      expect(new GetFunction({ k: 'real' }).call('k', 'foo')).toBe('real');
    });

    it('returns "" rather than the default (falsy but non-null)', () => {
      expect(new GetFunction({ k: '' }).call('k', 'foo')).toBe('');
    });

    it('returns 0 rather than the default (falsy but non-null)', () => {
      expect(new GetFunction({ k: 0 }).call('k', 'foo')).toBe(0);
    });

    it('returns false rather than the default (falsy but non-null)', () => {
      expect(new GetFunction({ k: false }).call('k', 'foo')).toBe(false);
    });

    it('applies the default for a present-but-null nested value', () => {
      expect(new GetFunction({ a: { b: null } }).call('a.b', 'd')).toBe('d');
    });

    it('returns the sentinel for a nested path with an absent parent', () => {
      expect(new GetFunction({}).call('a.b', 'd')).toBe('Missing variable: a.b');
    });

    it('returns the sentinel for a nested path absent at the final segment', () => {
      expect(new GetFunction({ a: { x: 1 } }).call('a.b', 'd')).toBe('Missing variable: a.b');
    });

    it('treats a null intermediate segment as absent for a deeper path', () => {
      expect(new GetFunction({ a: null }).call('a.b', 'd')).toBe('Missing variable: a.b');
    });
  });

  describe('with a falsy default value (default is not a truthiness/nullish check)', () => {
    it('applies an empty-string default to a present-but-null value', () => {
      expect(new GetFunction({ k: null }).call('k', '')).toBe('');
    });

    it('applies a 0 default to a present-but-null value', () => {
      expect(new GetFunction({ k: null }).call('k', 0)).toBe(0);
    });

    it('applies a false default to a present-but-null value', () => {
      expect(new GetFunction({ k: null }).call('k', false)).toBe(false);
    });

    it('applies an explicit null default to a present-but-null value', () => {
      expect(new GetFunction({ k: null }).call('k', null)).toBe(null);
    });
  });

  describe('with a default on a nested (dot-notation) path', () => {
    it('returns the real nested value, ignoring the default', () => {
      expect(new GetFunction({ a: { b: 'real' } }).call('a.b', 'd')).toBe('real');
    });

    it('returns a falsy nested value (0) rather than the default', () => {
      expect(new GetFunction({ a: { b: 0 } }).call('a.b', 'd')).toBe(0);
    });

    it('applies the default for a present-but-undefined nested value', () => {
      expect(new GetFunction({ a: { b: undefined } }).call('a.b', 'd')).toBe('d');
    });
  });

  describe('with a malformed path (prominent error, distinct from missing)', () => {
    it('returns a distinct error for an empty path', () => {
      expect(new GetFunction({}).call('')).toBe("Invalid variable path: ''");
    });

    it('returns a distinct error for an empty key even when that key exists in vars', () => {
      expect(new GetFunction({ '': 'present' }).call('')).toBe("Invalid variable path: ''");
    });

    it.each(['a.', '.a', 'a..b', '.', 'a.b.'])(
      'returns a distinct error for the empty-segment path %s',
      (key) => {
        expect(new GetFunction({ a: { b: 1 } }).call(key)).toBe(`Invalid variable path: '${key}'`);
      },
    );

    it('does not let a default rescue a malformed path', () => {
      expect(new GetFunction({}).call('a.', 'fallback')).toBe("Invalid variable path: 'a.'");
    });

    it('uses wording distinct from the missing-variable sentinel', () => {
      const out = new GetFunction({}).call('a..b');
      expect(out).not.toContain('Missing variable');
      expect(out).toContain('Invalid variable path');
    });
  });

  describe('with more than two arguments', () => {
    it('ignores extra arguments when applying the default', () => {
      expect((new GetFunction({ k: null }).call as any)('k', 'd', 'extra')).toBe('d');
    });

    it('ignores extra arguments when returning a real value', () => {
      expect((new GetFunction({ k: 'real' }).call as any)('k', 'd', 'extra')).toBe('real');
    });
  });

  describe('escaping (a value is data, never markup)', () => {
    it('escapes HTML-significant characters in a string value', () => {
      expect(new GetFunction({ name: 'Tom & <Jerry>' }).call('name')).toBe('Tom &amp; &lt;Jerry&gt;');
    });

    it('escapes quotes so a value cannot break out of an attribute', () => {
      expect(new GetFunction({ v: `a"b'c` }).call('v')).toBe('a&quot;b&#39;c');
    });

    it('escapes a nested string value', () => {
      expect(new GetFunction({ user: { name: '<b>Ada</b>' } }).call('user.name')).toBe('&lt;b&gt;Ada&lt;/b&gt;');
    });

    it('keeps a number as a number', () => {
      expect(new GetFunction({ n: 42 }).call('n')).toBe(42);
    });

    it('keeps a boolean as a boolean', () => {
      expect(new GetFunction({ b: true }).call('b')).toBe(true);
    });

    it('escapes strings inside an array value', () => {
      expect(new GetFunction({ list: ['<a>', 'b&c', 3] }).call('list')).toEqual(['&lt;a&gt;', 'b&amp;c', 3]);
    });

    it('escapes strings inside an object value (e.g. passed on as i18n params)', () => {
      expect(new GetFunction({ p: { name: '<i>x</i>', deep: { v: '"' } } }).call('p')).toEqual({
        name: '&lt;i&gt;x&lt;/i&gt;',
        deep: { v: '&quot;' },
      });
    });

    it('does not mutate the vars it was given', () => {
      const vars = { p: { name: '<i>' } };
      new GetFunction(vars).call('p');
      expect(vars.p.name).toBe('<i>');
    });

    it('does not escape a default (it is template text, not data)', () => {
      expect(new GetFunction({ k: null }).call('k', '<em>none</em>')).toBe('<em>none</em>');
    });

    it('does not escape the missing-variable sentinel path', () => {
      expect(new GetFunction({}).call('a<b')).toBe('Missing variable: a<b');
    });
  });

  describe('resolve() (raw lookup used by block statements)', () => {
    it('reports a present value without escaping it', () => {
      expect(new GetFunction({ name: '<b>' }).resolve('name')).toEqual({ exists: true, value: '<b>' });
    });

    it('reports an absent path', () => {
      expect(new GetFunction({}).resolve('nope')).toEqual({ exists: false, value: undefined });
    });

    it('reports a present-but-null value as existing', () => {
      expect(new GetFunction({ k: null }).resolve('k')).toEqual({ exists: true, value: null });
    });
  });

  describe('withFrame() (loop scope)', () => {
    it('resolves a frame variable', () => {
      const scoped = new GetFunction({}).withFrame({ item: { title: 'First' } });
      expect(scoped.call('item.title')).toBe('First');
    });

    it('still resolves global variables through a frame', () => {
      const scoped = new GetFunction({ site: 'Example' }).withFrame({ item: 1 });
      expect(scoped.call('site')).toBe('Example');
    });

    it('lets a frame variable shadow a global of the same name', () => {
      const scoped = new GetFunction({ item: 'global' }).withFrame({ item: 'local' });
      expect(scoped.call('item')).toBe('local');
    });

    it('lets an inner frame shadow an outer frame', () => {
      const scoped = new GetFunction({}).withFrame({ x: 'outer' }).withFrame({ x: 'inner' });
      expect(scoped.call('x')).toBe('inner');
    });

    it('sees an outer frame from an inner one', () => {
      const scoped = new GetFunction({}).withFrame({ day: { label: 'Mon' } }).withFrame({ event: 'Run' });
      expect(scoped.call('day.label')).toBe('Mon');
      expect(scoped.call('event')).toBe('Run');
    });

    it('does not fall back to a global when the frame owns the head but lacks the rest', () => {
      // `item` is the loop variable here; item.missing is a typo, not a global lookup.
      const scoped = new GetFunction({ item: { missing: 'global' } }).withFrame({ item: {} });
      expect(scoped.call('item.missing')).toBe('Missing variable: item.missing');
    });

    it('applies the present-but-null default to a frame variable', () => {
      const scoped = new GetFunction({}).withFrame({ item: { note: null } });
      expect(scoped.call('item.note', '-')).toBe('-');
    });

    it('escapes a frame value', () => {
      const scoped = new GetFunction({}).withFrame({ item: 'R&D' });
      expect(scoped.call('item')).toBe('R&amp;D');
    });

    it('leaves the parent untouched', () => {
      const parent = new GetFunction({});
      parent.withFrame({ item: 1 });
      expect(parent.call('item')).toBe('Missing variable: item');
    });

    it('resolves a frame variable through resolve()', () => {
      const scoped = new GetFunction({}).withFrame({ item: { tags: ['a'] } });
      expect(scoped.resolve('item.tags')).toEqual({ exists: true, value: ['a'] });
    });

    it('treats a blocked prototype key as absent even when used as a frame name', () => {
      const scoped = new GetFunction({}).withFrame({ ['__proto__']: { x: 1 } });
      expect(scoped.call('__proto__.x')).toBe('Missing variable: __proto__.x');
      expect((Object.prototype as Record<string, unknown>).x).toBeUndefined();
    });
  });
});
