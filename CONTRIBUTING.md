# Contributing to Coexist

Thanks for your interest in improving Coexist! This guide covers the local setup, the day-to-day workflow, and the conventions the repository enforces.

## Prerequisites

- **Node.js** `>=22.12.0` (CI runs on 22.x and 24.x)
- **pnpm** `11.8.0` — install it through Corepack:

  ```sh
  corepack enable pnpm
  corepack use pnpm@11.8.0
  ```

## Getting started

```sh
git clone https://github.com/coactionjs/coexist.git
cd coexist
pnpm install
pnpm run build   # build all packages once so cross-package types resolve
```

This is a [pnpm workspace](https://pnpm.io/workspaces) monorepo with strict, catalog-managed dependency versions and [Turborepo](https://turbo.build/) task orchestration. Packages live in `packages/*` and runnable demos in `examples/*`.

## Repository tooling

| Tool                              | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| pnpm workspaces + catalogs        | Dependency management with pinned versions.        |
| Turborepo                         | Task graph and caching (`build`, `test`, …).       |
| [Oxlint](https://oxc.rs/) + Oxfmt | Fast linting and formatting.                       |
| [Vitest](https://vitest.dev/)     | Unit tests with V8 coverage.                       |
| [tsdown](https://tsdown.dev/)     | Library builds powered by Rolldown.                |
| Changesets                        | Versioning and changelog generation.               |
| Commitizen / cz-git / commitlint  | Conventional commit authoring and validation.      |
| Husky + lint-staged               | Pre-commit formatting/linting and commit-msg lint. |

## Common commands

Run from the repository root:

```sh
pnpm run dev          # watch-build all packages in parallel
pnpm run build        # build all packages (turbo)
pnpm run test          # run the full Vitest suite
pnpm run test:coverage # the same suite with coverage thresholds enforced
pnpm run test:watch    # watch mode
pnpm run typecheck    # tsc --noEmit across packages
pnpm run lint         # oxlint
pnpm run lint:fix     # oxlint --fix
pnpm run format       # oxfmt --write
pnpm run format:check # oxfmt --check
pnpm run check        # format:check + lint + typecheck + coverage + build + smokes (what CI runs)
```

Coverage thresholds are floors, enforced by `test:coverage` and therefore by `check` and CI. `packages/core/src/**` is held to a higher bar than the rest. A project that finds no test files fails rather than passing, so a suite cannot disappear unnoticed.

`pnpm run bench` measures how selector count, module count, deep mutations, and worker payload sizes scale. It is not part of `check` — timings are machine-dependent — but it is the baseline to compare against before changing the invalidation model.

Every UI adapter is held to one shared behaviour contract in `packages/integration/src/adapterConformance.ts`. Adding an adapter means supplying a binding for it, not writing a new set of tests; changing what an adapter does means changing the contract, so the five cannot drift apart quietly.

The `*.fuzz.test.ts` suites are seeded, not random: they replay fixed seeds so a failure reproduces from the seed named in the test. They cover the input spaces too large to enumerate — arbitrary worker protocol messages and patch paths, and interleaved app lifecycle commands — asserting invariants rather than specific outputs.

Target a single package or example with pnpm filters:

```sh
pnpm --filter @coexist/core test
pnpm --filter @coexist/example-react-counter dev
```

Before opening a pull request, make sure `pnpm run check` passes — it mirrors the CI `verify` job. The two lists are hand-maintained, so `check` starts by asserting they still match; if you add a step, add it to both the root `check` script and `.github/workflows/ci.yml`.

## Tests

Tests live next to the source as `*.test.ts` files and run through Vitest workspace projects (one per package). Add or update tests for any behavior change. For app-level tests, prefer [`@coexist/testing`](./packages/testing)'s `testApp`, which provides provider overrides and action/state/patch inspection.

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are validated by commitlint on commit. Use the guided prompt:

```sh
pnpm run commit
```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scopes (preferred):** `core`, `config`, `repo`, `release`, `docs`, `ci`, `deps` — custom scopes are allowed but a scope is required.

Example: `docs(core): document worker transports`.

## Changesets and releases

User-facing changes need a [changeset](https://github.com/changesets/changesets) describing the change and the semver bump for each affected package:

```sh
pnpm changeset
```

Releasing is automated but maintainer-triggered at both ends:

1. Merged changesets are collected into a version PR by the `Version Packages` workflow, which a maintainer dispatches manually.
2. Merging that PR updates versions and changelogs on `main`. It does **not** publish.
3. A maintainer publishes by pushing the matching `v*` tag (or dispatching `Publish Packages`). The workflow refuses to run while any changeset is still pending, then verifies the repo before publishing with npm Trusted Publisher OIDC.

You generally only need to add a changeset; a maintainer drives steps 1 and 3.

Which bump to pick is described in [Scope & Stability](./docs/scope-and-stability.md#versioning): pre-1.0, a minor may break, a patch may not.

## Dependencies

Runtime and tooling versions are pinned in the `catalog:` block of `pnpm-workspace.yaml`; packages reference them with `catalog:` rather than their own ranges, so a version is bumped in exactly one place. GitHub Actions are pinned to commit SHAs with the semver tag in a trailing comment — a moving tag is a re-tagable dependency in a workflow that can publish.

[Renovate](https://docs.renovatebot.com) proposes updates (`.github/renovate.json`) and keeps the action digests in step with their comments. Framework peers and `coaction` majors require dashboard approval because they change the compatibility matrix rather than just a version.

## Security

Do not report vulnerabilities through issues or pull requests. [`SECURITY.md`](./SECURITY.md) has the private reporting channel and the threat model — including what is deliberately out of scope, such as treating a BroadcastChannel `authToken` as authentication.

## Pull requests

1. Fork and branch from `main`.
2. Make your change with tests and (when user-facing) a changeset.
3. Run `pnpm run check`.
4. Open a PR with a clear description of the motivation and approach.

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
