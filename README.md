<p align="center">
    <img src=".github/assets/logo.svg" alt="monoship" width="120" height="120">
</p>

<h1 align="center">monoship</h1>

<p align="center">
    <b>Publish npm workspace packages: only the ones the registry is missing.</b><br>
    monoship checks every workspace package against the registry, resolves <code>workspace:</code><br>
    dependencies to real versions, and publishes just what is not there yet.
</p>

<p align="center">
    <a href="https://npmjs.com/package/monoship"><img src="https://badge.fury.io/js/monoship.svg" alt="npm version"></a>
    <a href="https://github.com/Tada5hi/monoship/actions/workflows/main.yml"><img src="https://github.com/Tada5hi/monoship/workflows/CI/badge.svg" alt="CI"></a>
    <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white" alt="Conventional Commits"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
    <a href="#installation"><b>Installation</b></a>
    ·
    <a href="#usage">Usage</a>
    ·
    <a href="#authentication">Authentication</a>
    ·
    <a href="#github-action">GitHub Action</a>
    ·
    <a href="#programmatic-api">API</a>
    ·
    <a href="#ci">CI</a>
</p>

---

## Why

In a monorepo, only some packages change per release. Running `npm publish` everywhere fails loudly on the
ones that are already out there; running it selectively means hand-maintaining a list. monoship asks the
registry instead: whatever version is not published yet gets published, everything else is skipped. That
makes it a natural companion to [release-please](https://github.com/googleapis/release-please), where the
version bumps are already decided for you.

- **Registry-driven.** Publishability is derived from registry metadata, not from git diffs or config.
- **`workspace:` aware.** `workspace:*`, `workspace:^` and `workspace:~` are rewritten to concrete versions before packing.
- **Tokenless in CI.** OIDC trusted publishing is auto-detected in GitHub Actions, with `NODE_AUTH_TOKEN` as fallback.
- **`latest` that stays honest.** The `latest` dist-tag is repointed when it is stuck on an older prerelease.
- **Native `npm publish`.** Shells out to the npm CLI when available (provenance, OIDC, `.npmrc`), falls back to [libnpmpublish](https://www.npmjs.com/package/libnpmpublish) otherwise.
- **Hexagonal & testable.** Every side effect sits behind a port with a memory adapter, so the library runs without network or disk.

## How it works

Given a monorepo whose root declares its workspaces:

```json
{
    "workspaces": ["packages/*"]
}
```

and a package depending on a sibling through the `workspace:` protocol:

```json
{
    "name": "@acme/client",
    "version": "1.3.0",
    "dependencies": {
        "@acme/core": "workspace:^"
    }
}
```

`monoship` expands the globs, resolves the protocol against the versions found in the repository, and asks
the registry which of the resulting packages it does not know yet:

```
@acme/core     1.2.0   skipped, already published
@acme/client   1.3.0   published, dependencies[@acme/core] -> ^1.2.0
```

Only packages the registry has no answer for are published: either a `404` for the package itself, or a
packument without that exact version. Everything else is left untouched, so the command is safe to run on
every push.

A `workspace:` range is rewritten to the version of the package it points at, keeping its own range operator:

| Declared | Rewritten to |
|----------|--------------|
| `workspace:*` | `1.2.0` |
| `workspace:^`, `workspace:^1.0.0` | `^1.2.0` |
| `workspace:~`, `workspace:~1.0.0` | `~1.2.0` |

A package never reaches the registry check at all when it is `private: true`, when `name` or `version` is
missing, or when it depends on a `workspace:` package that is not part of the repository. That last case is
reported as a warning rather than silently dropped.

The dist-tag is derived from the version itself: `1.4.0-beta.1` publishes under `beta`, a stable version
under `latest`. An explicit `--tag` or a `publishConfig.tag` takes precedence.

## Requirements

- **Node.js** >= 22.0.0
- **npm** 7+ (workspace support required)

## Installation

```bash
npm install monoship --save-dev
```

## Usage

```bash
npx monoship \
  --token <token> \
  --registry <registry> \
  --root <root> \
  --rootPackage
```

Nothing is published without asking the registry first, so the command is safe to run on every push.
Use `--dryRun` to print the plan instead of executing it:

```bash
npx monoship --dryRun
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--token <token>` | `string` | `NODE_AUTH_TOKEN` env var | Token for the registry. Optional when using OIDC trusted publishing. |
| `--registry <registry>` | `string` | `https://registry.npmjs.org/` | Registry URL to publish to. |
| `--root <root>` | `string` | `process.cwd()` | Directory where the root `package.json` is located. |
| `--rootPackage` | `boolean` | `true` | Also consider the root package for publishing (skipped if `private: true` or missing `name`/`version`). |
| `--tag <tag>` | `string` | Auto-detected | Dist-tag to publish under. Overrides the prerelease identifier auto-detected from `version` (e.g. `1.0.0-beta.0` → `beta`). Stable versions default to `latest`. |
| `--fixLatest` | `boolean` | `true` | Automatic [`latest` dist-tag correction](#latest-dist-tag-correction). Disable with `--no-fixLatest`. |
| `--dryRun` | `boolean` | `false` | Show what would be published without actually publishing. |

### `latest` Dist-Tag Correction

npm pins the `latest` dist-tag on a package's **first** publish, even when publishing under a different dist-tag (e.g. `beta`).
Without correction, a default `npm install` would serve that first prerelease forever, while subsequent publishes only move the prerelease tag.

After each successful publish, monoship checks the package's `latest` dist-tag: if it points at an **older prerelease**
(i.e. `latest` was never claimed by a stable release), it is repointed to the just published version.
A `latest` that points at a stable release is never touched. Opt out with `--no-fixLatest`.

## Authentication

Three authentication methods, resolved in this order:

| # | Method | When it applies |
|---|--------|-----------------|
| 1 | **`--token` CLI flag** | An explicit npm access token is given. Used as-is, OIDC is bypassed. |
| 2 | **OIDC trusted publishing** | No `--token`, and GitHub Actions OIDC env vars are present. Falls back to `NODE_AUTH_TOKEN` on failure. |
| 3 | **`NODE_AUTH_TOKEN`** | Default fallback. |

### OIDC Trusted Publishing

When running in GitHub Actions with [trusted publishers](https://docs.npmjs.com/trusted-publishers/) configured, the tool automatically detects the OIDC environment and exchanges short-lived, per-package tokens with the npm registry. No long-lived `NPM_TOKEN` secret is required.

**Requirements:**
- npm trusted publisher configured for each package on [npmjs.com](https://www.npmjs.com)
- GitHub Actions workflow with `id-token: write` permission
- No `--token` flag set (OIDC is bypassed when an explicit token is provided)

**How it works:**
1. Detects `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN` environment variables
2. Requests an OIDC identity token from GitHub with audience `npm:<registry-host>`
3. Exchanges the identity token with the npm registry for a short-lived, package-scoped publish token
4. Uses that token for publishing (each package gets its own scoped token)

If OIDC token exchange fails for a package, it falls back to `NODE_AUTH_TOKEN` automatically via the chain provider.

## GitHub Action

monoship is also available as a GitHub Action:

```yaml
-   uses: tada5hi/monoship@v2
    with:
        token: ${{ secrets.NPM_TOKEN }}
```

Or with OIDC trusted publishing (no token needed):

```yaml
-   uses: tada5hi/monoship@v2
```

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | No | none | npm auth token. Optional when using OIDC trusted publishing. |
| `registry` | No | `https://registry.npmjs.org/` | Registry URL to publish to. |
| `root-package` | No | `true` | Also consider the root package for publishing. |
| `tag` | No | Auto-detected | Dist-tag to publish under. Overrides the prerelease identifier auto-detected from `version`. Stable versions default to `latest`. |
| `fix-latest` | No | `true` | Repoint the `latest` dist-tag to the newly published version when it trails behind an older prerelease. |
| `dry-run` | No | `false` | Show what would be published without actually publishing. |
| `node-version` | No | `24` | Node.js version to set up. Set to an empty string to use the existing installation. |

## Programmatic API

```typescript
import { publish } from 'monoship';

const packages = await publish({
    cwd: '/path/to/monorepo',
    registry: 'https://registry.npmjs.org/',
    token: 'npm_...',
    rootPackage: true,
    dryRun: false,
});
```

The `publish()` function returns an array of `Package` objects for each successfully published package.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Root directory of the monorepo. |
| `registry` | `string` | `https://registry.npmjs.org/` | Registry URL. |
| `token` | `string` | none | Auth token (wrapped in `MemoryTokenProvider` internally). |
| `rootPackage` | `boolean` | `true` | Include the root package as a publish candidate. |
| `tag` | `string` | Auto-detected | Dist-tag to publish under. Overrides the prerelease identifier auto-detected from `version`. |
| `fixLatest` | `boolean` | `true` | Repoint the `latest` dist-tag to the newly published version when it trails behind an older prerelease. |
| `dryRun` | `boolean` | `false` | Resolve dependencies and check versions without actually publishing. |
| `fileSystem` | `IFileSystem` | `NodeFileSystem` | File system adapter. |
| `registryClient` | `IRegistryClient` | `HapicRegistryClient` | Registry metadata adapter. |
| `publisher` | `IPackagePublisher` | Auto-detected | Publisher adapter (npm CLI or libnpmpublish). |
| `tokenProvider` | `ITokenProvider` | `EnvTokenProvider` | Token resolution adapter (overrides `token`). |
| `logger` | `ILogger` | `NoopLogger` | Logger adapter. |

### Custom Adapters

The library uses a hexagonal architecture: all external I/O is behind port interfaces, making it fully testable and extensible.

```typescript
import {
    publish,
    MemoryFileSystem,
    MemoryRegistryClient,
    MemoryPublisher,
    MemoryTokenProvider,
    NoopLogger,
} from 'monoship';

const packages = await publish({
    cwd: '/project',
    fileSystem: new MemoryFileSystem({ /* virtual files */ }),
    registryClient: new MemoryRegistryClient({ /* virtual packuments */ }),
    publisher: new MemoryPublisher(),
    tokenProvider: new MemoryTokenProvider('test-token'),
    logger: new NoopLogger(),
});
```

Available port interfaces and their adapters:

| Port | Real Adapters | Test Adapter |
|------|--------------|--------------|
| `IFileSystem` | `NodeFileSystem` | `MemoryFileSystem` |
| `IRegistryClient` | `HapicRegistryClient` | `MemoryRegistryClient` |
| `IPackagePublisher` | `NpmCliPublisher`, `NpmPublisher` | `MemoryPublisher` |
| `ITokenProvider` | `MemoryTokenProvider`, `EnvTokenProvider`, `OidcTokenProvider`, `ChainTokenProvider` | `MemoryTokenProvider` |
| `ILogger` | `ConsolaLogger` | `NoopLogger` |

## CI

### GitHub Actions (with npm token)

Use with [release-please](https://github.com/googleapis/release-please): it bumps versions and creates release PRs, then monoship handles the actual publishing.

```yaml
on:
    push:
        branches:
            - main

permissions:
    contents: write
    pull-requests: write

jobs:
    release:
        runs-on: ubuntu-latest
        steps:
            -   uses: google-github-actions/release-please-action@v4
                id: release
                with:
                    token: ${{ secrets.GITHUB_TOKEN }}

            -   name: Checkout
                if: steps.release.outputs.releases_created == 'true'
                uses: actions/checkout@v4

            -   name: Publish
                if: steps.release.outputs.releases_created == 'true'
                uses: tada5hi/monoship@v2
                with:
                    token: ${{ secrets.NPM_TOKEN }}
```

### GitHub Actions (with OIDC Trusted Publishing)

No npm token secrets needed. Configure [trusted publishers](https://docs.npmjs.com/trusted-publishers/) on npmjs.com for each package instead.

```yaml
on:
    push:
        branches:
            - main

permissions:
    contents: write
    pull-requests: write
    id-token: write

jobs:
    release:
        runs-on: ubuntu-latest
        steps:
            -   uses: google-github-actions/release-please-action@v4
                id: release
                with:
                    token: ${{ secrets.GITHUB_TOKEN }}

            -   name: Checkout
                if: steps.release.outputs.releases_created == 'true'
                uses: actions/checkout@v4

            -   name: Publish
                if: steps.release.outputs.releases_created == 'true'
                uses: tada5hi/monoship@v2
```

## License

Made with 💚

Published under [MIT](./LICENSE).
