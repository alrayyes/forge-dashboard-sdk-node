# Contributing

## Requirements

- [Bun](https://bun.sh) 1.3.14 — pinned via `packageManager` in
  `package.json` and `oven-sh/setup-bun` in CI. Bun 1.4 switched
  `bun.lock` to a new `lockfileVersion: 2` format that Dependabot's and
  Renovate's bundled Bun (1.3.x as of this writing) can't parse and
  silently corrupts back to v1 -- staying below 1.4 here keeps the
  dependency bot actually working (`rules/javascript.md`).
- [lefthook](https://github.com/evilmartians/lefthook). `bun install` then
  `lefthook install` once, after cloning.

Bun is the runtime here, not just the package manager -- there's no Docker
wrapper the way this account's Go repos use one. A Node/Bun toolchain is
already on any machine doing this language's work, so hooks and CI run it
natively.

## Building and testing

```sh
bun run typecheck
bun test
bun x @biomejs/biome check .
bun run build
```

`lefthook run pre-push` runs the same set (plus `sort-package-json --check`),
so that's the one command to run before opening a pull request.

## Regenerating the types

`src/generated/schema.ts` is generated from `openapi/openapi.yaml` by
[openapi-typescript](https://openapi-ts.dev/) -- never hand-edit it. The spec
itself is pinned to a commit of
[alrayyes/forge-dashboard](https://github.com/alrayyes/forge-dashboard)
recorded in `openapi/SPEC_COMMIT`; `.github/workflows/regenerate.yml` bumps
that pin whenever forge-dashboard's own CI reports its spec changed (a
`repository_dispatch` sent on merge to its main), or weekly as a fallback
if that dispatch is ever missed. To do it by hand:

```sh
./hack/fetch-spec.sh
bun run generate
```

Diff `openapi/openapi.yaml` (not the generated types) to decide whether a
change needs a major, minor or patch bump -- see
[`rules/sdk-generation.md`](https://git.higherlearning.eu/alrayyes/dotfiles/src/branch/master/private_dot_config/claude/rules/sdk-generation.md)'s
"Versioning tracks the contract, not the commits". `.github/workflows/
regenerate.yml` already does this automatically with `oasdiff`, picking
`feat`/`fix` and adding a `BREAKING CHANGE:` footer as needed; a manual
regeneration should classify the diff the same way before writing the
commit message by hand.

## Why openapi-typescript + openapi-fetch

`openapi-generator`'s generic TypeScript templates were considered and
rejected: its per-language templates are inconsistent in idiom quality, and
the generated TypeScript reads like every other language's client with the
syntax swapped rather than like hand-written TS. `openapi-typescript`
(types only, no runtime) plus `openapi-fetch` (a ~6&nbsp;KB typed wrapper
around the platform `fetch`) produces a client that's genuinely idiomatic
and has almost no dependency weight of its own -- see
[`rules/sdk-generation.md`](https://git.higherlearning.eu/alrayyes/dotfiles/src/branch/master/private_dot_config/claude/rules/sdk-generation.md)'s
"Generated vs hand-written" for the tradeoff this account weighs for every
generated SDK.

`src/generated/schema.ts` is the generated boundary -- types only. Every
other file under `src/` (the client wrapper, auth, retry, error typing) is
hand-written on top of it and is what the test suite actually covers;
testing the generated type mapping again would just be testing
openapi-typescript, not this SDK. Unlike `pipeline-analytics-sdk-node`
(the sibling this repo is modeled on), there's no `pagination.ts` here --
forge-dashboard's API has no paginated list endpoint to wrap (its
dashboard snapshot is returned whole), so there's nothing to write an
iterator over.

## Known-pending secrets

Three repo secrets aren't set yet, matching every other new repo in this
account at this stage -- affected jobs stay red until they're added, which
is expected, not a bug to work around:

- `RELEASE_TOKEN` -- a real-identity PAT `.github/workflows/release.yml`
  and `regenerate.yml` need (a `GITHUB_TOKEN`-authored PR can't self-merge
  and its checks can come back empty -- see either workflow's own comment).
- `NPM_TOKEN` -- an npmjs.org automation token `release.yml`'s `publish`
  job needs to actually publish. The GitHub Packages publish in the same
  job needs no separate token (`GITHUB_TOKEN` already covers it).
- `CODECOV_TOKEN` -- kept out of the required `test` job specifically so
  its absence can't block every merge (`ci.yml`'s own comment).

## Commits and releases

Commit messages follow [Conventional
Commits](https://www.conventionalcommits.org/), linted by commitlint on
`commit-msg`. Merging to `main` is what
[release-please](https://github.com/googleapis/release-please) reads to keep
an open release pull request with the next version and changelog; merging
that pull request tags the release and publishes the package to npm.

## Branching

Every change lands through a pull request; nothing is pushed straight to
`main`.
