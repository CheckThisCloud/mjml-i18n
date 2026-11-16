# @checkthiscloud/mjml-i18n

> i18n, variable interpolation, loops and conditions for [MJML v5](https://mjml.io) email templates — a single preprocessor with co-located, vue-i18n-style translations.

> ⚠️ **Experimental (pre-1.0).** The API may change between `0.x` releases.

Run your `.mjml` templates through one preprocessor that resolves `{{ … }}` markers — translations, variables, `for` loops and `if` blocks — on the raw XML **before** MJML parses it. No more compiling templates through a separate template engine just to get translations.

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
| `{{ get('path') }}` | a value from `vars`, HTML-escaped (dot-path supported: `get('user.name')`) |
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

### Escaping

Translations are part of the template, so their markup is kept. **Values from `vars` are data**, so `get()` escapes them: `&`, `<`, `>`, `"` and `'` become entities. A name like `Tom & <Jerry>` prints as text instead of becoming an element, and a value with a `"` cannot break out of the attribute it sits in.

```xml
<mj-text>{{ get('comment') }}</mj-text>              <!-- "<b>hi</b>" prints as &lt;b&gt;hi&lt;/b&gt; -->
<mj-button href="{{ get('url') }}">Open</mj-button>  <!-- "?a=1&b=2" lands as ?a=1&amp;b=2, read by the browser as ?a=1&b=2 -->
```

- Strings inside a list or an object read by `get()` are escaped too, so a value handed on as `i18n()` params carries no raw markup: `{{ i18n('hi', { name: get('name') }) }}` keeps the translation's `<strong>` and escapes the name.
- Numbers and booleans pass through unchanged.
- A `Date`, a `URL` or any other non-plain object prints through its own `String()` form, escaped. Only arrays and plain objects are walked.
- A `get(key, default)` default is template text and is printed as written.
- A printed value is never parsed again: a value that looks like `{{ get('secret') }}` prints literally.

## Blocks

Loops and conditions use the same `{{ … }}` markers, as statements:

```xml
{{ if items }}
  {{ for item in items }}
  <mj-section>
    <mj-column>
      <mj-text>{{ get('item.title') }}</mj-text>
      <mj-text>{{ i18n('guests', { count: get('item.guests') }) }}</mj-text>
      {{ if item.note }}<mj-text>{{ get('item.note') }}</mj-text>{{ endif }}
    </mj-column>
  </mj-section>
  {{ endfor }}
{{ else }}
  <mj-section><mj-column><mj-text>{{ i18n('empty') }}</mj-text></mj-column></mj-section>
{{ endif }}
```

| Statement | Meaning |
| --- | --- |
| `{{ for item in path }}` … `{{ endfor }}` | repeat the body once per element of the list at `path` |
| `{{ if path }}` … `{{ endif }}` | keep the body when the value at `path` is truthy |
| `{{ if path }}` … `{{ else }}` … `{{ endif }}` | otherwise keep the `else` branch |

- **The loop variable** (`item`) is visible in `get()`, in `i18n()` params and in nested blocks. It shadows a variable of the same name for the length of the loop.
- **A loop variable owns its name:** inside `{{ for item in items }}`, `get('item.typo')` reports `Missing variable: item.typo` rather than reading a global `item`.
- **Truthiness:** `false`, `null`, `undefined`, `''`, `0`, `NaN` and an empty list are false; everything else (including `'0'` and an empty object) is true.
- **No operators.** A block takes a path, never an expression: compute flags (`order.isLate`) and counts in the data you pass in.
- Blocks nest freely, a `for` inside a `for` included. A statement's path follows the same dot-path rules as `get()`.
- Blocks are markers like any other, so a statement must stay on one line. Text around a statement (newlines, indentation) is kept as written.

## Fallbacks & behavior

Nothing this package does throws into your render — unresolved markers degrade gracefully:

| Situation | Result |
| --- | --- |
| Missing translation key | the key itself (`i18n('foo.bar')` → `foo.bar`) |
| Missing variable | `Missing variable: <path>` |
| Variable present but `null`, with a default | `get('key', default)` → `default` |
| Variable present but `null`, no default | `Missing variable: <path>` |
| Malformed `get` path (empty, or empty segment like `a.` / `a..b`) | `Invalid variable path: '<path>'` |
| Missing translation param | left literal (`{name}`) |
| Unknown function / unsupported expression | the marker is left **untouched** in the output |
| Malformed `<i18n>` JSON, or no `<i18n>` block | treated as "no translations" (no crash) |
| `for` / `if` over a missing path | `Missing variable: <path>` in place of the block |
| `for` / `if` over a malformed path | `Invalid variable path: '<path>'` in place of the block |
| `for` over `null` / `undefined` | nothing (an optional list that is absent today) |
| `for` over something that is not a list | `Not a list: <path>` in place of the block |
| `endfor` / `endif` / `else` with no matching block | `Unexpected endfor` (… `endif`, `else`) where it stood; the open block stays open |
| A block never closed | `Unclosed block: <statement>` where it opened, then its content rendered once |
| Blocks nested too deep to render (thousands of levels) | the whole template is returned as written |

The `get('key', default)` default applies **only** when the key exists but its value is `null`/`undefined` (a legitimately-optional field). A genuinely **absent** key — where a path segment doesn't exist on its parent — still returns `Missing variable: <path>` even when a default is supplied, so a mistyped key name stays loud. Falsy-but-present values (`""`, `0`, `false`) are returned as-is and never trigger the default.

A **malformed** path — empty (`get('')`) or containing an empty segment (`get('a.')`, `get('a..b')`) — is a template-authoring typo rather than missing data, so it surfaces distinctly as `Invalid variable path: '<path>'`. A supplied default never masks it.

Only `i18n(…)` / `get(…)` calls, literals, and object arguments are evaluated — operators, member access, arrow functions, etc. are rejected and the marker is left as-is. Block statements are a fixed set of shapes (`for <name> in <path>`, `endfor`, `if <path>`, `else`, `endif`); anything else that merely looks like one (`if(a)`, `if a && b`, `for x of xs`) is an ordinary marker and is left as-is too. This keeps evaluation a tight, predictable allowlist. Markers must be **single-line**.

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
