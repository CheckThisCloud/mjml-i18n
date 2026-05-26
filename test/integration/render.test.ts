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
