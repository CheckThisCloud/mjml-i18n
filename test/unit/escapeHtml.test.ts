import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeDeep } from '../../src/utils/escapeHtml';

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Ahoj světe 123')).toBe('Ahoj světe 123');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('a < b < c')).toBe('a &lt; b &lt; c');
  });

  it('escapes an ampersand that already looks like an entity (no entity passthrough)', () => {
    // A value is data, not markup: "&amp;" typed by a user must read back as "&amp;".
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('neutralises a tag so it cannot become an element', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('neutralises a quote that would break out of an attribute', () => {
    expect(escapeHtml('x" onclick="evil()')).toBe('x&quot; onclick=&quot;evil()');
  });

  it('returns an empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('escapeDeep', () => {
  it('prints a Date through its own string form, not as an empty object', () => {
    const date = new Date('2026-11-14T00:00:00Z');
    expect(escapeDeep(date)).toBe(String(date));
  });

  it('prints a class instance through its toString() and escapes the result', () => {
    class Label {
      toString() { return '<b>Tom & Jerry</b>'; }
    }
    expect(escapeDeep(new Label())).toBe('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;');
  });

  it('prints a URL as its href', () => {
    expect(escapeDeep(new URL('https://example.com/?a=1&b=2'))).toBe('https://example.com/?a=1&amp;b=2');
  });

  it('stringifies a Date nested in a plain object or a list', () => {
    const date = new Date('2026-11-14T00:00:00Z');
    expect(escapeDeep({ when: date, tags: [date] })).toEqual({ when: String(date), tags: [String(date)] });
  });

  it('walks a prototype-less dictionary like a plain object', () => {
    const dict = Object.assign(Object.create(null), { name: '<x>' });
    expect(escapeDeep(dict)).toEqual({ name: '&lt;x&gt;' });
  });
});
