# Contributing to react-native-observability

Thanks for contributing! This guide covers the local workflow and the standards
the codebase holds.

## Setup

```bash
pnpm install
```

Node 18+ and pnpm are required (the repo is a pnpm workspace; the `examples/`
apps are workspace packages).

## Quality gates

Run the full gate set before opening a PR — CI will enforce the same:

```bash
pnpm typecheck   # tsc --noEmit (library, against the React 18 baseline)
pnpm typecheck:examples  # the Expo + bare examples (React 19 / RN 0.81 — the upper peer range)
pnpm lint        # eslint, incl. lint-enforced layer boundaries
pnpm spell       # cspell (British spelling dictionary)
pnpm test        # jest
pnpm test:coverage  # jest --coverage (thresholds gate regressions)
pnpm build       # tsup — CJS + ESM + .d.ts
pnpm size        # size-limit — per-sub-path bundle budgets
```

`pnpm typecheck:all` runs both the library and example typechecks.

## Standards

- **TypeScript strict** — no `any` without a justifying comment; no unsafe casts.
- **Named exports only** from `src/` (default exports allowed only for React
  components).
- **JSDoc on every exported** type, function, and class.
- **Zero runtime dependencies** in the core. Every vendor SDK is an optional
  peer, loaded via the centralized `loadOptionalPeer` helper (dynamic `require`)
  or constructor-injected — never a top-level `import`.
- **Layered architecture** is lint-enforced by `eslint-plugin-boundaries`:
  core (logger/config) → adapters/error-boundary/storage → integrations →
  observers → panel. A lower layer must never import a higher one.
- **No stray `console.*`** in library code — use the Observability logger, the
  internal `SelfLogger` (dev-only, non-reentrant), or fail silently.
- **Redaction is a security guarantee.** PII scrubbing runs in the write path
  before any transport or adapter sees data — keep it there.

## Changesets

Every PR touching `src/` must include a changeset:

```bash
pnpm changeset
```

Choose `patch` / `minor` / `major` per semver. A behaviour change to a `stable`
export or a default that alters observable output is at least a `minor`. The
`experimental/*` and `internal/*` sub-paths are not covered by semver.

## Project internals

Design rationale, the per-symbol status map, the roadmap, and the architecture
audit live under [`docs/internal/`](./docs/internal/) and
[`docs/ARCHITECTURE_AUDIT.md`](./docs/ARCHITECTURE_AUDIT.md). You don't need them
to contribute a focused fix, but they explain _why_ the code is shaped the way it
is.
