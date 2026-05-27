# Build & Packaging Design — mjml-i18n

**Date:** 2026-05-27
**Status:** Approved (design); pending implementation plan

## Goal

Make `mjml-i18n` buildable and publishable (HANDOFF TODO #1 + #2): add a `tsconfig`, ambient type declarations for the untyped `mjml`/`mjml-core`, a public `index.ts` entry, and a tsup dual build — so the package can be installed and consumed by the `leaf` service. The package is currently not publishable (no build, no entry, `main` points at a nonexistent `index.js`).

## Decisions (settled during brainstorming)

- **Dual build: ESM + CJS.** tsup emits both, with a package.json `exports` map and `.d.ts`. Safe regardless of leaf's module system.
- **`"type": "module"`.** ESM-first; CJS provided via `exports.require` + `.cjs` files.
- **`mjml` + `mjml-core` → peerDependencies + devDependencies.** Removed from `dependencies`. Peer declares the version contract (`^5`) and, critically, forces a *single shared* `mjml-core` instance so `registerComponent` lands on the registry the consumer's `mjml` actually reads (a plain dependency could install a duplicate, breaking `<i18n>` recognition). Dev so tests/scratch/build resolve them locally.
- **Runtime dependencies kept:** `jsep`, `@jsep-plugin/object`, `fast-xml-parser` (genuinely imported by package code).
- **Version `0.0.1`** + an "experimental / pre-1.0, API may change" note in `description`. No `-alpha` prerelease tag and no `--tag alpha` publish — the `0.x` version itself signals experimental stability.
- **License: MIT**, `Copyright (c) 2026 EntryLog` (the most common permissive license for an npm package; replaces the current `ISC`). Ship a `LICENSE` file (npm includes it automatically regardless of the `files` field). `package.json` `author: "EntryLog"`.
- **Public API = building blocks + a convenience factory.**
- **`I18nBlock` stays internal** (not exported). `registerI18nComponent()` is the supported registration path; keeping the class unexported keeps the untyped `mjml-core` base out of the public `.d.ts`.
- **Registration:** the factory registers the `<i18n>` component idempotently; a standalone `registerI18nComponent()` is also exported for building-blocks users.
- **`locale` required, `vars` optional** on the factory.

## Out of scope

- The `leaf` `POST /mjml` integration (TODO #3; separate repo, needs this build first).
- Actually running `npm publish` (this delivers a publishable package, not the publish action).
- ICU/messageformat and member-access hardening (deferred per HANDOFF).

## Dependencies & package.json

Reclassify dependencies:

```jsonc
"dependencies": {
  "@jsep-plugin/object": "^1.2.2",
  "fast-xml-parser": "^5.8.0",
  "jsep": "^1.4.0"
},
"peerDependencies": {
  "mjml": "^5.2.2",
  "mjml-core": "^5.2.2"
},
"devDependencies": {
  // existing devDeps (vitest, tsup, tsx, typescript, @types/node, @vitest/coverage-v8, fast-check)
  // PLUS mjml + mjml-core moved here so tests/scratch/build resolve them
  "mjml": "^5.2.2",
  "mjml-core": "^5.2.2"
}
```

Publish/build fields:

```jsonc
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
"scripts": {
  "build": "tsup",
  "verify:build": "tsup && node scripts/smoke.mjs && node scripts/smoke.cjs",
  "typecheck": "tsc --noEmit",
  "prepublishOnly": "npm run build",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage"
}
```

`"type": "module"` is verified-safe for the existing dev flow: `vitest.config.ts` (ESM), `scratch.ts` (run via tsx), and `test/helpers/mjml.ts` (uses `createRequire`) all keep working.

## TypeScript config

`tsconfig.json` — typecheck/editor only; tsup performs the emit:

```jsonc
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

## Ambient type declarations

`src/types/mjml.d.ts` — minimal, only what the package uses, to clear the two `TS7016` errors:

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

## Public API (`src/index.ts`)

A `Preprocessor` type is promoted to a real exported type (currently duplicated in `test/helpers/mjml.ts`), and `createPreprocessor` returns it.

Exports:
- `createPreprocessor(allowedFunctions: Record<string, ProcessorFunction>): Preprocessor`
- `createI18nPreprocessor(opts: { vars?: Record<string, unknown>; locale: string }): Preprocessor`
  - Wires `{ get: new GetFunction(opts.vars ?? {}), i18n: new I18nFunction(opts.locale) }`.
  - Calls `registerI18nComponent()` (idempotent) before returning, so the `<i18n>` tag is recognized without caller action.
- `registerI18nComponent(): void`
  - Idempotent (module-level `registered` guard); calls `registerComponent(I18nBlock)` from the peer `mjml-core`.
- `GetFunction`, `I18nFunction` (classes)
- `ProcessorFunction` (interface), `Preprocessor` (type alias `(xml: string) => string`)

NOT exported: `I18nBlock`, `dotWalk`, `format` (internal).

How a consumer uses it (informative):

```ts
import { createI18nPreprocessor } from 'mjml-i18n';
import mjml from 'mjml';

const pre = createI18nPreprocessor({ locale: 'en', vars: { name: 'Ada' } });
const { html } = await mjml(templateWithI18nBlock, { preprocessors: [pre] });
```

## tsup build

`tsup.config.ts`:

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

Produces `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts`, and sourcemaps. Peers are never bundled; declared `dependencies` (jsep, @jsep-plugin/object, fast-xml-parser) remain external and are installed transitively.

## Artifact verification

The HANDOFF flags a risk: `@jsep-plugin/object` is a default import (`{ name, init }`, no `.default`) registered via `jsep.plugins.register(jsepObject)`; this could behave differently once bundled, and if it fails to register, `{}` object expressions stop parsing.

Two post-build smoke scripts verify both outputs without needing `mjml`:

- `scripts/smoke.mjs` — `import { createPreprocessor } from '../dist/index.js'`
- `scripts/smoke.cjs` — `const { createPreprocessor } = require('../dist/index.cjs')`

Each builds a preprocessor with a dummy echo function and resolves a marker containing an **object expression**, asserting object parsing works in the built artifact:

```js
const pre = createPreprocessor({
  echo: { call: (...args) => JSON.stringify(args) },
});
const out = pre('{{ echo({ x: 1 }) }}');
if (!out.includes('"x":1') && !out.includes('{"x":1}')) {
  throw new Error('object-expression parsing broken in built artifact: ' + out);
}
```

Wired into `npm run verify:build` (`tsup && node scripts/smoke.mjs && node scripts/smoke.cjs`). A failure here means the jsep object plugin did not survive bundling.

## Testing impact

- Existing 77 tests run against `src/` and are unaffected by the build; they continue to pass.
- `test/helpers/mjml.ts` currently defines a local `Preprocessor` type — after `Preprocessor` is exported from the package, the helper may import it from `../../src/index` (optional tidy-up, not required).
- New verification: `npm run verify:build` must pass (both smoke scripts green), and `npm run typecheck` must pass with the ambient declarations in place.

## File structure

**Create:**
- `tsconfig.json`
- `tsup.config.ts`
- `src/index.ts` (public entry)
- `src/types/mjml.d.ts` (ambient declarations)
- `scripts/smoke.mjs`, `scripts/smoke.cjs`
- `LICENSE` (MIT, `Copyright (c) 2026 EntryLog`)

**Modify:**
- `package.json` (deps reclassification + publish/build fields + scripts + version + description)
- `src/createPreprocessor.ts` (export/return the `Preprocessor` type)
- `.gitignore` (already ignores `dist/` — verify)

**Leave as-is:** all existing `src/` logic, all existing tests, `scratch.ts`, `fixture.mjml`.
