import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/utils/escapeHtml';

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
