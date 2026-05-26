import { describe, it, expect } from 'vitest';
import { format } from '../../src/utils/format';

describe('format', () => {
  it('substitutes a single param', () => {
    expect(format('Hi {name}', { name: 'Ada' })).toBe('Hi Ada');
  });

  it('substitutes multiple params', () => {
    expect(format('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('leaves a missing param literal', () => {
    expect(format('Hi {name}', {})).toBe('Hi {name}');
  });

  it('coerces a number param to string', () => {
    expect(format('{n} items', { n: 42 })).toBe('42 items');
  });

  it('substitutes a repeated param every time', () => {
    expect(format('{x}{x}', { x: 'ab' })).toBe('abab');
  });

  it('defaults to no params', () => {
    expect(format('plain text')).toBe('plain text');
  });

  it('leaves non-matching braces literal', () => {
    expect(format('a { } b {}', { foo: 'z' })).toBe('a { } b {}');
  });

  it('matches param names with underscores and digits', () => {
    expect(format('{user_1}', { user_1: 'ok' })).toBe('ok');
  });

  it('stringifies an explicitly-undefined param value', () => {
    // key present but undefined -> "key in params" is true -> String(undefined)
    expect(format('{x}', { x: undefined })).toBe('undefined');
  });
});
