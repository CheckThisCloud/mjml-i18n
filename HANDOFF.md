# mjml-i18n — Handoff

## What this is

A **publishable npm package** that adds **variable interpolation + i18n** to **MJML v5**, via a single MJML *preprocessor*. It exists to replace EntryLog's current setup where `.mjml` emails are run through **Twig only to get translations** (`{{ 'key'|trans }}`) — eliminating the Twig→MJML double-compile. Inspired by vue-i18n's co-located translations.

**Consumer:** the `leaf` service's `POST /mjml` endpoint will accept `{ mjml, vars, locale }` and run this preprocessor. `leaf` will be upgraded to MJML v5 for this.

## Core idea

Templates contain `{{ ... }}` markers whose interior is a **function-call expression**:

```mjml
{{ i18n('hello-world') }}
{{ get('user.name') }}
{{ i18n('greeting', { name: get('userName') }) }}   <!-- nesting -->
```

A single **preprocessor** (passed to `mjml(src, { preprocessors: [...] })`) resolves all markers on the **raw XML, before MJML parses/PostCSS-sanitizes** — which is why markers work inside attributes/styles and sidestep v5's `{{ }}`-sanitization.

## Pipeline

1. `createPreprocessor(allowedFunctions)` → returns the preprocessor fn.
2. On invocation: run each function's `preHook(xml)` once (i18n parses its `<i18n>` block here), then `xml.replace(/{{(.+?)}}/g, ...)`.
3. Per marker: `jsep(inner)` → AST → recursive `evaluate(node)`:
   - `Literal` → `node.value`
   - `CallExpression` → look up `allowedFunctions[callee.name]`, evaluate args recursively, `instance.call(...args)`
   - `ObjectExpression` → build `{}`, recursing on property values (key = `p.key.name ?? p.key.value`)
   - anything else (operators, etc.) → **throw** (allowlist wall)
   - unknown function → **throw**
4. Marker callback: `try { return String(evaluate(...)) } catch { return whole }` — unknown/unsupported markers are **left untouched**.

## Key decisions (settled — don't relitigate)

- **jsep over acorn** — smaller, fails safer; but the node-type allowlist is still the real boundary. Needs `@jsep-plugin/object` **registered** (`jsep.plugins.register(jsepObject)`) or `{}` won't parse.
- **One preprocessor + recursive evaluator**, NOT two ordered string passes. Nesting (`i18n(..., { x: get(...) })`) falls out of bottom-up eval with live typed values — no serialize/reparse round-trip.
- **Functions = registry of stateful instances** implementing `ProcessorFunction { call(...args), preHook?(xml) }`. `GetFunction(vars)`, `I18nFunction(locale)` take data via **constructor**.
- **Construct per render** (per leaf request). That's concurrency-safe because each render gets fresh instances — no shared mutable state. `preHook`/`call` MUST stay synchronous (an `await` reintroduces races under concurrent renders).
- **i18n params = `{name}` single-brace syntax** (ICU-compatible, no collision with outer `{{ }}`). `format()` does plain substitution — **no ICU library** ("just params" for now). Missing params **left literal** (`{name}`). `format` is its own file = swap seam for `@messageformat/core` later if plurals are ever needed.
- MJML **v5** (async `mjml2html` — must `await`).

## Current state (working + verified)

- `{{ i18n('hello-world') }}` → translated; `{{ i18n('foo.bar') }}` → graceful key fallback.
- Nested `i18n('foo', { x: get('bar') })` → evaluates to `i18n('foo', { x: <resolved> })` (verified the recursion builds the typed object).
- Operators (`1 + 2`) throw `Unsupported`; unknown fns throw and leave the marker.
- `format()` substitutes `{name}`, leaves missing literal, coerces numbers.
- `dotWalk` hardened: null-safe traversal (`result?.[path]`) + blocks `__proto__`/`constructor`/`prototype`.
- Code restructured into `src/` (`createPreprocessor.ts`, `functions/{GetFunction,I18nFunction,ProcessorFunction}.ts`, `utils/{dotWalk,format}.ts`, `component/I18nBlock.ts`). `scratch.ts` is the dev harness (run: `npx tsx scratch.ts`, output `out.html`).

## TODO (in rough order)

1. **TS setup + errors.** No `tsconfig.json` exists yet — create one (ESM, `moduleResolution: bundler`, `strict`, for tsup). Surfaced errors so far: 2× **TS7016 `mjml-core` has no type declarations** (in `scratch.ts` and `component/I18nBlock.ts`). Fix with a `declare module 'mjml-core'` (and likely `'mjml'`) ambient `.d.ts`. More errors may appear once those resolve (jsep nodes are typed loosely — keep `evaluate`'s `node` as `any` or narrow per type).
2. **tsup build + public `index.ts` entry.** Export `createPreprocessor`, the function classes, types. Verify the `@jsep-plugin/object` default-import registration still works in the **built artifact** (the plugin is `{ name, init }`, no `.default` — works under tsx, confirm post-build).
3. **leaf integration.** `POST /mjml`: accept `{ mjml, vars, locale }`, validate (vars object, locale string + fallback), construct preprocessor **inside the handler** (per request), `await mjml(...)`. Keep try/catch → 400.
4. **(deferred) ICU/messageformat** — only if plurals become real. Swap `format()` body; `call(key, params)` signature unchanged. Add a module-level compiled-message cache for mass-send.
5. **(deferred) member-access hardening** — only if bare `{{ user.name }}` (non-`get()`) is ever allowed: reject computed member access + the prototype keys (dotWalk already blocks the latter).

## Run / verify

```bash
cd /Users/michalkral/www/mjml-i18n
npx tsx scratch.ts          # renders fixture.mjml → out.html
```

Note: MJML is **v5.2.2** (async). `mjml` is imported via `const mjml = require('mjml')` and must be `await`ed.
