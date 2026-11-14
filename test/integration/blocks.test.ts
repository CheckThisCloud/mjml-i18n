import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createI18nPreprocessor } from '../../src/index';

// Own require (NOT the test helper) so registration is solely the factory's job.
const require = createRequire(import.meta.url);
const mjml = require('mjml');

async function render(template: string, vars: Record<string, unknown>, locale = 'en') {
  const pre = createI18nPreprocessor({ locale, vars });
  return mjml(template, { preprocessors: [pre] }) as Promise<{ html: string; errors?: unknown[] }>;
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const digest = `<mjml>
  <i18n type="json">{
    "en": { "title": "Today: {count} items", "calm": "Nothing urgent", "guests": "{count} guests" },
    "cs": { "title": "Dnes: {count} položek", "calm": "Nic nehoří", "guests": "{count} hostů" }
  }</i18n>
  <mj-body>
    <mj-section><mj-column>
      {{ if items }}
      <mj-text css-class="title">{{ i18n('title', { count: get('itemCount') }) }}</mj-text>
      {{ else }}
      <mj-text css-class="title">{{ i18n('calm') }}</mj-text>
      {{ endif }}
    </mj-column></mj-section>
    {{ for item in items }}
    <mj-section css-class="row"><mj-column>
      <mj-text>{{ get('item.title') }}</mj-text>
      {{ if item.note }}<mj-text css-class="note">{{ get('item.note') }}</mj-text>{{ endif }}
      <mj-button href="{{ get('item.url') }}">Open</mj-button>
    </mj-column></mj-section>
    {{ endfor }}
    {{ for day in days }}
    <mj-section><mj-column>
      <mj-text css-class="day">{{ get('day.label') }}</mj-text>
      <mj-table>
        {{ for event in day.events }}
        <tr><td>{{ get('event.name') }}</td><td>{{ i18n('guests', { count: get('event.guests') }) }}</td></tr>
        {{ endfor }}
      </mj-table>
    </mj-column></mj-section>
    {{ endfor }}
  </mj-body>
</mjml>`;

const fullVars = {
  itemCount: 2,
  items: [
    { title: 'Approve the reminder', note: 'Due at 9:00', url: 'https://example.test/a?x=1&y=2' },
    { title: 'Check the domain', note: null, url: 'https://example.test/b' },
  ],
  days: [
    { label: 'Saturday', events: [{ name: 'Fair', guests: 1900 }, { name: 'Ball', guests: 820 }] },
    { label: 'Sunday', events: [{ name: 'Run', guests: 2400 }] },
  ],
};

describe('integration: blocks through real mjml', () => {
  it('renders a section per item without mjml errors', async () => {
    const { html, errors } = await render(digest, fullVars);
    expect(errors ?? []).toHaveLength(0);
    expect(count(html, 'Approve the reminder')).toBe(1);
    expect(count(html, 'Check the domain')).toBe(1);
    expect(html).toContain('Today: 2 items');
    expect(html).not.toContain('Nothing urgent');
  });

  it('renders the optional field only where it is set', async () => {
    const { html } = await render(digest, fullVars);
    expect(count(html, 'Due at 9:00')).toBe(1);
    expect(html).not.toContain('Missing variable');
  });

  it('renders nested lists with translated params', async () => {
    const { html, errors } = await render(digest, fullVars);
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('Saturday');
    expect(html).toContain('Sunday');
    expect(html).toContain('1900 guests');
    expect(html).toContain('820 guests');
    expect(html).toContain('2400 guests');
    expect(html.indexOf('Fair')).toBeLessThan(html.indexOf('Ball'));
    expect(html.indexOf('Ball')).toBeLessThan(html.indexOf('Run'));
  });

  it('switches the translated text by locale inside loops', async () => {
    const { html } = await render(digest, fullVars, 'cs');
    expect(html).toContain('Dnes: 2 položek');
    expect(html).toContain('1900 hostů');
  });

  it('renders the else branch and no rows for an empty state', async () => {
    const { html, errors } = await render(digest, { ...fullVars, itemCount: 0, items: [], days: [] });
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('Nothing urgent');
    expect(html).not.toContain('Today:');
    expect(html).not.toContain('Open');
  });

  it('leaves no block statement in the output', async () => {
    const { html } = await render(digest, fullVars);
    expect(html).not.toMatch(/{{\s*(for|endfor|if|else|endif)\b/);
  });
});

describe('integration: escaping through real mjml', () => {
  const template = `<mjml><mj-body><mj-section><mj-column>
    <mj-text>{{ get('name') }}</mj-text>
    <mj-button href="{{ get('url') }}">Open</mj-button>
  </mj-column></mj-section></mj-body></mjml>`;

  it('shows a name with markup characters as text, not as an element', async () => {
    const { html, errors } = await render(template, { name: 'Tom & <b>Jerry</b>', url: 'https://example.test' });
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;');
    expect(html).not.toContain('<b>Jerry</b>');
  });

  it('keeps a URL with a query string working inside href', async () => {
    const url = 'https://example.test/path?a=1&b=2';
    const { html, errors } = await render(template, { name: 'x', url });
    expect(errors ?? []).toHaveLength(0);
    // mjml's own <link href="https://fonts.googleapis.com/..."> comes first; take the button's.
    const href = /href="(https:\/\/example\.test[^"]*)"/.exec(html)?.[1] ?? '';
    // An HTML parser reads `&amp;` in an attribute as `&`: decode once to get what the
    // browser follows, and make sure it was not escaped twice.
    expect(href.replace(/&amp;/g, '&')).toBe(url);
    expect(href).not.toContain('&amp;amp;');
  });

  it('keeps a quote in a value from breaking out of href', async () => {
    const { html } = await render(template, { name: 'x', url: 'https://example.test/" onclick="evil()' });
    expect(html).not.toContain('onclick="evil()"');
  });

  it('escapes a loop item that carries markup', async () => {
    const loop = `<mjml><mj-body><mj-section><mj-column>
      {{ for c in comments }}<mj-text>{{ get('c') }}</mj-text>{{ endfor }}
    </mj-column></mj-section></mj-body></mjml>`;
    const { html, errors } = await render(loop, { comments: ['<a href="https://evil.test">click</a>'] });
    expect(errors ?? []).toHaveLength(0);
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).toContain('&lt;a href=&quot;https://evil.test&quot;&gt;click&lt;/a&gt;');
  });

  it('escapes a value passed into a translation but keeps the translation’s own markup', async () => {
    const tpl = `<mjml>
      <i18n type="json">{ "en": { "hi": "Hello <strong>{name}</strong>" } }</i18n>
      <mj-body><mj-section><mj-column>
        <mj-text>{{ i18n('hi', { name: get('name') }) }}</mj-text>
      </mj-column></mj-section></mj-body></mjml>`;
    const { html, errors } = await render(tpl, { name: '<script>x</script>' });
    expect(errors ?? []).toHaveLength(0);
    expect(html).toContain('<strong>&lt;script&gt;x&lt;/script&gt;</strong>');
  });
});
