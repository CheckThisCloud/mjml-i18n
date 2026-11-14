import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre(vars: Record<string, unknown> = {}) {
  return createPreprocessor({ get: new GetFunction(vars), i18n: new I18nFunction('en') });
}

// A broken block structure is a template-authoring mistake. It never throws: the
// message is printed where the statement stood, and the rest of the template renders.
describe('blocks: broken structure is printed, never thrown', () => {
  describe('stray closing statements', () => {
    it.each(['endif', 'endfor', 'else'])('prints an error for a lone %s', (word) => {
      expect(pre()(`a{{ ${word} }}b`)).toBe(`aUnexpected ${word}b`);
    });

    it('prints an error for an endif closing a for, and keeps the for open', () => {
      const out = pre({ xs: [1] })('{{ for x in xs }}A{{ endif }}B{{ endfor }}');
      expect(out).toBe('AUnexpected endifB');
    });

    it('prints an error for an endfor closing an if, and keeps the if open', () => {
      expect(pre({ ok: true })('{{ if ok }}A{{ endfor }}B{{ endif }}')).toBe('AUnexpected endforB');
    });

    it('prints an error for an else inside a for', () => {
      expect(pre({ xs: [1] })('{{ for x in xs }}A{{ else }}B{{ endfor }}')).toBe('AUnexpected elseB');
    });

    it('prints an error for a second else in the same if, inside the else branch', () => {
      expect(pre({ ok: false })('{{ if ok }}A{{ else }}B{{ else }}C{{ endif }}')).toBe('BUnexpected elseC');
    });

    it('prints an error for an extra endif after a closed if', () => {
      expect(pre({ ok: true })('{{ if ok }}A{{ endif }}{{ endif }}')).toBe('AUnexpected endif');
    });

    it('does not treat a closing word with arguments as a statement', () => {
      expect(pre()('{{ endif x }}{{ else if y }}')).toBe('{{ endif x }}{{ else if y }}');
    });
  });

  describe('unclosed blocks', () => {
    it('prints an error naming an unclosed if, then its content', () => {
      expect(pre({ ok: false })('a{{ if ok }}B')).toBe('aUnclosed block: if okB');
    });

    it('prints an error naming an unclosed for, then its content once', () => {
      expect(pre({ xs: [1, 2] })('a{{ for x in xs }}B')).toBe('aUnclosed block: for x in xsB');
    });

    it('renders the content of an unclosed for without the alias', () => {
      expect(pre({ xs: [1] })('{{ for x in xs }}{{ get("x") }}')).toBe('Unclosed block: for x in xsMissing variable: x');
    });

    it('prints both branches of an unclosed if that already had an else', () => {
      expect(pre({ ok: true })('{{ if ok }}A{{ else }}B')).toBe('Unclosed block: if okAB');
    });

    it('names the statement as written, trimmed', () => {
      expect(pre({ xs: [] })('{{   for x in xs   }}')).toBe('Unclosed block: for x in xs');
    });

    it('prints one error per unclosed block, outermost first', () => {
      expect(pre({ a: true, b: true })('{{ if a }}1{{ if b }}2')).toBe('Unclosed block: if a1Unclosed block: if b2');
    });

    it('closes the inner block and reports only the outer one', () => {
      expect(pre({ a: true, b: true })('{{ if a }}1{{ if b }}2{{ endif }}3')).toBe('Unclosed block: if a123');
    });

    it('still renders a closed block that precedes an unclosed one', () => {
      expect(pre({ a: true, b: true })('{{ if a }}A{{ endif }}{{ if b }}B')).toBe('AUnclosed block: if bB');
    });

    it('reports a mismatched nest: endfor inside if, if never closed', () => {
      const out = pre({ xs: [1], ok: true })('{{ for x in xs }}{{ if ok }}A{{ endfor }}');
      expect(out).toBe('Unclosed block: for x in xsUnclosed block: if okAUnexpected endfor');
    });
  });

  describe('markers next to a broken structure', () => {
    it('still resolves ordinary markers around the error', () => {
      expect(pre({ name: 'Ada' })('{{ get("name") }}{{ endif }}{{ get("name") }}')).toBe('AdaUnexpected endifAda');
    });

    it('still leaves unsupported markers verbatim around the error', () => {
      expect(pre()('{{ 1 + 2 }}{{ endfor }}')).toBe('{{ 1 + 2 }}Unexpected endfor');
    });
  });
});
