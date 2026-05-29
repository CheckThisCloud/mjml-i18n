# @checkthiscloud/mjml-i18n

> i18n and variable interpolation for [MJML v5](https://mjml.io) email templates — a single preprocessor with co-located, vue-i18n-style translations.

> ⚠️ **Experimental (pre-1.0).** The API may change between `0.x` releases.

Run your `.mjml` templates through one preprocessor that resolves `{{ … }}` markers — translations *and* variables — on the raw XML **before** MJML parses it. No more compiling templates through a separate template engine just to get translations.

## Install

```bash
yarn add @checkthiscloud/mjml-i18n mjml
# or
npm install @checkthiscloud/mjml-i18n mjml
```

`mjml` (and its `mjml-core`) are **peer dependencies** — you bring your own MJML v5; this package only provides the preprocessor. Installing `mjml` pulls in `mjml-core` for you.

```jsonc
// peer requirements
"mjml": "^5",
"mjml-core": "^5"
```

## Quick start

Co-locate translations in an `<i18n>` block and use `{{ … }}` markers anywhere in the template:

```xml
<mjml>
  <i18n type="json">
    {
      "en": { "hello": "Hello {name}!", "cta": "Shop now" },
      "cs": { "hello": "Ahoj {name}!", "cta": "Nakupovat" }
    }
  </i18n>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>{{ i18n('hello', { name: get('firstName') }) }}</mj-text>
        <mj-button href="{{ get('url') }}">{{ i18n('cta') }}</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

Render it:

```ts
import mjml from 'mjml';
import { createI18nPreprocessor } from '@checkthiscloud/mjml-i18n';

const preprocessor = createI18nPreprocessor({
  locale: 'cs',
  vars: { firstName: 'Ada', url: 'https://example.com' },
});

const { html, errors } = await mjml(template, { preprocessors: [preprocessor] });
```

MJML v5's `mjml()` is async — remember to `await` it. The `<i18n>` head component is registered for you by the factory.

## Markers

A marker is `{{ <expression> }}` where the expression is a **function call**. Two functions are built in:

| Marker | Resolves to |
| --- | --- |
| `{{ i18n('key') }}` | the translation for `key` in the active locale |
| `{{ i18n('a.b') }}` | a nested translation key (`a.b`) |
| `{{ i18n('key', { name: 'Ada' }) }}` | a translation with `{name}` params filled in |
| `{{ get('path') }}` | a value from `vars` (dot-path supported: `get('user.name')`) |
| `{{ get('path', 'default') }}` | a value from `vars`, falling back to `default` when the value is present-but-`null` (see below) |
| `{{ i18n('hi', { name: get('userName') }) }}` | **nesting** — `get(…)` is evaluated and passed into `i18n(…)` |

Markers work **anywhere** — body text *and* attributes (`href`, `background-color`, …) — because they're resolved before MJML parses the XML.

### Translation params

Translation strings use single-brace placeholders (`{name}`) — ICU-compatible and collision-free with the outer `{{ }}`:

```json
{ "en": { "greeting": "Hi {name}, you have {count} new messages" } }
```

```xml
{{ i18n('greeting', { name: get('firstName'), count: get('msgCount') }) }}
```

Substitution is plain string replacement (no pluralization / ICU yet). A param with no matching value is left literal (`{name}`).

### Markup in translations

Translation values may contain HTML — `<strong>`, `<a>`, bare `&` and `<`, and so on:

```json
{ "en": { "welcome": "Welcome <strong>{name}</strong> &mdash; let's go" } }
```

No `CDATA` or escaping is needed. The preprocessor reads the `<i18n>` block as raw text and **removes it from the XML before MJML parses the template**, so MJML never tries to interpret the markup as components. The resolved value lands wherever its marker sits (e.g. inside an `<mj-text>`), and MJML renders it as normal inline HTML.

## Fallbacks & behavior

Nothing this package does throws into your render — unresolved markers degrade gracefully:

| Situation | Result |
| --- | --- |
| Missing translation key | the key itself (`i18n('foo.bar')` → `foo.bar`) |
| Missing variable | `Missing variable: <path>` |
| Variable present but `null`, with a default | `get('key', default)` → `default` |
| Variable present but `null`, no default | `Missing variable: <path>` |
| Missing translation param | left literal (`{name}`) |
| Unknown function / unsupported expression | the marker is left **untouched** in the output |
| Malformed `<i18n>` JSON, or no `<i18n>` block | treated as "no translations" (no crash) |

The `get('key', default)` default applies **only** when the key exists but its value is `null`/`undefined` (a legitimately-optional field). A genuinely **absent** key — where a path segment doesn't exist on its parent — still returns `Missing variable: <path>` even when a default is supplied, so a mistyped key name stays loud. Falsy-but-present values (`""`, `0`, `false`) are returned as-is and never trigger the default.

Only `i18n(…)` / `get(…)` calls, literals, and object arguments are evaluated — operators, member access, arrow functions, etc. are rejected and the marker is left as-is. This keeps expression evaluation a tight, predictable allowlist. Markers must be **single-line**.

## API

### `createI18nPreprocessor({ locale, vars? })`

The convenience factory for the common case. Wires the `get` + `i18n` functions, registers the `<i18n>` component, and returns a `Preprocessor`. `locale` is required; `vars` is optional (defaults to `{}`).

```ts
const pre = createI18nPreprocessor({ locale: 'en', vars: { name: 'Ada' } });
await mjml(src, { preprocessors: [pre] });
```

Construct a **fresh preprocessor per render** (e.g. per request) — each render gets its own translation/variable state, which keeps concurrent renders isolated.

### `createPreprocessor(functions)`

The lower-level building block — pass your own map of functions (each implementing `ProcessorFunction`):

```ts
import {
  createPreprocessor,
  GetFunction,
  I18nFunction,
  registerI18nComponent,
} from '@checkthiscloud/mjml-i18n';

registerI18nComponent(); // needed if your template uses <i18n>
const pre = createPreprocessor({
  get: new GetFunction({ name: 'Ada' }),
  i18n: new I18nFunction('en'),
});
```

### `registerI18nComponent()`

Registers the `<i18n>` head component with `mjml-core` (idempotent). `createI18nPreprocessor` calls it for you; call it yourself only when composing with `createPreprocessor` directly.

### Exports

- `createI18nPreprocessor(opts)` · `createPreprocessor(functions)` · `registerI18nComponent()`
- `GetFunction` · `I18nFunction`
- types: `Preprocessor`, `ProcessorFunction`

## Roadmap

Ideas under consideration — no promises or dates, but where this is likely headed:

- **External translation files** — load messages from separate per-locale files (e.g. `locales/en.json`) instead of only the inline `<i18n>` block, so larger projects don't have to carry translations inside every template.
- **ICU message format** — richer params (pluralization, select, number/date formatting) via a pluggable formatter. Today it's plain `{name}` substitution; the formatting layer is already isolated as a swap-in seam, so this can land without changing the marker syntax.

Got a use case or an opinion? [Open an issue](https://github.com/CheckThisCloud/mjml-i18n/issues).

## License

[MIT](./LICENSE) © EntryLog
