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

  describe('with more than two arguments', () => {
    it('ignores extra arguments when applying the default', () => {
      expect(new GetFunction({ k: null }).call('k', 'd', 'extra' as any)).toBe('d');
    });

    it('ignores extra arguments when returning a real value', () => {
      expect(new GetFunction({ k: 'real' }).call('k', 'd', 'extra' as any)).toBe('real');
    });
  });
});
