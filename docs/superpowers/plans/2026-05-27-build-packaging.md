# Build & Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mjml-i18n` buildable and publishable — add a tsconfig + ambient types, a public `index.ts` (with a `createI18nPreprocessor` convenience factory), a tsup dual ESM/CJS build, and post-build artifact verification.

**Architecture:** Tests still run against `src/` (Vitest). tsup bundles `src/index.ts` into `dist/` as ESM + CJS + `.d.ts`. `mjml`/`mjml-core` become peerDependencies (consumer-provided single instance) + devDependencies (local resolution). Two post-build smoke scripts verify the `@jsep-plugin/object` plugin survives bundling in both output formats.

**Tech Stack:** TypeScript (strict, `moduleResolution: bundler`), tsup (esbuild), Vitest, mjml v5 (peer), jsep + @jsep-plugin/object, fast-xml-parser.

**Spec:** `docs/superpowers/specs/2026-05-27-build-packaging-design.md`

**Verified facts (bake into tasks):**
- Under the planned strict tsconfig, the ONLY type errors are 2× `TS7016` for `mjml-core` (in `scratch.ts` and `src/component/I18nBlock.ts`). The ambient `mjml-core` declaration clears both; nothing else errors. `require('mjml')` does not error (returns `any`).
- esbuild treats every file as an isolated module, so type-only re-exports in `index.ts` MUST use `export type { ... }` (a value `export { ProcessorFunction }` of an interface fails the build). Value exports use `export { ... }`.
- The smoke check uses `createPreprocessor` + a dummy function, so it needs no `mjml`/`mjml-core` at runtime — only that object-expression parsing works.
- `JSON.stringify([{ x: 1 }])` is `'[{"x":1}]'`, which contains the substring `{"x":1}`.

**Commit rule:** no `Co-Authored-By` trailer on any commit (project preference).

---

## File Structure

**Create:**
- `tsconfig.json` — typecheck/editor config (tsup emits)
- `src/types/mjml.d.ts` — ambient declarations for untyped `mjml`/`mjml-core`
- `src/index.ts` — public entry (re-exports + `createI18nPreprocessor` + `registerI18nComponent`)
- `tsup.config.ts` — dual ESM/CJS build config
- `scripts/smoke.mjs`, `scripts/smoke.cjs` — post-build artifact verification
- `LICENSE` — MIT, `Copyright (c) 2026 EntryLog`
- `test/integration/public-api.test.ts` — end-to-end test of `createI18nPreprocessor`

**Modify:**
- `package.json` — deps reclassification, publish/build fields, scripts, version, description, author, license
- `src/createPreprocessor.ts` — export a `Preprocessor` type and annotate the return type

**Leave as-is:** all existing `src/` logic, all existing tests, `scratch.ts`, `fixture.mjml`, `.gitignore` (already ignores `dist/`).

---

## Task 1: tsconfig + ambient types (clears TS7016)

**Files:**
- Create: `tsconfig.json`
- Create: `src/types/mjml.d.ts`
- Modify: `package.json` (add `typecheck` script)

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"],
    "verbatimModuleSyntax": false
  },
  "include": ["src", "test", "scratch.ts", "vitest.config.ts", "tsup.config.ts"]
}
```

- [ ] **Step 2: Confirm the 2 expected errors exist (RED)**

Run: `npx tsc --noEmit`
Expected: FAIL with exactly two `TS7016` errors — `scratch.ts` and `src/component/I18nBlock.ts`, both "Could not find a declaration file for module 'mjml-core'".

- [ ] **Step 3: Create `src/types/mjml.d.ts`**

```ts
declare module 'mjml-core' {
  export class HeadComponent {}
  export function registerComponent(component: unknown): void;
}

declare module 'mjml' {
  const mjml: (
    src: string,
    opts?: { preprocessors?: ((xml: string) => string)[] },
  ) => Promise<{ html: string; errors?: unknown[] }>;
  export default mjml;
}
```

- [ ] **Step 4: Add the `typecheck` script to `package.json`**

In the `"scripts"` block, add:
```json
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Confirm typecheck is clean (GREEN)**

Run: `npm run typecheck`
Expected: exits 0, no errors. If any error *other* than the (now-fixed) two appears, STOP and report it — do not silence it by loosening `strict`.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json src/types/mjml.d.ts package.json
git commit -m "build: add tsconfig + ambient mjml/mjml-core types"
```

---

## Task 2: Reclassify mjml/mjml-core as peer + dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Move `mjml` and `mjml-core` out of `dependencies`**

Edit `package.json` so `dependencies` keeps only the genuinely-imported runtime libs:
```json
  "dependencies": {
    "@jsep-plugin/object": "^1.2.2",
    "fast-xml-parser": "^5.8.0",
    "jsep": "^1.4.0"
  },
```

- [ ] **Step 2: Add `peerDependencies` and add the two libs to `devDependencies`**

Add a `peerDependencies` block:
```json
  "peerDependencies": {
    "mjml": "^5.2.2",
    "mjml-core": "^5.2.2"
  },
```
And add `mjml` + `mjml-core` into the existing `devDependencies` block (so tests/scratch/build still resolve them):
```json
    "mjml": "^5.2.2",
    "mjml-core": "^5.2.2"
```

- [ ] **Step 3: Refresh the lockfile**

Run: `npm install`
Expected: completes without error; `mjml`/`mjml-core` remain present in `node_modules` (now via devDependencies).

- [ ] **Step 4: Verify nothing broke**

Run: `npm test && npm run typecheck`
Expected: 77 tests pass; typecheck clean. (The package code is unchanged; this only reclassifies where the deps are declared.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: make mjml/mjml-core peer + dev dependencies"
```

---

## Task 3: Public API entry + `Preprocessor` type + factory

**Files:**
- Modify: `src/createPreprocessor.ts`
- Create: `src/index.ts`
- Test: `test/integration/public-api.test.ts`

- [ ] **Step 1: Export a `Preprocessor` type from `createPreprocessor.ts`**

In `src/createPreprocessor.ts`, add this type near the top (after the imports) and annotate the function's return type. Add:
```ts
export type Preprocessor = (xml: string) => string;
```
Change the function signature line from:
```ts
export function createPreprocessor(allowedFunctions: Record<string, ProcessorFunction>) {
```
to:
```ts
export function createPreprocessor(allowedFunctions: Record<string, ProcessorFunction>): Preprocessor {
```
(The existing `return function(xml: string) { ... }` already matches this type — no other change.)

- [ ] **Step 2: Write the failing public-API test**

Create `test/integration/public-api.test.ts`:
```ts
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
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/integration/public-api.test.ts`
Expected: FAIL — cannot resolve `../../src/index` (file doesn't exist yet).

- [ ] **Step 4: Create `src/index.ts`**

```ts
import { registerComponent } from 'mjml-core';
import I18nBlock from './component/I18nBlock';
import { createPreprocessor, type Preprocessor } from './createPreprocessor';
import { GetFunction } from './functions/GetFunction';
import { I18nFunction } from './functions/I18nFunction';
import type { ProcessorFunction } from './functions/ProcessorFunction';

export { createPreprocessor, GetFunction, I18nFunction };
export type { Preprocessor, ProcessorFunction };

let registered = false;

/** Register the <i18n> head component with mjml-core. Idempotent. */
export function registerI18nComponent(): void {
  if (registered) return;
  registerComponent(I18nBlock);
  registered = true;
}

/**
 * Convenience factory wiring the standard `get` + `i18n` functions for one render.
 * Ensures the <i18n> head component is registered. `vars` is optional.
 */
export function createI18nPreprocessor(opts: {
  vars?: Record<string, unknown>;
  locale: string;
}): Preprocessor {
  registerI18nComponent();
  return createPreprocessor({
    get: new GetFunction(opts.vars ?? {}),
    i18n: new I18nFunction(opts.locale),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes (GREEN)**

Run: `npx vitest run test/integration/public-api.test.ts`
Expected: PASS (both cases). If the `<i18n` assertion fails (tag not stripped), the factory's registration isn't taking effect — report it rather than weakening the test.

- [ ] **Step 6: Verify typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass (was 77, now 79 with the two new cases).

- [ ] **Step 7: Commit**

```bash
git add src/createPreprocessor.ts src/index.ts test/integration/public-api.test.ts
git commit -m "feat: public index.ts entry with createI18nPreprocessor factory + Preprocessor type"
```

---

## Task 4: tsup config, package.json publish fields, LICENSE

**Files:**
- Create: `tsup.config.ts`
- Create: `LICENSE`
- Modify: `package.json`

- [ ] **Step 1: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['mjml', 'mjml-core'],
});
```

- [ ] **Step 2: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 EntryLog

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Update `package.json` top-level + publish fields**

Set these fields (changing `version`, `description`, `license`, `type`, `main`; adding `author`, `module`, `types`, `exports`, `files`, `sideEffects`):
```json
  "version": "0.0.1",
  "description": "Variable interpolation + i18n for MJML v5 via a single preprocessor. Experimental (pre-1.0); API may change.",
  "author": "EntryLog",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
```

- [ ] **Step 4: Add build scripts to `package.json`**

Add to the `"scripts"` block:
```json
    "build": "tsup",
    "verify:build": "tsup && node scripts/smoke.mjs && node scripts/smoke.cjs",
    "prepublishOnly": "npm run build"
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds; `ls dist` shows `index.js`, `index.cjs`, `index.d.ts` (plus `.map` files). If tsup's dts step errors on `mjml-core`, the ambient declaration from Task 1 should already cover it — report if it doesn't.

- [ ] **Step 6: Verify the `type: module` flip didn't break dev tooling**

Run: `npm test && npm run typecheck`
Expected: all tests pass (was 79); typecheck clean. (Vitest config, the createRequire helper, and the new test all work under `"type": "module"`.)

- [ ] **Step 7: Confirm `dist/` is gitignored**

Run: `git status --short`
Expected: `dist/` does NOT appear (already in `.gitignore`).

- [ ] **Step 8: Commit**

```bash
git add tsup.config.ts LICENSE package.json
git commit -m "build: tsup dual ESM/CJS config + publish fields + MIT LICENSE"
```

---

## Task 5: Post-build smoke scripts (artifact verification)

**Files:**
- Create: `scripts/smoke.mjs`
- Create: `scripts/smoke.cjs`

- [ ] **Step 1: Create `scripts/smoke.mjs`**

```js
import { createPreprocessor } from '../dist/index.js';

const pre = createPreprocessor({
  echo: { call: (...args) => JSON.stringify(args) },
});
const out = pre('{{ echo({ x: 1 }) }}');

if (!out.includes('{"x":1}')) {
  console.error('FAIL (esm): object-expression parsing broken in built artifact:', out);
  process.exit(1);
}
console.log('smoke (esm) OK:', out);
```

- [ ] **Step 2: Create `scripts/smoke.cjs`**

```js
const { createPreprocessor } = require('../dist/index.cjs');

const pre = createPreprocessor({
  echo: { call: (...args) => JSON.stringify(args) },
});
const out = pre('{{ echo({ x: 1 }) }}');

if (!out.includes('{"x":1}')) {
  console.error('FAIL (cjs): object-expression parsing broken in built artifact:', out);
  process.exit(1);
}
console.log('smoke (cjs) OK:', out);
```

- [ ] **Step 3: Run the full build + verification**

Run: `npm run verify:build`
Expected: tsup rebuilds, then both smoke scripts print `smoke (esm) OK: [{"x":1}]` and `smoke (cjs) OK: [{"x":1}]` and exit 0. If either prints `FAIL ... object-expression parsing broken`, the `@jsep-plugin/object` plugin did not survive bundling — STOP and report (this is the exact risk the HANDOFF flagged; the fix would be adjusting how the plugin is imported/registered, not weakening the smoke check).

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs scripts/smoke.cjs
git commit -m "build: post-build smoke scripts verifying jsep-object plugin in ESM + CJS artifacts"
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

Run: `npm run typecheck && npm test && npm run verify:build`
Expected: typecheck clean; all tests pass (79); build + both smoke scripts green.

- [ ] **Step 2: Confirm the published file set is correct**

Run: `npm pack --dry-run`
Expected: the tarball contents are `dist/**`, `package.json`, `LICENSE` (and `README` if one exists) — and NOT `src/`, `test/`, `scratch.ts`, or `docs/`. (Driven by `"files": ["dist"]`; npm always includes `package.json` + `LICENSE`.)

- [ ] **Step 3: Confirm a clean working tree**

Run: `git status --short`
Expected: empty (no `dist/`, no stray files).

---

## Self-Review Notes

- **Spec coverage:** dual tsup build → Task 4; `type: module` + exports/main/module/types/files/sideEffects → Task 4; peer+dev deps → Task 2; deps kept (jsep/@jsep-plugin/object/fast-xml-parser) → Task 2; version 0.0.1 + experimental description → Task 4; MIT license + LICENSE file + author → Task 4; public API (createPreprocessor, createI18nPreprocessor, registerI18nComponent, GetFunction, I18nFunction, ProcessorFunction, Preprocessor) → Task 3; `I18nBlock` internal (not exported) → Task 3 (index.ts doesn't export it); idempotent factory registration → Task 3 (`registered` guard); locale required / vars optional → Task 3 (factory signature + test); tsconfig + ambient types → Task 1; artifact smoke verification (both formats) → Task 5. All spec sections map to a task.
- **Type/signature consistency:** `Preprocessor` defined in `createPreprocessor.ts` (Task 3) and re-exported + used as the factory return type (Task 3); `createI18nPreprocessor({ vars?, locale })` and `registerI18nComponent()` signatures match the spec and the Task 3 test. `export type` used for the two type-only exports (matches the esbuild-isolated-modules constraint noted in the header).
- **Out of scope (unchanged):** leaf integration, actually running `npm publish`, ICU/messageformat, member-access hardening.
