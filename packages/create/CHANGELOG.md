# @coexist/create

## 0.3.0

### Minor Changes

- e4efb0d: Stop the scaffold from clobbering directories and generating unreproducible projects. `createCoexistProject()` wrote `package.json`, `tsconfig.json`, and `src/main.ts` unconditionally, so pointing the CLI at an existing project silently destroyed its manifest, and it pinned `@coexist/core`, `tsx`, and `typescript` to `latest`, so the same CLI build produced a different — eventually incompatible — project every run. A non-empty target is now refused unless `--force` / `force: true` is passed, the project name is validated against npm's rules first, files are staged in a temporary directory and moved into place so a failed run leaves nothing behind, and dependencies are pinned to the ranges the scaffold is tested against (`@coexist/core` tracking this CLI's own version).
- fix

### Patch Changes

- 7a8cf07: Cover the paths that had none, and raise the floors so they stay covered. The collaborators split out of `RuntimeApp` shipped with the thinnest tests in the repo — `moduleRegistry` and `effectRuntime` sat at 50% and 71% branch coverage — and several long-standing files were no better: `token` at 47%, `decorators` at 56%, `async-context` at 50%, the scaffold CLI at 25%, the router at 72%, and a third of the storage service surface never called. The gaps were all error handling and fallbacks: duplicate-module detection, a disposer that throws mid-teardown, staged-rollback baselines, decorator target guards, every runtime without `node:async_hooks`, the CLI's failure and `--force` paths, `createBrowserRouter` without a window, a terminal error observer that itself rejects, and each storage delegation. Those files now sit at 94–100%, the repository floors move from 85/78/88 to 89/83/92, and the four collaborators extracted from `RuntimeApp` each gained a unit test and a floor of their own — including the mutation cascade cap, which nothing had exercised at the unit level despite being the reason that class exists.
- 115fb51: Declare `engines.node` on every published package. The documentation said the Node floor was `>=22.12.0`, "matching the `engines` field" — but only the private workspace root carried one, so nothing reached a consumer: installing on Node 20 produced no warning, and the first sign of trouble was a syntax or API error at runtime. Each package now declares `>=22.12.0` itself, which is the version CI has been testing against all along. If you install on an older Node your package manager will now say so; with `engine-strict` it will refuse, which is the intent.

  The peer-range table and Node floor in `docs/scope-and-stability.md` are also checked against the manifests now (`test:docs-versions`). That page opens by saying it is updated with the code rather than aspirationally, and those two claims were hand-copied numbers that nothing verified.

- 88f9b6a: Close three gaps found reviewing the worker and scaffold changes. A sync request that resumed after the host store became unreadable escaped as an unhandled rejection, because the publish moved outside the handler's `try` when the delivery contract landed but the caller cannot await it — it is reported through `onDeliveryError` again. An initial snapshot that failed delivery asynchronously neither reached `onDeliveryError` nor forced the next update to be a full snapshot, unlike a synchronous failure. And `createCoexistProject()` stopped creating missing parent directories when it began staging files in a sibling directory, so `create-coexist apps/web` failed with a raw `ENOENT` unless `apps` already existed.

## 0.2.1

### Patch Changes

- Version alignment release with no public API changes in this package.

## 0.1.0

### Major Changes

- Release Coexist 0.1 with the app runtime, lightweight DI, module decorators and no-decorator metadata, framework-native UI adapters, worker/shared runtime transports, persistence, router, devtools, testing helpers, examples, and CI/CD publishing support.

## 0.2.0

### Patch Changes

- Version alignment release with no public API changes in this package.
