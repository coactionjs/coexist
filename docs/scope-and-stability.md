# Scope and Stability

What Coexist covers, how mature each part is, and what a `2.x` version number promises. Everything below describes the current release line; it is updated with the code, not aspirationally.

## Maturity by area

| Area                                                        | Status         | What that means                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App runtime, modules, DI, lifecycle, plugins                | **Stable**     | The API is exercised by the whole test suite and installed-package smokes. Changes go through a deprecation cycle.                                                                                                                                 |
| `@coexist/core/local`                                       | **Stable**     | The same app composition API with a local Coaction store; CI checks installed consumers and the bundle boundary.                                                                                                                                   |
| UI adapters (React, Vue, Svelte, Solid, Angular)            | **Stable**     | All five are held to one [conformance contract](./ui-adapters.md#two-things-every-adapter-gives-you) and browser-tested.                                                                                                                           |
| `@coexist/storage`, `@coexist/devtools`, `@coexist/testing` | **Stable**     | Narrow surfaces, covered by unit and installed-package tests.                                                                                                                                                                                      |
| `@coexist/router`                                           | **Primitives** | A location source and a plugin. It does not match routes, render views, or own navigation UI — pair it with a real router.                                                                                                                         |
| Worker runtime                                              | **Stable**     | Host/client API, dedicated `Worker`/`MessagePort`/iframe/custom RPC transports, readiness, recovery, and the trust boundary are covered over trusted, reliable transports. See [the supported model](#the-worker-runtime) for what reliable means. |
| Shared-tab coordination                                     | **Stable**     | `BroadcastChannel` across trusted same-origin peers only; `authToken` routes messages rather than authenticating them. Host-authoritative last-writer-wins, not merged.                                                                            |
| `@coexist/create`                                           | **Beta**       | Generates a minimal starter. The template is expected to change between minors.                                                                                                                                                                    |
| SSR                                                         | **Partial**    | The core is SSR-safe and adapters isolate per-request apps, but there is no streaming, hydration, or server-component story.                                                                                                                       |

<a id="the-worker-runtime-is-beta" name="the-worker-runtime-is-beta"></a>

## The worker runtime

The worker runtime hosts a real app off-thread and mirrors its state, with schema validation, an action allowlist, protocol quotas, bounded readiness, snapshot recovery, and a delivery contract.

It is **Stable** within a deliberately narrow operational model. Stable covers the API, options, error semantics, and documented behaviour over a trusted, reliable transport. Reliable means the transport delivers each frame at most once, in the order it was sent, and throws or rejects when it cannot deliver. It does not promise distributed-systems properties the runtime does not implement:

- **One authoritative host.** State lives on the host; clients read a mirror and write through delegated actions. Concurrent writes are last-writer-wins on the host, and a client whose mirror falls behind detects the gap and re-syncs a snapshot; it does not reconcile competing writes. The runtime does not merge concurrent writes.
- **Trusted transports only.** A bare `WorkerTransport` does not authenticate its peer. BroadcastChannel `authToken` routes messages rather than authenticating them. Schema validation, quotas, and the action allowlist are defense-in-depth, not a security boundary against hostile same-origin code — see the worker [trust boundary](./worker-runtime.md#trust-boundary).
- **Framework worker bootstrapping is yours.** Adapters consume a `WorkerClient`; spawning the worker, bundling its entry, and handling its lifecycle are application concerns.
- **The wire protocol is internal.** The API is stable; the frames are not. Deploy both endpoints from the same `@coexist/core` version. A client refuses a host whose `workerProtocolVersion` differs, but that revision changes only with a breaking wire change, so it does not tell every mixed pair apart ([below](#the-worker-protocol-is-outside-the-compatibility-promise)).

Depend on it for a dedicated `Worker`, a `MessagePort`, a same-origin iframe you control, a trusted `BroadcastChannel`, or a custom RPC channel that meets that contract. The host does not deduplicate calls, so a channel that can replay a frame, such as a reconnecting socket or a retrying queue, runs the action again unless it deduplicates first. If you need CRDT-style merge, offline queueing, or an adversarial transport boundary, use a system designed for that; those are out of scope, not unfinished.

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

`@coexist/core` is a **peer dependency** of every adapter and plugin, so an application shares exactly one runtime copy. All `@coexist/*` packages are released together at the same version, and an adapter's peer range is `^<that shared version>`. Mixing an adapter with a core from a different minor of the same major is expected to work but is not tested; keep them in step.

Lockstep is enforced at planning, versioning, and publishing: Changesets keeps the eleven public packages in one fixed group; `test:release-plan` checks core-only patch, minor, and major changesets in isolated workspaces and checks the pending plan; `test:docs-versions` fails when the packages in the repository do not all carry one version; and `publish:packages` refuses the release before sending anything if a version has been used and unpublished on npm. These checks exist because the invariant broke in practice, leaving adapters pointing at a core version that never shipped.

## Versioning

Coexist is `2.x` and follows semver as npm interprets it: **a major bump may break, a minor and a patch never intentionally do.** That promise has held since `1.0`, which replaced a `0.x` line where a minor was allowed to break.

`2.0` broke one package: `@coexist/storage` moved to localspace 3 and dropped the APIs localspace removed, as listed in its [migration notes](../packages/storage/README.md#migrating-from-1x). The other ten packages advanced with the lockstep group and kept their API.

- Every package's public surface is committed under [`api-report/`](../api-report) and verified in CI, so a signature cannot change without the change appearing in a reviewable diff. That report is what the promise is measured against.
- Every user-facing change ships with a [changeset](../CONTRIBUTING.md#changesets-and-releases) stating its bump and the reason.
- Breaking changes are described in the changeset in terms of what breaks and what to do about it — not just what changed.
- Deprecations, where practical, keep the old path working for one minor with a runtime warning before removal.

There is no LTS branch. Security fixes land on the newest release line only.

Two exclusions are named rather than implied, because a promise with silent holes is worse than a narrower one:

- **The worker wire protocol**, [below](#the-worker-protocol-is-outside-the-compatibility-promise).
- **Maturity is not the same as the semver line.** The table at the top describes how much of a surface is finished and supported; the major version describes what may change without a major. A **Beta** area still gets the compatibility promise for its exported API — `@coexist/create`'s generated template is not an API surface, so it may change between minors. The worker protocol is the one explicit exclusion, below; it is an internal encoding, not a maturity label.

### Decisions this release line locks in

These were open questions before `1.0`. They are settled, and changing either now requires a major:

- **The public watch and adapter invalidation model** — each app commit evaluates the subscribed selectors. Decided to keep, on the measured cost in [State & Reactivity](./state-and-reactivity.md#why-app-watches-use-one-publication-and-what-it-would-take-to-change-it). Effects also re-run after each commit by default, preserving `1.0` behavior; `engine.effectInvalidation: "path"` is an additive opt-in. A finer selector mode remains a separate possible addition.
- **The worker protocol's stability** — the runtime API is Stable, but the wire protocol remains excluded from the promise ([below](#the-worker-protocol-is-outside-the-compatibility-promise)). It is an internal encoding, not a public contract.

### The worker protocol is outside the compatibility promise

The wire protocol is an internal implementation detail. Keeping it out of the compatibility promise lets the runtime change frame encoding, recovery, and routing without turning every internal change into a major. This is a boundary between the public API and the transport encoding, not a maturity caveat: the runtime is Stable and its API is covered.

> The wire protocol between `createWorkerApp` and `createWorkerClient` is **not** covered by this package's compatibility promise, and may change in any minor release. Everything else `@coexist/core` exports is covered.

Being explicit is the point. "A protocol change is a minor bump, not a major" was coherent under `0.x`, where a minor was allowed to break. Since `1.0` it would contradict itself, because a minor may not break anything the package stands behind — and the package does not stand behind the frames. Naming the exclusion keeps the major version meaning exactly what it says everywhere else.

| Surface                                                                          | Covered by `2.x`?  |
| -------------------------------------------------------------------------------- | ------------------ |
| `createWorkerApp` / `createWorkerClient` signatures, options, and returned types | Yes                |
| `WorkerClient` members and their documented behaviour                            | Yes                |
| Supported transports, readiness/recovery, and the trust boundary                 | Yes, as documented |
| The frames exchanged on the wire between a host and a client                     | **No**             |
| `workerProtocolVersion` and the member shapes of `WorkerMessage`                 | **No**             |

Build against the worker **API** freely — it is ordinary `2.x` API, held to the same report and the same deprecation cycle. Do not implement a third-party host or client against the **frames**, and do not persist or bridge them. The API is stable; the encoding is not.

Both endpoints must come from the same `@coexist/core` version. What the runtime enforces is the part correctness depends on, the wire revision. The host stamps `workerProtocolVersion` on its `ready` handshake and on every frame that carries the full state, so a client that attached after the handshake still learns it before adopting any state. A client that sees a different revision rejects `client.ready` with `WorkerProtocolMismatchError`, rejects its pending and later calls with the same error, and ignores the rest of that host's frames instead of mirroring frames it may misread. The revision moves only with a breaking wire change, so two releases that share one connect normally; that is compatible, not verified. A host whose frames carry no revision predates versioning and is accepted.

### What is a breaking change for the worker API

Now that the worker API is Stable, each of the following is breaking and ships only in a major release. Where practical, a deprecation warns for at least one minor first, as for every other surface; it precedes the major and never replaces it:

- changing the meaning, default, or optionality of an option on `createWorkerApp` or `createWorkerClient`;
- changing a `WorkerClient` member's behaviour, error name, or settlement semantics;
- removing a transport, or narrowing a documented topology or trust boundary;
- changing which module methods are remotely callable by default.

Adding an option with a default, a new transport, or an opt-in recovery mode is additive. A fix that brings behaviour back to what this page and the [worker guide](./worker-runtime.md) document is a patch. The wire protocol is not on this list; it remains internal and may change in a minor.

## What is deliberately out of scope

Coexist does not, and does not plan to, own:

- **Rendering.** There is no component base class, view module, or `render()` abstraction.
- **Route matching, data loading, bundling, or deployment.** That is a meta-framework's job; use one.
- **A server runtime.** Modules run wherever you run them.
- **A component library or styling system.**
- **Distributed conflict resolution.** The worker runtime is host-authoritative; merging concurrent writers (CRDT/OT) is out of scope, not a missing stable feature.

## Next

- [Introduction](./introduction.md) — positioning and mental model.
- [Worker & Shared Runtime](./worker-runtime.md) — what the runtime covers, and the trust boundary it enforces.
- [Contributing](../CONTRIBUTING.md#security) — how to report a vulnerability privately.
