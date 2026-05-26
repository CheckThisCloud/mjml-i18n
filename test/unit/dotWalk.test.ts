import { describe, it, expect } from 'vitest';
import { dotWalk } from '../../src/utils/dotWalk';

describe('dotWalk', () => {
  it('returns a top-level value', () => {
    expect(dotWalk('a', { a: 1 })).toBe(1);
  });

  it('walks nested paths', () => {
    expect(dotWalk('a.b.c', { a: { b: { c: 'deep' } } })).toBe('deep');
  });

  it('returns undefined for a missing leaf', () => {
    expect(dotWalk('a.x', { a: { b: 1 } })).toBeUndefined();
  });

  it('is null-safe through a missing intermediate (no throw)', () => {
    expect(dotWalk('a.x.y', { a: { b: 1 } })).toBeUndefined();
  });

  it('returns undefined when the object itself is undefined', () => {
    expect(dotWalk('a', undefined)).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'blocks the prototype key %s at any segment',
    (key) => {
      expect(dotWalk(key, { a: 1 })).toBeUndefined();
      expect(dotWalk(`a.${key}`, { a: { b: 1 } })).toBeUndefined();
    },
  );

  it.each([
    ['zero', 'n', { n: 0 }, 0],
    ['empty string', 's', { s: '' }, ''],
    ['false', 'b', { b: false }, false],
  ])('returns falsy value %s as-is (not swallowed)', (_label, path, obj, expected) => {
    expect(dotWalk(path, obj as Record<string, unknown>)).toBe(expected);
  });
});
