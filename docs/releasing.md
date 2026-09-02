# Releasing `@rdlabo/capacitor-local-llm`

This repository publishes to npm with **Trusted Publishing (OIDC)**. After the one-time package bootstrap described below, GitHub Actions authenticates to npm without long-lived `NPM_TOKEN` secrets. Publishing is gated by CI and, for beta, by immutable package artifacts.

## First-time npm Trusted Publisher setup

An npm package must exist before a Trusted Publisher can be registered. For a new package name, an npm owner must therefore publish the first version once from a trusted local checkout with 2FA:

```bash
npm ci
npm run lint
npm test
npm run build
npm publish --access public --tag latest
```

This manual bootstrap is the only non-OIDC publish. Do not add its npm credential to GitHub Secrets. Once the package exists, configure the Trusted Publisher (org admins only):

1. Open [npm](https://www.npmjs.com/) → **Access** → package **`@rdlabo/capacitor-local-llm`** → **Publishing access** → **Trusted Publisher**.
2. Add a **GitHub Actions** trusted publisher:
   - **Organization / user:** `rdlabo-dev`
   - **Repository:** `capacitor-local-llm`
   - **Workflow filename:** `release.yml`
   - **Environment:** leave empty (workflow-level publisher)
3. Ensure **Allow npm publish** is enabled for that trusted publisher.

The same relationship can be created with npm 11.5.1 or later while authenticated as a package owner:

```bash
npm trust github @rdlabo/capacitor-local-llm \
  --repo rdlabo-dev/capacitor-local-llm \
  --file release.yml \
  --allow-publish
```

After setup, only the `Release` workflow (`.github/workflows/release.yml`) can publish stable, next, and beta versions for this package. No repository secret is required for npm authentication.

### npm CLI minimum

Release jobs run `npm install -g npm@latest` before publish. Locally, use **npm 11.5.1 or later** (Trusted Publishing and `--provenance` support). Older clients cannot complete OIDC-based publishes.

## Release channels

| Channel    | npm dist-tag | How it is published                                     | Changes `latest`? |
| ---------- | ------------ | ------------------------------------------------------- | ----------------- |
| Stable     | `latest`     | Push git tag `vX.Y.Z`                                   | Yes               |
| Prerelease | `next`       | Push git tag `vX.Y.Z-<prerelease>`                      | No                |
| Beta       | `beta`       | `/beta` on an eligible PR, or automatic merge to `main` | No                |

`npm install @rdlabo/capacitor-local-llm` resolves to **`latest`**. Beta and next never move the `latest` tag.

## Stable release (`latest`)

1. Merge changes to `main` and ensure **Validation** passes on `main`.
2. Run the same release command used by the other rdlabo Capacitor plugins:

   ```bash
   npm run release
   ```

   Select the stable version in the `np` prompt. To specify it non-interactively, use `npm run release -- 2.1.0`. `np` verifies the checkout, updates `package.json` and `package-lock.json`, creates the release commit and `v2.1.0` tag, and pushes them. It does **not** publish to npm (`--no-publish`); GitHub Actions owns that step.

3. The **Release** workflow checks out the tag, verifies `package.json` version matches the tag, runs `npm run build`, and publishes with:

   ```bash
   npm publish --provenance --access public --tag latest
   ```

## Prerelease (`next`)

Use semver prerelease tags on git (for example `v2.1.0-rc.1`, `v2.1.0-alpha.3`):

1. Run `npm run release` from a clean `main` checkout and select a prerelease version. To specify it explicitly, use `npm run release -- 2.1.0-rc.1`.
2. `np` creates and pushes the matching `v2.1.0-rc.1` tag without publishing locally.
3. The **Release** workflow publishes to the **`next`** dist-tag with provenance.

Stable pattern `X.Y.Z` → `latest`. Prerelease pattern `X.Y.Z-<suffix>` → `next`. Invalid versions are rejected.

## Beta (`beta`)

Beta builds are **immutable candidates**: built in **Package Candidate**, published only from the validated artifact in **Release**. Lifecycle scripts are disabled on beta publish (`--ignore-scripts`).

### Version format

Beta versions use the **base version from `main`’s `package.json`** (strip any existing prerelease), the PR number, and the first 12 characters of the commit SHA:

```text
<base>-beta.pr<PR>.sha<12-char-sha>
```

Example: if `main` has `"version": "2.0.0"`, PR `#42`, head SHA `a1b2c3d4e5f6789012345678`:

```text
2.0.0-beta.pr42.shaa1b2c3d4e5f
```

Install the **exact** version (recommended for reproducibility):

```bash
npm install @rdlabo/capacitor-local-llm@2.0.0-beta.pr42.shaa1b2c3d4e5f
```

`npm install @rdlabo/capacitor-local-llm@beta` resolves to whatever version currently carries the **`beta`** dist-tag (may differ from an older PR’s exact version).

### PR beta (`/beta`)

On an **open, non-draft** pull request targeting `main`:

1. **Validation** and **Package Candidate** must succeed for the PR head commit.
2. A repository **owner or maintainer** comments exactly:

   ```text
   /beta
   ```

3. **Release** authorizes publish only if:
   - The commenter still has admin/maintain permission at publish time.
   - The PR head SHA has not changed since the request.
   - Required CI passed for that SHA.
   - The PR does **not** modify release-gating workflows (`validation.yml`, `package-candidate.yml`, `release.yml`).
4. The workflow downloads artifact `npm-candidate-<full-sha>`, validates name/version/registry, and publishes to **`beta`** with provenance.
5. A bot comment (or job summary) posts the exact `npm install ...@<version>` command.

Any new commit requires CI to pass again and a **fresh** owner/maintainer `/beta` comment. Fork PRs are supported.

### Automatic merge beta

When a PR is **merged** into `main`:

1. **Validation** and **Package Candidate** must succeed for the **merge commit** on `main`.
2. **Release** runs automatically (via `workflow_run`) and publishes to **`beta`** with the same version formula, unless the merged PR changed a release-gating workflow (then beta is skipped).

Direct pushes to `main` without an associated merged PR do **not** trigger beta publish.

## Safety and gating

- **No CI `NPM_TOKEN`:** after the one-time package bootstrap, authentication uses GitHub OIDC → npm Trusted Publishing only in `release.yml`.
- **Tag publish:** tag job builds from source; `package.json` must match the tag version.
- **Beta publish:** never builds from PR/merge checkout in the privileged job; only the CI-produced `.tgz` artifact is published.
- **Protected workflows:** PRs that change gating workflows cannot be beta-published until those changes are on `main`.
- **Revalidation:** `/beta` and merge beta re-check permissions, SHAs, artifact identity, and successful **Package Candidate** runs immediately before publish.
- **Idempotent beta:** if the exact version already exists on npm, publish is skipped.
- **Comment failures:** a notification failure does not undo a successful npm publish.

## Workflows involved

| Workflow          | File                                      | Role                                                   |
| ----------------- | ----------------------------------------- | ------------------------------------------------------ |
| Validation        | `.github/workflows/validation.yml`        | Lint, test, native verify, example app builds          |
| Package Candidate | `.github/workflows/package-candidate.yml` | Build and upload immutable `.tgz` artifact             |
| Release           | `.github/workflows/release.yml`           | Tag publish (`latest` / `next`) and gated beta publish |

Only `npm run release` (via `np`) creates release tags for stable and next. Beta tags are not used; beta versions are semver prerelease strings published to the `beta` dist-tag.
