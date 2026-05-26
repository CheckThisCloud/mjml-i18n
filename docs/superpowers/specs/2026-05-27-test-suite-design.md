# Test Suite Design — mjml-i18n

**Date:** 2026-05-27
**Status:** Approved (design); pending implementation plan

## Goal

Add a real, multi-layered test suite to the `mjml-i18n` preprocessor package. Not just unit tests — the suite must exercise the actual MJML v5 render pipeline end-to-end and treat the inputs as adversarial. The package is **not publishable yet**; this work is a prerequisite for getting it there.

## Decisions (settled during brainstorming)

- **Threat model: everything potentially hostile.** The template `.mjml` (its `{{ }}` markers *and* the `<i18n>` block), the `vars` object, and the `locale` are all treated as attacker-influenced. The allowlist wall, prototype-pollution blocking, ReDoS resistance, recursion-depth/DoS, and the `<i18n>`-block parser are therefore **P0**, not defense-in-depth.
- **Integration depth: through real `mjml2html`.** Integration tests run the actual MJML v5 pipeline (`await mjml(src, { preprocessors })`) and assert on rendered HTML. Unit tests on the individual units sit underneath.
- **Runner: Vitest.** ESM/TS-native, fast watch, built-in v8 coverage. Tests run against `src/` directly (esbuild transforms TS) — independent of the not-yet-existing tsup build.
- **Coverage: report-only, no gate.** Collect and display (`text` + `html` + `lcov`) over `src/**`; never fail the run on a threshold. Avoids threshold-churn as the suite grows.
- **Strategy: layered tiers (unit → sandbox → integration) + one property-based fuzz test** (`fast-check`) for the sandbox invariant.

## Tooling & layout

**Dev dependencies to add:** `vitest`, `@vitest/coverage-v8`, `fast-check`.

**`vitest.config.ts`:** `environment: 'node'`; coverage provider `v8`, reporters `['text', 'html', 'lcov']`, `coverage.include: ['src/**']` (excludes `scratch.ts`, test files, config); no thresholds; `include: ['test/**/*.test.ts']`; explicit imports (no `globals`).

**Directory layout:**

```
test/
  unit/          dotWalk, format, GetFunction, I18nFunction
  sandbox/       createPreprocessor: allowlist + adversarial (XML-string assertions)
  integration/   real `await mjml(...)` -> HTML, + concurrency/isolation
  fuzz/          one fast-check invariant test
  fixtures/      *.mjml files (extend the existing fixture.mjml)
```

**package.json scripts:** `test` -> `vitest run`; `test:watch` -> `vitest`; `test:cov` -> `vitest run --coverage`.

**Two setup items folded into this work:**

1. **Module-interop tracer bullet first.** mjml v5 is consumed via `require('mjml')` today. Integration tests will `import mjml from 'mjml'`; if default-interop bites, fall back to `createRequire`. The first test written just renders the existing `fixture.mjml` to prove harness + mjml wiring before building out the matrix.
2. **Remove debug `console.log`s** from `createPreprocessor.ts` (3x: the `Called:`, `p`, and `leave` logs) and `I18nFunction.ts` (2x: the raw `doc.mjml.i18n` dump and `Loaded translations:`). They are dev cruft, flood test output, and should not ship. The silent leave-untouched-on-error behavior stays — just without the log.

## Tier 1 — Unit (pure, fast)

**`dotWalk`** — simple hit; nested `a.b.c`; missing leaf -> `undefined`; missing intermediate is null-safe (no throw); `obj` undefined -> `undefined`; blocked keys `__proto__`/`constructor`/`prototype` at any segment -> `undefined`; falsy values (`0`, `""`, `false`) returned as-is (not swallowed).

**`format`** — single/multiple `{name}`; missing param left literal `{x}`; number coercion (`42` -> `"42"`); repeated param; default `{}` arg; non-matching braces (`{ }`, `{}`) left literal; underscore/digit param names; pin `undefined`-value behavior (`String(undefined)`).

**`GetFunction`** — hit returns value; miss -> `"Missing variable: key"`; nested via `dotWalk`; blocked key -> miss fallback; falsy value (`0`) returned, not fallback.

**`I18nFunction`** — call before `preHook` -> key fallback; valid `<i18n>` block loads translations; nested key `foo.bar`; missing key -> key; params via `format`; locale absent from translations -> key fallback; pin that `fast-xml-parser` yields `doc.mjml.i18n` as the JSON string.

## Tier 2 — Sandbox / evaluator (assert on resolved XML string)

**Allowed:** simple marker resolves; string + number literal args; object-expression arg; nesting `i18n('greeting', { name: get('userName') })` resolves end-to-end; multiple markers in one input; inner whitespace trimmed.

**Rejected -> marker left verbatim:** unknown function; bare identifier `{{ x }}`; member access `{{ a.b }}` / `{{ get.x }}`; operators (`+`, `&&`, ternary, unary, comparison); template literal / array / arrow / assignment / sequence; spread (plugin unregistered); empty marker `{{}}`.

**Adversarial:** `get("__proto__.x")` blocked (assert global `Object.prototype` stays clean afterward); object key `__proto__` produces an own property, no pollution; deeply-nested calls -> caught, left untouched, **no process crash**; unmatched/very long `{{` -> left literal, no hang (ReDoS sanity).

## Tier 3 — Integration (real `await mjml(...)` -> HTML)

- **Tracer bullet** — render existing `fixture.mjml`; assert HTML contains `Ahoj světe` (cs) and graceful `baz` for `foo.bar`.
- **Markers in attributes/styles** — fixture with `{{ get(...) }}` inside an attribute (e.g. `mj-text color`, `mj-button href`); assert the resolved value lands in the rendered HTML attribute. The core justification for pre-parse resolution.
- **`<i18n>` head component** — `registerComponent(I18nBlock)` so MJML does not error on the custom tag, and the block is stripped from output (no `<i18n>` in HTML).
- **Async + clean** — must `await`; `errors` array empty.
- **Graceful in context** — an unknown/unsupported marker survives into the HTML literally.
- **Locale switching** — same template rendered `en` vs `cs` -> different output.
- **Concurrency / isolation** — two preprocessors (different locale + vars), `Promise.all` two renders, assert zero cross-contamination. Validates the construct-per-render decision from the handoff.

## Tier C — Fuzz (one `fast-check` test)

Generate random expression strings (allowed calls, operators, identifiers, nested junk) wrapped in `{{ }}`. Invariant: the preprocessor **never throws**, **never pollutes `Object.prototype`**, and output is *either* a resolved value *or* the original marker verbatim. A generative net for escapes not enumerated by hand.

## Baked-in design decisions

1. **Multi-line markers: not supported.** The current regex `.` does not cross newlines; keep single-line and document it. A test pins this behavior.
2. **No artificial recursion/size cap.** The marker `try/catch` already converts a deep-nesting `RangeError` into a safe leave-untouched. Test that rather than add a guard (YAGNI) — unless a test proves a real crash, in which case revisit.
3. **`preHook` must not crash the render.** Malformed/rootless XML or bad `<i18n>` JSON currently *throws* outside the marker try/catch — a DoS under the threat model. Write the failing test first, then harden `preHook` to degrade to "no translations."

## Expected defects to surface (red -> green; fix decided in the plan)

- `preHook` crash on malformed/rootless XML or bad `<i18n>` JSON (decision #3).
- The `fast-xml-parser` attribute-shape assumption (`doc.mjml.i18n` as a string), if it turns out wrong.
- Any prototype-pollution surprise the fuzz net catches.

## Workflow

- **TDD for the known defect** (#3): red -> green. Descriptive tests pin current-correct behavior elsewhere.
- **Commit in chunks:** setup + tracer bullet; unit tier; sandbox tier; integration tier; fuzz; defect fixes.

## Out of scope

- The `leaf` `POST /mjml` HTTP contract (lives in the `leaf` repo; TODO #3 in HANDOFF).
- A built-artifact (`dist/`) smoke test — deferred until tsup is set up (TODO #1/#2).
- ICU / messageformat and member-access hardening (deferred per HANDOFF).
