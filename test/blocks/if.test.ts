import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre(vars: Record<string, unknown> = {}) {
  return createPreprocessor({ get: new GetFunction(vars), i18n: new I18nFunction('en') });
}

describe('blocks: if', () => {
  it('keeps the body when the value is truthy', () => {
    expect(pre({ show: true })('a{{ if show }}B{{ endif }}c')).toBe('aBc');
  });

  it('drops the body when the value is falsy', () => {
    expect(pre({ show: false })('a{{ if show }}B{{ endif }}c')).toBe('ac');
  });

  it('renders the else branch when the value is falsy', () => {
    expect(pre({ show: false })('{{ if show }}yes{{ else }}no{{ endif }}')).toBe('no');
  });

  it('skips the else branch when the value is truthy', () => {
    expect(pre({ show: true })('{{ if show }}yes{{ else }}no{{ endif }}')).toBe('yes');
  });

  it('allows an empty body', () => {
    expect(pre({ show: true })('[{{ if show }}{{ endif }}]')).toBe('[]');
  });

  it('allows an empty else branch', () => {
    expect(pre({ show: false })('[{{ if show }}x{{ else }}{{ endif }}]')).toBe('[]');
  });

  it('follows a dot-path', () => {
    expect(pre({ order: { paid: true } })('{{ if order.paid }}paid{{ endif }}')).toBe('paid');
  });

  it('resolves markers inside the kept branch', () => {
    expect(pre({ show: true, name: 'Ada' })('{{ if show }}Hi {{ get("name") }}{{ endif }}')).toBe('Hi Ada');
  });

  it('does not evaluate markers inside the dropped branch', () => {
    // The dropped branch would print a missing-variable sentinel if it were rendered.
    expect(pre({ show: false })('{{ if show }}{{ get("nope") }}{{ endif }}')).toBe('');
  });

  it('tolerates extra whitespace inside the statement markers', () => {
    expect(pre({ show: true })('{{   if   show   }}x{{  else  }}y{{   endif   }}')).toBe('x');
  });

  it('keeps text and newlines around the block intact', () => {
    const src = '<mj-text>\n  {{ if show }}\n  <b>x</b>\n  {{ endif }}\n</mj-text>';
    expect(pre({ show: true })(src)).toBe('<mj-text>\n  \n  <b>x</b>\n  \n</mj-text>');
  });

  it('renders sibling blocks independently', () => {
    expect(pre({ a: true, b: false })('{{ if a }}A{{ endif }}{{ if b }}B{{ endif }}')).toBe('A');
  });

  it('nests: inner if inside the kept branch', () => {
    expect(pre({ a: true, b: true })('{{ if a }}[{{ if b }}B{{ endif }}]{{ endif }}')).toBe('[B]');
  });

  it('nests: inner if inside the else branch', () => {
    expect(pre({ a: false, b: true })('{{ if a }}A{{ else }}{{ if b }}B{{ else }}C{{ endif }}{{ endif }}')).toBe('B');
  });

  it('nests: inner else does not belong to the outer if', () => {
    expect(pre({ a: true, b: false })('{{ if a }}{{ if b }}B{{ else }}notB{{ endif }}{{ else }}notA{{ endif }}')).toBe('notB');
  });

  describe('truthiness', () => {
    it.each([
      ['true', true],
      ['a non-empty string', 'x'],
      ['a non-zero number', 3],
      ['a negative number', -1],
      ['a non-empty list', [1]],
      ['an object', { a: 1 }],
      ['an empty object', {}],
      ['the string "0"', '0'],
      ['the string "false"', 'false'],
    ])('treats %s as true', (_label, value) => {
      expect(pre({ v: value })('{{ if v }}T{{ else }}F{{ endif }}')).toBe('T');
    });

    it.each([
      ['false', false],
      ['null', null],
      ['undefined', undefined],
      ['an empty string', ''],
      ['zero', 0],
      ['NaN', NaN],
      ['an empty list', []],
    ])('treats %s as false', (_label, value) => {
      expect(pre({ v: value })('{{ if v }}T{{ else }}F{{ endif }}')).toBe('F');
    });
  });

  describe('a path that cannot be read stays loud', () => {
    it('prints the missing-variable sentinel for an absent path and renders neither branch', () => {
      expect(pre({})('{{ if nope }}T{{ else }}F{{ endif }}')).toBe('Missing variable: nope');
    });

    it('prints the missing-variable sentinel for an absent nested path', () => {
      expect(pre({ a: {} })('{{ if a.b }}T{{ endif }}')).toBe('Missing variable: a.b');
    });

    it('prints the invalid-path error for a malformed path', () => {
      expect(pre({ a: 1 })('{{ if a. }}T{{ endif }}')).toBe("Invalid variable path: 'a.'");
    });

    it('treats a blocked prototype key as absent', () => {
      expect(pre({ a: 1 })('{{ if constructor }}T{{ endif }}')).toBe('Missing variable: constructor');
    });

    it('treats an absent path the same without a get function wired', () => {
      const p = createPreprocessor({ i18n: new I18nFunction('en') });
      expect(p('{{ if show }}T{{ endif }}')).toBe('Missing variable: show');
    });
  });

  describe('statement shapes that are not an if are left alone', () => {
    it.each([
      ['a call-shaped if', '{{ if(show) }}'],
      ['an if with an expression', '{{ if a && b }}'],
      ['an if with two words', '{{ if a b }}'],
      ['a bare if', '{{ if }}'],
      ['a capitalised If', '{{ If show }}'],
    ])('leaves %s untouched', (_label, input) => {
      expect(pre({ show: true, a: true, b: true })(input)).toBe(input);
    });
  });
});
