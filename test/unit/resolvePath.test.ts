import { describe, it, expect } from 'vitest';
import { resolvePath } from '../../src/utils/resolvePath';

describe('resolvePath', () => {
  it('reports a present top-level value as existing', () => {
    expect(resolvePath('a', { a: 1 })).toEqual({ exists: true, value: 1 });
  });

  it('walks nested paths', () => {
    expect(resolvePath('a.b.c', { a: { b: { c: 'deep' } } })).toEqual({ exists: true, value: 'deep' });
  });

  it('reports a present-but-null leaf as existing with a null value', () => {
    expect(resolvePath('k', { k: null })).toEqual({ exists: true, value: null });
  });

  it('reports a present-but-undefined leaf as existing with an undefined value', () => {
    expect(resolvePath('k', { k: undefined })).toEqual({ exists: true, value: undefined });
  });

  it('reports falsy-but-present leaves as existing', () => {
    expect(resolvePath('s', { s: '' })).toEqual({ exists: true, value: '' });
    expect(resolvePath('n', { n: 0 })).toEqual({ exists: true, value: 0 });
    expect(resolvePath('b', { b: false })).toEqual({ exists: true, value: false });
  });

  it('reports an absent leaf as not existing', () => {
    expect(resolvePath('a.x', { a: { b: 1 } })).toEqual({ exists: false, value: undefined });
  });

  it('reports an absent intermediate as not existing (no throw)', () => {
    expect(resolvePath('a.x.y', { a: { b: 1 } })).toEqual({ exists: false, value: undefined });
  });

  it('reports a null intermediate as not existing for a deeper path', () => {
    expect(resolvePath('a.b', { a: null })).toEqual({ exists: false, value: undefined });
  });

  it('reports a missing root object as not existing', () => {
    expect(resolvePath('a', undefined)).toEqual({ exists: false, value: undefined });
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'treats the prototype key %s as not existing at any segment',
    (key) => {
      expect(resolvePath(key, { a: 1 })).toEqual({ exists: false, value: undefined });
      expect(resolvePath(`a.${key}`, { a: { b: 1 } })).toEqual({ exists: false, value: undefined });
    },
  );

  it('treats an inherited (non-own) key as not existing', () => {
    expect(resolvePath('toString', {})).toEqual({ exists: false, value: undefined });
  });
});
