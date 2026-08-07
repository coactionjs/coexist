# API reports

One file per published package, recording its complete public surface as built.

These are generated, not written: `pnpm run api-report:update` regenerates them from each package's built `.d.ts`, and `pnpm run test:api-report` — part of `check` and CI — fails when the built surface no longer matches what is committed here.

## Why

A version number says a release is breaking. It does not say *what* broke. A removed export, a parameter that became required, a return type that widened — all of them used to ship without anything drawing a reviewer's eye to them, because the only evidence was buried in the diff of the implementation.

Putting the surface in a committed file makes it reviewable on its own terms. A pull request that changes an exported signature must change one of these files, and that diff is the moment to ask whether the changeset describes the change and calls a removal or a narrowing breaking.

## Reading a diff

Reports are re-printed through the TypeScript printer and sorted by name, so they move only when the API moves — reformatting by the declaration emitter does not show up. A line removed is a capability removed; read it as a compatibility question, not as noise to regenerate away.

Do not edit these files by hand, and do not format them: `.oxfmtrc.json` excludes this directory precisely so the generator's output is the only thing that decides their contents.
