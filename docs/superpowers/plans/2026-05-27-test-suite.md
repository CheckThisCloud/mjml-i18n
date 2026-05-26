# mjml-i18n Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layered, adversarial test suite (Vitest) for the mjml-i18n preprocessor — unit + sandbox + real-mjml integration + one property-based fuzz test — and harden the one DoS defect the tests surface.

**Architecture:** Tests run against `src/` directly (esbuild transforms TS via Vitest); no build step needed. Three tiers in `test/{unit,sandbox,integration}` plus `test/fuzz`. Integration tests drive the real MJML v5 pipeline through Node's `createRequire` (matching the known-working `scratch.ts` pattern). Coverage is report-only (no gate). Threat model: all inputs (template, `vars`, `locale`) treated as hostile.

**Tech Stack:** TypeScript, Vitest, @vitest/coverage-v8, fast-check, mjml v5 (`mjml` + `mjml-core`), jsep + @jsep-plugin/object, fast-xml-parser.

**Spec:** `docs/superpowers/specs/2026-05-27-test-suite-design.md`

**Verified runtime facts (from a probe; bake into assertions):**
- jsep: `i18n('x')`, `get('a.b')`, `i18n('g', { name: get('u') })` → `CallExpression`. `1+2`→`BinaryExpression`; `a.b`→`MemberExpression`; `x`→`Identifier`; `[1,2]`→`ArrayExpression`; `a?b:c`→`ConditionalExpression`; `-1`→`UnaryExpression`. Arrow `()=>1`, template `` `x` ``, spread `...a` / `get('a',...b)` → **parse throw**.
- fast-xml-parser: `doc.mjml.i18n` is a **string** even with `type="json"`; no `<i18n>` → `undefined`; rootless input (`"x"`) → `doc.mjml` is `undefined` (so current `doc.mjml.i18n` throws — the defect).

---

## File Structure

**Create:**
- `vitest.config.ts` — Vitest + coverage config
- `test/helpers/mjml.ts` — `createRequire`-based mjml loader + `render()` helper + `I18nBlock` registration
- `test/integration/render.test.ts` — tracer bullet + integration scenarios
- `test/unit/dotWalk.test.ts`
- `test/unit/format.test.ts`
- `test/unit/getFunction.test.ts`
- `test/unit/i18nFunction.test.ts`
- `test/sandbox/allowed.test.ts`
- `test/sandbox/rejected.test.ts`
- `test/sandbox/adversarial.test.ts`
- `test/fuzz/evaluator.fuzz.test.ts`
- `test/fixtures/attribute.mjml`
- `test/fixtures/no-i18n.mjml`

**Modify:**
- `package.json` — add devDeps + test scripts
- `src/createPreprocessor.ts` — remove 3 `console.log`s
- `src/functions/I18nFunction.ts` — remove 2 `console.log`s + harden `preHook` (decision #3)

**Leave as-is:** root `fixture.mjml` (used by both `scratch.ts` and the tracer bullet).

---

## Task 1: Add Vitest, config, and scripts

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest @vitest/coverage-v8 fast-check
```
Expected: installs without error; the three packages appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
    },
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

Replace the `"scripts"` block so it reads:
```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage"
  },
```

- [ ] **Step 4: Verify Vitest is wired up**

Run: `npx vitest run --passWithNoTests`
Expected: exits 0, prints "No test files found" but does not error on config/install.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add Vitest + coverage config and scripts"
```

---

## Task 2: Remove debug console.logs

Pure cleanup before tests so output isn't flooded. No behavior change.

**Files:**
- Modify: `src/createPreprocessor.ts`
- Modify: `src/functions/I18nFunction.ts`

- [ ] **Step 1: Remove the 3 logs in `createPreprocessor.ts`**

In `src/createPreprocessor.ts`, delete these three lines:
- In the `CallExpression` case: `console.log('Called:', fnName, args);`
- In `evaluateExpression`: `console.log('p', node);`
- In the marker `catch`: `console.log('leave', whole, (e as Error).message);`

The `CallExpression` case body becomes:
```ts
      case 'CallExpression': {
        const fnName = node.callee?.name;
        if (!allowedFunctions[fnName]) {
          throw new Error('Unknown function: ' + fnName);
        }
        const args = node.arguments.map(evaluate);
        return allowedFunctions[fnName].call(...args);
      }
```
`evaluateExpression` becomes:
```ts
  function evaluateExpression(expression: string): unknown {
    const node = jsep(expression);
    return evaluate(node);
  }
```
The marker callback `catch` becomes:
```ts
      } catch {
        return whole; // unknown/unsupported -> leave the marker untouched
      }
```

- [ ] **Step 2: Remove the 2 logs in `I18nFunction.ts`**

In `src/functions/I18nFunction.ts` `preHook`, delete `console.log(doc.mjml.i18n);` and `console.log('Loaded translations:', this.translations);`. (preHook is rewritten in Task 8 — for now just remove the two log lines.)

- [ ] **Step 3: Verify nothing broke**

Run: `npx tsx scratch.ts`
Expected: prints `ok`, writes `out.html`, no `Called:` / `Loaded translations:` debug noise.

- [ ] **Step 4: Commit**

```bash
git add src/createPreprocessor.ts src/functions/I18nFunction.ts
git commit -m "refactor: remove debug console.logs from preprocessor and I18nFunction"
```

---

## Task 3: Integration tracer bullet (proves mjml wiring)

Validates the whole harness — TS transform, mjml interop, `<i18n>` component registration — before building the matrix.

**Files:**
- Create: `test/helpers/mjml.ts`
- Create: `test/integration/render.test.ts`

- [ ] **Step 1: Write the mjml helper**

`test/helpers/mjml.ts`:
```ts
import { createRequire } from 'node:module';
import I18nBlock from '../../src/component/I18nBlock';

// mjml v5 ships CJS; load it the same way scratch.ts does to sidestep interop.
const require = createRequire(import.meta.url);
const { registerComponent } = require('mjml-core');
const mjml = require('mjml');

// The custom <i18n> head component must be registered before rendering.
registerComponent(I18nBlock);

export type MjmlResult = { html: string; errors?: unknown[] };

export type Preprocessor = (xml: string) => string;

export function render(src: string, preprocessors: Preprocessor[]): Promise<MjmlResult> {
  return mjml(src, { preprocessors });
}
```

- [ ] **Step 2: Write the tracer test**

`test/integration/render.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the tracer**

Run: `npx vitest run test/integration/render.test.ts`
Expected: PASS. If it fails on a module-resolution error for `mjml`/`mjml-core`, the `createRequire` form in the helper is the fix — confirm the helper matches Step 1 exactly.

- [ ] **Step 4: Commit**

```bash
git add test/helpers/mjml.ts test/integration/render.test.ts
git commit -m "test: integration tracer bullet rendering fixture through real mjml"
```

---

## Task 4: Unit — dotWalk

**Files:**
- Create: `test/unit/dotWalk.test.ts`

- [ ] **Step 1: Write the tests**

`test/unit/dotWalk.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dotWalk } from '../../src/utils/dotWalk';

describe('dotWalk', () => {
  it('returns a top-level value', () => {
    expect(dotWalk('a', { a: 1 })).toBe(1);
  });

  it('walks nested paths', () => {
    expect(dotWalk('a.b.c', { a: { b: { c: 'deep' } } })).toBe('deep');
  });

  it('returns undefined for a missing leaf', () => {
    expect(dotWalk('a.x', { a: { b: 1 } })).toBeUndefined();
  });

  it('is null-safe through a missing intermediate (no throw)', () => {
    expect(dotWalk('a.x.y', { a: { b: 1 } })).toBeUndefined();
  });

  it('returns undefined when the object itself is undefined', () => {
    expect(dotWalk('a', undefined)).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'blocks the prototype key %s at any segment',
    (key) => {
      expect(dotWalk(key, { a: 1 })).toBeUndefined();
      expect(dotWalk(`a.${key}`, { a: { b: 1 } })).toBeUndefined();
    },
  );

  it.each([
    ['zero', 'n', { n: 0 }, 0],
    ['empty string', 's', { s: '' }, ''],
    ['false', 'b', { b: false }, false],
  ])('returns falsy value %s as-is (not swallowed)', (_label, path, obj, expected) => {
    expect(dotWalk(path, obj as Record<string, unknown>)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/unit/dotWalk.test.ts`
Expected: PASS (all cases describe current correct behavior).

- [ ] **Step 3: Commit**

```bash
git add test/unit/dotWalk.test.ts
git commit -m "test: unit coverage for dotWalk (traversal, null-safety, prototype blocking)"
```

---

## Task 5: Unit — format

**Files:**
- Create: `test/unit/format.test.ts`

- [ ] **Step 1: Write the tests**

`test/unit/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { format } from '../../src/utils/format';

describe('format', () => {
  it('substitutes a single param', () => {
    expect(format('Hi {name}', { name: 'Ada' })).toBe('Hi Ada');
  });

  it('substitutes multiple params', () => {
    expect(format('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('leaves a missing param literal', () => {
    expect(format('Hi {name}', {})).toBe('Hi {name}');
  });

  it('coerces a number param to string', () => {
    expect(format('{n} items', { n: 42 })).toBe('42 items');
  });

  it('substitutes a repeated param every time', () => {
    expect(format('{x}{x}', { x: 'ab' })).toBe('abab');
  });

  it('defaults to no params', () => {
    expect(format('plain text')).toBe('plain text');
  });

  it('leaves non-matching braces literal', () => {
    expect(format('a { } b {}', { foo: 'z' })).toBe('a { } b {}');
  });

  it('matches param names with underscores and digits', () => {
    expect(format('{user_1}', { user_1: 'ok' })).toBe('ok');
  });

  it('stringifies an explicitly-undefined param value', () => {
    // key present but undefined -> "key in params" is true -> String(undefined)
    expect(format('{x}', { x: undefined })).toBe('undefined');
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/unit/format.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/unit/format.test.ts
git commit -m "test: unit coverage for format param substitution"
```

---

## Task 6: Unit — GetFunction

**Files:**
- Create: `test/unit/getFunction.test.ts`

- [ ] **Step 1: Write the tests**

`test/unit/getFunction.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { GetFunction } from '../../src/functions/GetFunction';

describe('GetFunction', () => {
  it('returns a present variable', () => {
    expect(new GetFunction({ name: 'Ada' }).call('name')).toBe('Ada');
  });

  it('walks nested variables', () => {
    expect(new GetFunction({ user: { name: 'Ada' } }).call('user.name')).toBe('Ada');
  });

  it('returns a missing-variable message for an absent key', () => {
    expect(new GetFunction({}).call('nope')).toBe('Missing variable: nope');
  });

  it('treats a blocked prototype key as missing', () => {
    expect(new GetFunction({ a: 1 }).call('__proto__')).toBe('Missing variable: __proto__');
  });

  it('returns a falsy value (0) rather than the fallback', () => {
    expect(new GetFunction({ count: 0 }).call('count')).toBe(0);
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/unit/getFunction.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/unit/getFunction.test.ts
git commit -m "test: unit coverage for GetFunction"
```

---

## Task 7: Unit — I18nFunction (happy paths)

Pins current correct behavior, including the `fast-xml-parser` string shape. The defect/hardening lives in Task 8.

**Files:**
- Create: `test/unit/i18nFunction.test.ts`

- [ ] **Step 1: Write the tests**

`test/unit/i18nFunction.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { I18nFunction } from '../../src/functions/I18nFunction';

const xml = `<mjml>
  <i18n type="json">{ "cs": { "hello": "Ahoj", "deep": { "key": "X" }, "greet": "Hi {name}" },
    "en": { "hello": "Hello" } }</i18n>
  <mj-body></mj-body>
</mjml>`;

describe('I18nFunction', () => {
  it('falls back to the key when called before preHook', () => {
    expect(new I18nFunction('cs').call('hello')).toBe('hello');
  });

  it('returns a translated string after preHook loads the <i18n> block', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('hello')).toBe('Ahoj');
  });

  it('resolves a nested translation key', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('deep.key')).toBe('X');
  });

  it('falls back to the key for a missing translation', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('absent')).toBe('absent');
  });

  it('applies params via format', () => {
    const fn = new I18nFunction('cs');
    fn.preHook(xml);
    expect(fn.call('greet', { name: 'Ada' })).toBe('Hi Ada');
  });

  it('falls back to the key when the locale is absent', () => {
    const fn = new I18nFunction('de');
    fn.preHook(xml);
    expect(fn.call('hello')).toBe('hello');
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/unit/i18nFunction.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/unit/i18nFunction.test.ts
git commit -m "test: unit coverage for I18nFunction happy paths"
```

---

## Task 8: Defect (RED→GREEN) — preHook must not crash the render

Under the hostile threat model, malformed/rootless XML or bad `<i18n>` JSON currently throws out of `preHook` (which runs before the marker try/catch) and crashes the whole render — a DoS. Write the failing test, then harden.

**Files:**
- Test: `test/unit/i18nFunction.test.ts` (append)
- Modify: `src/functions/I18nFunction.ts`

- [ ] **Step 1: Append the failing tests**

Append to `test/unit/i18nFunction.test.ts`:
```ts
describe('I18nFunction.preHook robustness (hostile input)', () => {
  it('does not throw on rootless / non-mjml XML', () => {
    const fn = new I18nFunction('cs');
    expect(() => fn.preHook('just text, no root element')).not.toThrow();
    expect(fn.call('hello')).toBe('hello'); // degrades to no translations
  });

  it('does not throw when there is no <i18n> block', () => {
    const fn = new I18nFunction('cs');
    expect(() => fn.preHook('<mjml><mj-body></mj-body></mjml>')).not.toThrow();
    expect(fn.call('hello')).toBe('hello');
  });

  it('does not throw on malformed <i18n> JSON', () => {
    const fn = new I18nFunction('cs');
    const bad = '<mjml><i18n type="json">{ not valid json }</i18n><mj-body></mj-body></mjml>';
    expect(() => fn.preHook(bad)).not.toThrow();
    expect(fn.call('hello')).toBe('hello');
  });
});
```

- [ ] **Step 2: Run and verify it FAILS**

Run: `npx vitest run test/unit/i18nFunction.test.ts`
Expected: the "rootless" and "malformed JSON" cases FAIL — `preHook` throws (`Cannot read properties of undefined` / `JSON.parse` SyntaxError). The "no <i18n> block" case may already pass.

- [ ] **Step 3: Harden `preHook`**

Replace the `preHook` method in `src/functions/I18nFunction.ts` with:
```ts
  preHook(xml: string) {
    let raw: unknown;
    try {
      const doc = new XMLParser().parse(xml);
      raw = doc?.mjml?.i18n;
    } catch {
      return; // unparseable XML -> no translations
    }

    if (typeof raw !== 'string') {
      return; // no <i18n> block (or unexpected shape) -> no translations
    }

    try {
      this.translations = JSON.parse(raw);
    } catch {
      // malformed <i18n> JSON -> degrade to no translations
    }
  }
```
(`XMLParser` is already imported at the top of the file.)

- [ ] **Step 4: Run and verify it PASSES**

Run: `npx vitest run test/unit/i18nFunction.test.ts`
Expected: PASS (all cases, including the earlier happy paths).

- [ ] **Step 5: Commit**

```bash
git add src/functions/I18nFunction.ts test/unit/i18nFunction.test.ts
git commit -m "fix: preHook degrades gracefully on hostile XML/JSON instead of throwing"
```

---

## Task 9: Sandbox — allowed expressions

Asserts on the resolved XML string returned by the preprocessor (fast, no mjml).

**Files:**
- Create: `test/sandbox/allowed.test.ts`

- [ ] **Step 1: Write the tests**

`test/sandbox/allowed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const I18N_XML =
  '<mjml><i18n type="json">{ "en": { "hello": "Hello", "greet": "Hi {name}" } }</i18n><mj-body></mj-body></mjml>';

function pre(vars: Record<string, unknown> = {}) {
  const i18n = new I18nFunction('en');
  i18n.preHook(I18N_XML);
  return createPreprocessor({ get: new GetFunction(vars), i18n });
}

describe('sandbox: allowed expressions', () => {
  it('resolves a simple i18n marker', () => {
    expect(pre()('x {{ i18n("hello") }} y')).toBe('x Hello y');
  });

  it('resolves a get marker with a string literal arg', () => {
    expect(pre({ name: 'Ada' })('{{ get("name") }}')).toBe('Ada');
  });

  it('passes a number literal arg through', () => {
    // i18n("greet") has no {0}; number arg is simply accepted without throwing
    expect(pre()('{{ i18n("greet", { name: 7 }) }}')).toBe('Hi 7');
  });

  it('resolves an object-expression argument', () => {
    expect(pre()('{{ i18n("greet", { name: "Ada" }) }}')).toBe('Hi Ada');
  });

  it('resolves a nested call inside an object arg (bottom-up eval)', () => {
    expect(pre({ userName: 'Bob' })('{{ i18n("greet", { name: get("userName") }) }}')).toBe('Hi Bob');
  });

  it('resolves multiple markers in one input', () => {
    expect(pre({ name: 'Ada' })('{{ i18n("hello") }}, {{ get("name") }}')).toBe('Hello, Ada');
  });

  it('trims whitespace inside the marker', () => {
    expect(pre()('{{    i18n("hello")    }}')).toBe('Hello');
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/sandbox/allowed.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/sandbox/allowed.test.ts
git commit -m "test: sandbox coverage for allowed expressions (literals, objects, nesting)"
```

---

## Task 10: Sandbox — rejected expressions left verbatim

Every disallowed construct must leave the marker untouched (allowlist wall).

**Files:**
- Create: `test/sandbox/rejected.test.ts`

- [ ] **Step 1: Write the tests**

`test/sandbox/rejected.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre() {
  return createPreprocessor({ get: new GetFunction({ a: 1 }), i18n: new I18nFunction('en') });
}

describe('sandbox: rejected expressions are left verbatim', () => {
  it.each([
    ['unknown function', '{{ nope() }}'],
    ['bare identifier', '{{ x }}'],
    ['member access', '{{ a.b }}'],
    ['member access on a function name', '{{ get.x }}'],
    ['binary operator', '{{ 1 + 2 }}'],
    ['logical operator', '{{ a && b }}'],
    ['ternary', '{{ a ? b : c }}'],
    ['unary', '{{ -1 }}'],
    ['comparison', '{{ 1 < 2 }}'],
    ['array literal', '{{ [1, 2] }}'],
    ['arrow function', '{{ () => 1 }}'],
    ['template literal', '{{ `x` }}'],
    ['assignment', '{{ a = 1 }}'],
    ['sequence', '{{ a, b }}'],
    ['spread in args', '{{ get("a", ...b) }}'],
    ['empty marker (with space)', '{{ }}'],
  ])('leaves %s untouched', (_label, input) => {
    expect(pre()(input)).toBe(input);
  });

  it('does not match an empty {{}} with no inner content', () => {
    expect(pre()('{{}}')).toBe('{{}}');
  });

  it('resolves valid markers but leaves an invalid one beside them', () => {
    const i18n = new I18nFunction('en');
    i18n.preHook('<mjml><i18n type="json">{ "en": { "hi": "Hello" } }</i18n><mj-body></mj-body></mjml>');
    const p = createPreprocessor({ get: new GetFunction({}), i18n });
    expect(p('{{ i18n("hi") }} {{ 1 + 2 }}')).toBe('Hello {{ 1 + 2 }}');
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/sandbox/rejected.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/sandbox/rejected.test.ts
git commit -m "test: sandbox coverage for rejected expressions left verbatim"
```

---

## Task 11: Sandbox — adversarial (pollution, DoS, ReDoS)

**Files:**
- Create: `test/sandbox/adversarial.test.ts`

- [ ] **Step 1: Write the tests**

`test/sandbox/adversarial.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

function pre(vars: Record<string, unknown> = {}) {
  return createPreprocessor({ get: new GetFunction(vars), i18n: new I18nFunction('en') });
}

describe('sandbox: adversarial', () => {
  it('does not pollute Object.prototype via a get() proto path', () => {
    pre({ a: 1 })('{{ get("__proto__.polluted") }}');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not pollute Object.prototype via an object-expression __proto__ key', () => {
    pre()('{{ i18n("k", { "__proto__": { "polluted": true } }) }}');
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not throw on a deeply nested expression (recursion DoS)', () => {
    const depth = 5000;
    const input = `{{ ${'get('.repeat(depth)}'a'${')'.repeat(depth)} }}`;
    let out: string | undefined;
    expect(() => { out = pre({ a: 1 })(input); }).not.toThrow();
    expect(typeof out).toBe('string');
  });

  it('leaves an unterminated marker literal (no hang)', () => {
    const input = '{{ i18n("hello"'; // no closing }}
    expect(pre()(input)).toBe(input);
  });

  it('returns quickly and unchanged for a long no-marker string (ReDoS sanity)', () => {
    const input = '{'.repeat(100000);
    expect(pre()(input)).toBe(input);
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/sandbox/adversarial.test.ts`
Expected: PASS. (If the deep-nesting case ever surfaces an uncaught crash instead of being caught, that is a real finding — revisit decision #2 in the spec and add an input guard.)

- [ ] **Step 3: Commit**

```bash
git add test/sandbox/adversarial.test.ts
git commit -m "test: sandbox adversarial coverage (prototype pollution, recursion DoS, ReDoS)"
```

---

## Task 12: Fuzz — evaluator invariants

One property-based net for escapes not enumerated by hand.

**Files:**
- Create: `test/fuzz/evaluator.fuzz.test.ts`

- [ ] **Step 1: Write the fuzz test**

`test/fuzz/evaluator.fuzz.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createPreprocessor } from '../../src/createPreprocessor';
import { GetFunction } from '../../src/functions/GetFunction';
import { I18nFunction } from '../../src/functions/I18nFunction';

const pre = createPreprocessor({
  get: new GetFunction({ a: 1, b: { c: 2 } }),
  i18n: new I18nFunction('en'),
});

// Tokens biased toward plausibly-hostile expressions.
const token = fc.constantFrom(
  'get', 'i18n', '(', ')', '{', '}', "'a'", '"b"', '.', '+', ',',
  '__proto__', 'constructor', 'prototype', 'x', '1', ' ', '...', '=>', '`', '[', ']', '&&', '?', ':',
);
const expr = fc.array(token, { maxLength: 16 }).map((parts) => parts.join(''));

describe('fuzz: evaluator invariants', () => {
  it('never throws, never pollutes the prototype, and returns a string', () => {
    fc.assert(
      fc.property(expr, (e) => {
        const input = `{{ ${e} }}`;
        let out: unknown;
        expect(() => { out = pre(input); }).not.toThrow();
        expect(typeof out).toBe('string');
        expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
      }),
      { numRuns: 2000 },
    );
  });
});
```

- [ ] **Step 2: Run and verify PASS**

Run: `npx vitest run test/fuzz/evaluator.fuzz.test.ts`
Expected: PASS. If fast-check finds a counterexample (a throw or pollution), it prints the minimal failing input — that is a real escape; fix the evaluator before continuing.

- [ ] **Step 3: Commit**

```bash
git add test/fuzz/evaluator.fuzz.test.ts
git commit -m "test: property-based fuzz for evaluator invariants"
```

---

## Task 13: Integration — attributes, locale, isolation

Extends the integration tier with the scenarios that require the real MJML render.

**Files:**
- Create: `test/fixtures/attribute.mjml`
- Create: `test/fixtures/no-i18n.mjml`
- Test: `test/integration/render.test.ts` (append)

- [ ] **Step 1: Create the attribute fixture**

`test/fixtures/attribute.mjml`:
```xml
<mjml>
  <i18n type="json">{ "en": { "label": "Click me" } }</i18n>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-button href="{{ get('url') }}">{{ i18n('label') }}</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

- [ ] **Step 2: Create the no-i18n fixture**

`test/fixtures/no-i18n.mjml`:
```xml
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>{{ i18n('hello') }}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

- [ ] **Step 3: Append the integration scenarios**

Append to `test/integration/render.test.ts`:
```ts
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
    expect(cs.html).toContain('Ahoj světe');
    expect(cs.html).not.toContain('Hello World');
    expect(en.html).toContain('Hello World');
    expect(en.html).not.toContain('Ahoj světe');
  });
});
```

- [ ] **Step 4: Run and verify PASS**

Run: `npx vitest run test/integration/render.test.ts`
Expected: PASS (tracer + all scenarios).

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/attribute.mjml test/fixtures/no-i18n.mjml test/integration/render.test.ts
git commit -m "test: integration scenarios (attributes, locale switch, i18n strip, isolation)"
```

---

## Task 14: Full run + coverage report

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all test files PASS, exit 0.

- [ ] **Step 2: Generate the coverage report**

Run: `npm run test:cov`
Expected: prints a text coverage table and writes `coverage/` (html + lcov). `createPreprocessor`, `dotWalk`, `format`, `GetFunction`, `I18nFunction` should show high line/branch coverage. Coverage is report-only — it never fails the run.

- [ ] **Step 3: Confirm `coverage/` is gitignored**

Run: `git status --short`
Expected: `coverage/` does NOT appear (it is already in `.gitignore`). Nothing to commit unless source/tests changed.

---

## Self-Review Notes

- **Spec coverage:** Unit tier → Tasks 4–7; sandbox allow/reject/adversarial → Tasks 9–11; integration (tracer, attributes, `<i18n>` strip, async/clean, locale, concurrency) → Tasks 3 & 13; fuzz → Task 12; coverage report-only → Tasks 1 & 14; console.log removal → Task 2; preHook hardening (decision #3) → Task 8; single-line markers (decision #1) pinned by the empty/unterminated cases in Tasks 10–11; no recursion cap (decision #2) tested in Task 11. All spec sections map to a task.
- **Types/signatures consistent across tasks:** `render(src, preprocessors)` and `preprocessorFor(locale, vars?)` defined in Task 3 and reused in Task 13; `pre(...)` helpers are file-local per sandbox test.
- **Out of scope (unchanged):** leaf HTTP contract, dist/ smoke test, ICU/messageformat.
