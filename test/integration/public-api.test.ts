import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createI18nPreprocessor } from '../../src/index';

// Own require (NOT the test helper) so registration is solely the factory's job.
const require = createRequire(import.meta.url);
const mjml = require('mjml');

const template = `<mjml>
  <i18n type="json">{ "cs": { "hello-world": "Ahoj světe" } }</i18n>
  <mj-body><mj-section><mj-column>
    <mj-text>{{ i18n('hello-world') }} — {{ get('name') }}</mj-text>
  </mj-column></mj-section></mj-body>
</mjml>`;

describe('public API: createI18nPreprocessor', () => {
  it('registers <i18n> and resolves i18n + get markers end-to-end', async () => {
    const pre = createI18nPreprocessor({ locale: 'cs', vars: { name: 'Ada' } });
    const { html, errors } = await mjml(template, { preprocessors: [pre] });
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('Ahoj světe');
    expect(html).toContain('Ada');
    expect(html).not.toContain('<i18n'); // component was registered + stripped
  });

  it('works with vars omitted (vars optional)', async () => {
    const pre = createI18nPreprocessor({ locale: 'cs' });
    const { html } = await mjml(template, { preprocessors: [pre] });
    expect(html).toContain('Ahoj světe');
    expect(html).toContain('Missing variable: name'); // get with no vars -> fallback
  });

  it('renders a translation containing HTML markup without an mjml error', async () => {
    const markupTemplate = `<mjml>
      <i18n type="json">{ "en": { "greeting": "Hello <strong>{name}</strong> & welcome" } }</i18n>
      <mj-body><mj-section><mj-column>
        <mj-text>{{ i18n('greeting', { name: get('name') }) }}</mj-text>
      </mj-column></mj-section></mj-body>
    </mjml>`;
    const pre = createI18nPreprocessor({ locale: 'en', vars: { name: 'Ada' } });
    const { html, errors } = await mjml(markupTemplate, { preprocessors: [pre] });
    expect(errors ?? []).toHaveLength(0); // no "Element strong doesn't exist"
    expect(html).toContain('<strong>Ada</strong>'); // markup survived into the output
    expect(html).not.toContain('<i18n');
  });
});
