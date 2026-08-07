# @coexist/devtools

## 1.0.0

### Minor Changes

- a2e8b0e: Declare `@coexist/core` as a peer dependency instead of an ordinary one. Each adapter and plugin pinned core exactly, so an app on a different core version got a second copy installed under the adapter: `instanceof CoexistError` stopped working across that boundary, two runtimes disagreed on protocol and lifecycle assumptions, and bundles carried the runtime twice. Core is now `peerDependencies: { "@coexist/core": "^<version>" }` plus a workspace devDependency, so one runtime is shared. Installs that already list `@coexist/core` alongside the adapter — as every README instructs — need no change. The pack smoke now fails if a package regresses to depending on core directly.
- fix

### Patch Changes

- 115fb51: Declare `engines.node` on every published package. The documentation said the Node floor was `>=22.12.0`, "matching the `engines` field" — but only the private workspace root carried one, so nothing reached a consumer: installing on Node 20 produced no warning, and the first sign of trouble was a syntax or API error at runtime. Each package now declares `>=22.12.0` itself, which is the version CI has been testing against all along. If you install on an older Node your package manager will now say so; with `engine-strict` it will refuse, which is the intent.

  The peer-range table and Node floor in `docs/scope-and-stability.md` are also checked against the manifests now (`test:docs-versions`). That page opens by saying it is updated with the code rather than aspirationally, and those two claims were hand-copied numbers that nothing verified.

- Updated dependencies [d0b93d6]
- Updated dependencies [5b522a4]
- Updated dependencies [37d4391]
- Updated dependencies [f4c18eb]
- Updated dependencies [7a8cf07]
- Updated dependencies [51a6c65]
- Updated dependencies [115fb51]
- Updated dependencies [2b8c134]
- Updated dependencies [e899066]
- Updated dependencies [cdb149c]
- Updated dependencies [7ba4f75]
- Updated dependencies [88f9b6a]
- Updated dependencies [9ff9faa]
- Updated dependencies [6cc87af]
- Updated dependencies
- Updated dependencies [de6d263]
- Updated dependencies [73889f5]
- Updated dependencies [e634fb6]
- Updated dependencies [577ae11]
- Updated dependencies [1641d30]
- Updated dependencies [8be0a32]
  - @coexist/core@0.3.0

## 0.2.1

### Patch Changes

- @coexist/core@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [c9e64c3]
- Updated dependencies [6aec125]
- Updated dependencies [c91cebc]
- Updated dependencies [51a2645]
- Updated dependencies [289305a]
- Updated dependencies [ee5301b]
- Updated dependencies [98b4aa2]
- Updated dependencies [26ce33f]
- Updated dependencies [5f71742]
- Updated dependencies [e7c81ad]
- Updated dependencies [159ffbe]
- Updated dependencies [95d00bb]
- Updated dependencies [0751a50]
- Updated dependencies [027171e]
- Updated dependencies [14e063c]
- Updated dependencies [f931e31]
- Updated dependencies [38f4014]
- Updated dependencies [77bddf0]
- Updated dependencies [a02235b]
- Updated dependencies [1abd56b]
- Updated dependencies [38b8aa3]
- Updated dependencies [80c4e58]
- Updated dependencies [e1336a0]
- Updated dependencies [e3c3fff]
- Updated dependencies [f9c4c3c]
- Updated dependencies [71e762e]
  - @coexist/core@0.2.0

## 0.1.0

### Major Changes

- Release Coexist 0.1 with the app runtime, lightweight DI, module decorators and no-decorator metadata, framework-native UI adapters, worker/shared runtime transports, persistence, router, devtools, testing helpers, examples, and CI/CD publishing support.

### Minor Changes

- 6ffad3e: Record module creation events in the devtools timeline.
- 99dde33: Add realtime timeline subscriptions for devtools panels and custom inspection tooling.

### Patch Changes

- Updated dependencies [11db34e]
- Updated dependencies [2e01e3a]
- Updated dependencies [5385bd5]
- Updated dependencies [2f51753]
- Updated dependencies [8d18a9a]
- Updated dependencies [366eb38]
- Updated dependencies [177ca9a]
- Updated dependencies [794566f]
- Updated dependencies [77cd9a9]
- Updated dependencies [80f25e8]
  - @coexist/core@0.1.0
