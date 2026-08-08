# Changesets

Run `pnpm changeset` from the repository root when a package change should be released.

The generated markdown files in this directory should be committed with the code change.

## Release Flow

1. Merge package changes together with their changeset markdown into `main`.
2. A maintainer runs the `Version Packages` workflow (it is `workflow_dispatch` only — merging to `main` does not start it). It opens or updates a release PR that consumes the changesets and bumps versions. It does not write per-package changelogs: `changelog: false` is set, because every package moves in lockstep and the generated files were thirteen copies of the same release. The changeset text itself is the release note.
3. Merging that release PR lands the version bump on `main`. **Publishing is a separate, deliberate step:** a maintainer pushes the matching `v*` tag, or runs the `Publish Packages` workflow manually. Merging the release PR does not publish on its own.
4. `Publish Packages` fails while any changeset is still pending, then builds and verifies the repo, checks every version is one npm has never held before sending anything, packs each unpublished workspace package with `pnpm pack`, and publishes the generated tarball with `npm publish` so npm Trusted Publisher OIDC is used.

Both release workflows are restricted to the `coactionjs/coexist` repository, and both the tag push and the manual dispatch require maintainer permissions — no bot creates the tag.

The npm Trusted Publisher workflow filename must be configured as `publish.yml` for each public `@coexist/*` package. If an npm Trusted Publisher environment name is configured, add the same `environment` name to the publish job in `.github/workflows/publish.yml`.
