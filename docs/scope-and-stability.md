# Scope and Stability

What Coexist covers, how mature each part is, and what a `0.x` version number promises. Everything below describes the current release line; it is updated with the code, not aspirationally.

## Maturity by area

| Area                                                        | Status         | What that means                                                                                                              |
| ----------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| App runtime, modules, DI, lifecycle, plugins                | **Stable**     | The API is exercised by the whole test suite and installed-package smokes. Changes go through a deprecation cycle.           |
| UI adapters (React, Vue, Svelte, Solid, Angular)            | **Stable**     | All five are held to one [conformance contract](./ui-adapters.md#two-things-every-adapter-gives-you) and browser-tested.     |
| `@coexist/storage`, `@coexist/devtools`, `@coexist/testing` | **Stable**     | Narrow surfaces, covered by unit and installed-package tests.                                                                |
| `@coexist/router`                                           | **Primitives** | A location source and a plugin. It does not match routes, render views, or own navigation UI — pair it with a real router.   |
| Worker / shared runtime                                     | **Beta**       | Correct and tested over reliable transports. See [what beta means](#the-worker-runtime-is-beta) before depending on it.      |
| `@coexist/create`                                           | **Beta**       | Generates a minimal starter. The template is expected to change between minors.                                              |
| SSR                                                         | **Partial**    | The core is SSR-safe and adapters isolate per-request apps, but there is no streaming, hydration, or server-component story. |

## The worker runtime is beta

The worker runtime hosts a real app off-thread and mirrors its state, with schema validation, an action allowlist, protocol quotas, bounded readiness, snapshot recovery, and a delivery contract. It is genuinely usable — but "beta" is the honest label, because:

- **Concurrent writes are not merged.** Several peers writing the same state produce last-writer-wins on the host. The client detects that its mirror fell behind and re-syncs a snapshot; it does not reconcile competing writes.
- **BroadcastChannel coordination is trusted-peer only.** Any code that can join a same-origin channel observes its traffic, so the `authToken` routes messages rather than authenticating peers — see the worker [trust boundary](./worker-runtime.md#trust-boundary).
- **Framework worker bootstrapping is yours.** Adapters consume a `WorkerClient`; spawning the worker, bundling its entry, and handling its lifecycle are application concerns.

Depend on it for a trusted, reliable transport — a dedicated `Worker`, a `MessagePort`, a same-origin iframe you control. Treat it as a prototype for unreliable remote transports or multi-writer shared runtimes.

## Compatibility

### Node.js

`>=22.12.0`. Every published package declares that in its own `engines` field — not just the workspace root — so a consumer on an older Node is told by their package manager instead of finding out at runtime. CI verifies every package on Node 22 and 24, including installed-tarball smokes, and `test:docs-versions` checks the numbers on this page against the manifests so the table below and this floor cannot drift from what the packages actually declare. The packages are **ESM-only**: a consuming project needs `"type": "module"` (or `.mjs` / `.mts`) or a bundler.

### Browsers

Adapters and the worker runtime need native ES modules, `structuredClone`, `AbortSignal`, and `BroadcastChannel` (the last only for the shared-tab transport) — in practice the last two major versions of Chrome, Edge, Firefox, and Safari. Browser smokes run in Chromium.

### UI frameworks

Peer ranges name the majors an adapter is tested against; a future major is not silently accepted.

| Adapter            | Peer range             | Tested against |
| ------------------ | ---------------------- | -------------- |
| `@coexist/react`   | `^18.3.0 \|\| ^19.0.0` | React 19       |
| `@coexist/vue`     | `>=3.5.0 <4`           | Vue 3.5        |
| `@coexist/svelte`  | `^4.0.0 \|\| ^5.0.0`   | Svelte 5       |
| `@coexist/solid`   | `>=1.9.0 <2`           | Solid 1.9      |
| `@coexist/angular` | `>=17.0.0 <23`         | Angular 22     |

Both ends of every range are verified. CI exercises the newest version through the unit, integration, and browser suites, and `test:frameworks:min-version` builds a throwaway consumer per entry point that installs exactly the floor of its peer range — Angular 17, React 18.3, Solid 1.9, Svelte 4, Vue 3.5 — then typechecks that entry point's export surface against it and imports it. The workspace cannot host a second version of a framework (`catalogMode: strict`, one lockfile), so the check runs outside it, and it asserts the resolved version really is the floor rather than trusting the resolver.

An entry point may need more than its package does. `@coexist/svelte` runs on Svelte 4, but `@coexist/svelte/runes` imports `createSubscriber` from `svelte/reactivity`, which Svelte added in **5.7.0** — so that subpath is checked at 5.7.0, not at "Svelte 5". Subpath requirements are stated and verified rather than left to the package range.

Each consumer is also _imported_, not only typechecked. A framework import survives into an adapter's JavaScript but is erased from its declarations unless a public signature happens to mention it — `runes.js` imports `svelte/reactivity`, `runes.d.ts` does not — so a floor the entry point cannot actually load typechecks clean and fails on the user's first import instead.

Versions between the floor and the newest are not individually built. A break reported on one is treated as a bug.

### Core and adapters

`@coexist/core` is a **peer dependency** of every adapter and plugin, so an application shares exactly one runtime copy. All `@coexist/*` packages are released together at the same version, and an adapter's peer range is `^<its own version>`. Mixing an adapter with a core from a different minor is expected to work within a `0.x` line but is not tested; keep them in step.

## Versioning

Coexist is pre-1.0 and follows semver as npm interprets it for `0.x`: **a minor bump may contain a breaking change**, a patch never intentionally does.

- Every package's public surface is committed under [`api-report/`](../api-report) and verified in CI, so a signature cannot change without the change appearing in a reviewable diff.
- Every user-facing change ships with a [changeset](../CONTRIBUTING.md#changesets-and-releases) stating its bump and the reason.
- Breaking changes are described in the changeset in terms of what breaks and what to do about it — not just what changed.
- Deprecations, where practical, keep the old path working for one minor with a runtime warning before removal.

There is no LTS branch. Security fixes land on the newest release line only.

### Open decisions before 1.0

Two behaviours become compatibility promises the moment `1.0` ships, so they are decisions rather than backlog items:

- **The invalidation model.** One publication signal for the whole app tree. [The options and their costs](./state-and-reactivity.md#why-it-is-one-signal-and-what-would-change-it) are written down and measurable with `pnpm run bench`.
- **The worker protocol's stability**, below.

### The worker protocol

The wire protocol between `createWorkerApp` and `createWorkerClient` is **not** a stable public contract while the worker runtime is beta. Both endpoints are expected to come from the same `@coexist/core` version; a protocol change is a minor bump, not a major. Do not implement a third-party peer against it yet.

That expectation is now enforced rather than assumed. The host stamps `workerProtocolVersion` on its `ready` handshake, and a client that sees a different revision rejects `client.ready` with `WorkerProtocolMismatchError` instead of mirroring frames it may misread. A host with no version in its handshake predates versioning and is accepted.

## What is deliberately out of scope

Coexist does not, and does not plan to, own:

- **Rendering.** There is no component base class, view module, or `render()` abstraction.
- **Route matching, data loading, bundling, or deployment.** That is a meta-framework's job; use one.
- **A server runtime.** Modules run wherever you run them.
- **A component library or styling system.**

## Next

- [Introduction](./introduction.md) — positioning and mental model.
- [Worker & Shared Runtime](./worker-runtime.md) — what the beta covers, and the trust boundary it enforces.
- [Contributing](../CONTRIBUTING.md#security) — how to report a vulnerability privately.
