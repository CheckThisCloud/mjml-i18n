import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '../helpers/mjml';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const basicSrc = readFileSync('fixture.mjml', 'utf8');

function preprocessorFor(locale: string, vars: Record<string, unknown> = {}) {
  return createPreprocessor({
    get: new GetFunction(vars),
    i18n: new I18nFunction(locale),
  });
}

describe('integration: tracer bullet', () => {
  it('renders fixture.mjml through real mjml with translations resolved', async () => {
    const { html, errors } = await render(basicSrc, [preprocessorFor('cs')]);
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('Ahoj světe');     // i18n('hello-world') in cs
    expect(html).toContain('baz');             // i18n('foo.bar') nested key
  });
});

const attributeSrc = readFileSync('test/fixtures/attribute.mjml', 'utf8');
const noI18nSrc = readFileSync('test/fixtures/no-i18n.mjml', 'utf8');

describe('integration: scenarios', () => {
  it('resolves a marker inside an attribute (href)', async () => {
    const { html, errors } = await render(attributeSrc, [
      preprocessorFor('en', { url: 'https://example.com/x' }),
    ]);
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('https://example.com/x'); // landed in the href attribute
    expect(html).toContain('Click me');
  });

  it('switches output by locale for the same template', async () => {
    const en = await render(basicSrc, [preprocessorFor('en')]);
    const cs = await render(basicSrc, [preprocessorFor('cs')]);
    expect(en.html).toContain('Hello World');
    expect(cs.html).toContain('Ahoj světe');
  });

  it('strips the <i18n> head component from the output', async () => {
    const { html } = await render(basicSrc, [preprocessorFor('cs')]);
    expect(html).not.toContain('<i18n');
  });

  it('leaves an unknown marker literal in the rendered HTML', async () => {
    const { html } = await render(noI18nSrc, [preprocessorFor('en')]);
    // no <i18n> block -> i18n('hello') falls back to the key, not a crash
    expect(html).toContain('hello');
  });

  it('keeps per-render instances isolated under concurrency', async () => {
    const ppCs = preprocessorFor('cs');
    const ppEn = preprocessorFor('en');
    const [cs, en] = await Promise.all([
      render(basicSrc, [ppCs]),
      render(basicSrc, [ppEn]),
    ]);
    // Discriminate on locale-unique TRANSLATED output. 'Hello World' is unusable as a
    // discriminator because fixture.mjml contains it as static text ("normal: Hello World")
    // in every render. 'Ahoj světe' (cs) and the contiguous 'translated: Hello World' (en)
    // come only from each instance's own translations -> proves no cross-contamination.
    expect(cs.html).toContain('Ahoj světe');
    expect(cs.html).not.toContain('translated: Hello World');
    expect(en.html).toContain('translated: Hello World');
    expect(en.html).not.toContain('Ahoj');
  });
});
