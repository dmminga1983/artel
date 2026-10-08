---
name: devops
description: Containers, infrastructure and CI/CD — Dockerfiles, Docker Compose, Kubernetes, Terraform, GitHub Actions hardening (permissions, SHA pinning, OIDC, injection), CI caching, deploy strategies and rollback, observability, troubleshooting. Use for Dockerfile, k8s manifests, .tf, workflows, failed deploys; "докер", "деплой", "пайплайн".
paths: "**/Dockerfile*, **/*.dockerfile, **/.dockerignore, **/docker-compose*.yml, **/compose*.yaml, **/*.tf, **/*.tfvars, .github/workflows/*.yml, .github/workflows/*.yaml, **/k8s/**, **/helm/**, **/charts/**, **/kustomization.yaml"
---

Reply in the user's language.

Infrastructure code runs with real credentials against real systems. Plan, review and preview before applying; label anything destructive; never paste secrets into files, logs or chat.

## 1. Detect the project

- **Containers:** `Dockerfile*`, `.dockerignore`, `compose.yaml`/`docker-compose*.yml`, base image tags and digests, build scripts.
- **Orchestration:** `k8s/`, `manifests/`, Helm `Chart.yaml`/`values*.yaml`, `kustomization.yaml`, Argo CD/Flux config; target cluster version (`kubectl version`).
- **IaC:** `*.tf`, `.terraform.lock.hcl`, `backend` blocks, `required_version`, Terraform vs OpenTofu, workspaces/environments layout.
- **CI/CD:** `.github/workflows/`, `dependabot.yml`, `CODEOWNERS`, environments and deploy jobs; other CI systems if present.
- **Observability:** logging library, metrics/tracing SDK (OpenTelemetry?), dashboards and alert rules in the repo.

Rule: *follow the project's existing conventions (tools, layout, naming, environments) over these defaults.*

## 2. Defaults for new work

- Small official or distroless base images, **pinned by tag and digest**; multi-stage builds; non-root user.
- Compose for local development only; Kubernetes (or a managed container platform) for production.
- Terraform/OpenTofu with a remote backend that locks; one state per environment and blast radius.
- GitHub Actions: top-level `permissions: contents: read`, full-SHA-pinned actions, OIDC for cloud access, environments with required reviewers for production.
- Versions: check the current supported release of each tool/runtime/image instead of assuming one; never deploy `:latest`.
- Same artifact (image digest) promoted through environments; config differs, the build does not.

## 3. Dockerfile

- **Base:** slim/distroless/official images; pin `image:tag@sha256:digest` and let Dependabot/Renovate bump it. Alpine (musl) can break native wheels/binaries — choose deliberately.
- **Multi-stage:** build tools and dev dependencies stay in the build stage; the final stage gets only runtime files.
- **Layer caching:** copy dependency manifests and lockfiles first, install, then copy the source. Use BuildKit cache mounts (`RUN --mount=type=cache,target=…`) for package caches.
- **`.dockerignore`:** exclude `.git`, `.env*`, `node_modules`, build output, local databases, keys, test data — keeps context small and secrets out.
- **Non-root:** `USER` with a fixed UID (or the image's `node`/`nonroot` user); files the app writes go to a dedicated writable dir. Lets Kubernetes enforce `runAsNonRoot`.
- **No secrets in images:** not in `COPY`, `ENV` or `ARG` — build args and env are visible in image history/metadata. Use `RUN --mount=type=secret,id=…` for build-time secrets and runtime env/secret mounts for runtime.
- **Exec-form** `CMD`/`ENTRYPOINT` (`["node", "server.js"]`) so the process gets signals; handle `SIGTERM` gracefully; use an init (`docker run --init`, `tini`) if the app spawns children.
- **`HEALTHCHECK`** for Compose/standalone Docker (Kubernetes ignores it — use probes).
- One process per container; logs to stdout/stderr; immutable config via env.
- Lint with `hadolint`; scan images with Trivy, Grype or Docker Scout in CI.

```dockerfile
# syntax=docker/dockerfile:1
# Set to your supported LTS; in production also pin the digest: node:<tag>@sha256:<digest>
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/server.js"]
```

Build-time secret: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci` with `docker build --secret id=npmrc,src=.npmrc .` — the file is never written into a layer.

## 4. Docker Compose (local development)

- File `compose.yaml`; the top-level `version:` key is obsolete — omit it.
- `depends_on` with `condition: service_healthy` plus a `healthcheck` on the database, instead of sleep loops.
- Secrets from an untracked `.env` (commit `.env.example` with placeholders); never real credentials in the YAML.
- Publish ports on localhost only (`"127.0.0.1:5432:5432"`); Docker-published ports bypass host firewalls such as `ufw`.
- Named volumes for data; bind mounts for source; `develop.watch` / `docker compose watch` for hot reload.
- `profiles:` for optional services (workers, admin tools). Pin service images the same way as in production.

## 5. Kubernetes basics

Details and manifests: [kubernetes.md](kubernetes.md).

- **Requests and limits:** set CPU and memory requests on every container (scheduling depends on them) and a memory limit (exceeding it → `OOMKilled`). CPU limits cause throttling — set them deliberately.
- **Probes:** readiness = "can take traffic now" (dependency-aware, cheap); liveness = "process is wedged, restart me" (never checks dependencies, or a database blip restarts everything); startup probe for slow boots.
- **ConfigMap vs Secret:** non-sensitive config in ConfigMaps; credentials in Secrets — which are only base64-encoded, so enable encryption at rest, restrict RBAC on them, and prefer an external secret manager (External Secrets, CSI driver, sealed/SOPS-encrypted secrets in Git).
- **Rolling updates:** `maxSurge`/`maxUnavailable`, readiness gating, `PodDisruptionBudget`, graceful shutdown (`preStop` + `terminationGracePeriodSeconds`). `kubectl rollout status|history|undo`.
- **Security context:** `runAsNonRoot`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, drop all capabilities, `seccompProfile: RuntimeDefault`; enforce with Pod Security Admission `restricted`.
- **RBAC least privilege:** namespaced `Role` over `ClusterRole`, no wildcards, a dedicated ServiceAccount per workload, `automountServiceAccountToken: false` when the pod doesn't call the API. Verify with `kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>`.
- NetworkPolicies default-deny, then allow what is needed. Immutable image references (digest or unique tag).

## 6. Terraform

Details: [terraform.md](terraform.md).

- **Remote state with locking** (S3 with `use_lockfile`, GCS, azurerm, Terraform Cloud/HCP, or equivalent); state bucket encrypted, versioned, access-restricted. Never commit `*.tfstate`.
- **Plan before apply:** `terraform plan -out=tfplan`, review (in the PR), then `terraform apply tfplan`. Read every `destroy` and `forces replacement`.
- **Modules** for repeated patterns with typed, validated variables; pin module and provider versions; commit `.terraform.lock.hcl`.
- **Secrets:** state stores attribute values in plain text, `sensitive = true` only hides CLI output. Generate/store secrets in a secret manager and pass references; use ephemeral values/write-only arguments where the version and provider support them; treat state as secret.
- **Drift:** `terraform plan -refresh-only` on a schedule; fix by changing code, not the console. Refactor with `moved`/`import`/`removed` blocks instead of state surgery.
- `fmt -check`, `validate`, a linter (TFLint) and a policy/security scanner (Checkov, Trivy) in CI.

## 7. GitHub Actions hardening

Details and a hardened template: [github-actions.md](github-actions.md). Consistent with `/artel:secure-publish`.

- Top-level `permissions: contents: read`; widen per job only (`id-token: write`, `packages: write`, `pull-requests: write`).
- **Never `pull_request_target` (or `workflow_run` on PR artifacts) together with checking out or running PR code** — it runs untrusted code with secrets and a write token.
- **No untrusted `${{ github.event.* }}` / `github.head_ref` inside `run:`** — pass through `env:` and quote:
  ```yaml
  - run: echo "Title: $PR_TITLE"
    env:
      PR_TITLE: ${{ github.event.pull_request.title }}
  ```
- **Pin third-party actions to a full commit SHA** with a version comment; let Dependabot update them. Prefer few, well-maintained actions.
- **OIDC** (`id-token: write`) to assume short-lived cloud roles; no long-lived cloud keys in secrets. Scope the trust policy to repo + branch/environment.
- **Environments** with required reviewers and branch restrictions for production; environment-scoped secrets.
- `actions/checkout` with `persist-credentials: false` unless the job pushes; `concurrency` groups for deploys; `timeout-minutes` on jobs.
- `CODEOWNERS` on `.github/workflows/`; lint workflows with `actionlint` and `zizmor`.

## 8. CI caching

- Cache by lockfile hash: `actions/cache` with `key: ${{ runner.os }}-x-${{ hashFiles('**/package-lock.json') }}`, or `setup-*` actions' built-in `cache:` input.
- Docker layer cache: Buildx with `cache-from: type=gha` / `cache-to: type=gha,mode=max`, or a registry cache.
- Cache dependencies, not build outputs you then trust blindly; release/publish workflows should build from a clean state or caches only the default branch wrote (cache poisoning).
- Never cache directories that contain credentials (`~/.npmrc` with tokens, `~/.docker/config.json`).

## 9. Deploy and rollback

| Strategy | How | Good for | Cost |
|---|---|---|---|
| Rolling | replace instances gradually | default, stateless services | both versions live together |
| Blue/green | full second environment, switch traffic | instant rollback, big changes | double capacity |
| Canary | small % of traffic first, widen on healthy metrics | risky changes, high traffic | needs traffic splitting + good metrics |

- Every release is deployable **and** reversible: previous image digest known, config versioned, DB migrations backward-compatible (expand/contract — see `/artel-data:data`).
- Automate rollback triggers on symptom metrics (error rate, latency) during canary/rollout.
- Feature flags decouple deploy from release. Smoke tests after deploy. Release checklist: `/artel:ship`.

## 10. Observability

- **Structured logs** (JSON) to stdout with timestamp, level, service, version, request/trace ID; no secrets, tokens or unnecessary PII.
- **Metrics:** RED for services (rate, errors, duration as histograms), USE for resources (utilisation, saturation, errors). Watch label cardinality — no user IDs or URLs with IDs as labels.
- **Traces:** OpenTelemetry SDK + collector; propagate context across HTTP/queues; sample sensibly.
- **Alerts on symptoms users feel** (error rate, latency, SLO burn rate), not on causes like CPU; every alert actionable with a runbook link. Dashboards per service; deploy markers.

## 11. Security pitfalls

Secrets in images, build args, Compose files, Terraform state in Git, CI logs (`set -x`, `env` dumps); containers as root or `privileged`; `hostPath`/Docker socket mounts; public databases, dashboards or Kubernetes API; `cluster-admin` service accounts; wildcard RBAC/IAM (`*:*`); unpinned actions and images; `pull_request_target` misuse; self-hosted runners on public repositories; long-lived cloud keys; disabled TLS verification.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `CrashLoopBackOff` | App exits on start: bad config/env, missing secret, failing migration, liveness probe killing a slow start | `kubectl logs <pod> --previous`, `kubectl describe pod`; fix config; add a startup probe |
| `ImagePullBackOff` / `ErrImagePull` | Wrong name/tag/digest, private registry without `imagePullSecrets`, wrong architecture, rate limit | `kubectl describe pod` events; verify the image exists for the node's arch; add pull secret |
| `OOMKilled` (exit code 137) | Memory limit below real usage, leak, runtime heap not sized to the container | Measure, raise limit/request, cap heap (e.g. JVM `-XX:MaxRAMPercentage`, Node `--max-old-space-size`) |
| Pod `Pending` | Requests exceed free capacity, node selector/taint mismatch, unbound PVC | `kubectl describe pod` → events; adjust requests or capacity |
| `bind: address already in use` / connection refused | Port taken on host; app listens on `127.0.0.1` inside container | Change host port; listen on `0.0.0.0` in the container; check `containerPort`/Service `targetPort` |
| `permission denied` in container | Non-root user can't write to a root-owned path or bind mount; read-only root FS | `COPY --chown`, writable `emptyDir`/volume, `fsGroup`; fix host UID/GID for bind mounts |
| `exec format error` | Image built for another CPU architecture | `docker buildx build --platform linux/amd64,linux/arm64` |
| Readiness never passes, no traffic | Wrong probe path/port, probe hits a dependency that's down | Probe the real port; make readiness cheap |
| CI flaky | Test order/time/network dependence, shared state, resource limits, cache keyed wrongly | Reproduce with the same seed; isolate tests; fix cache keys; quarantine with an issue, don't blind-retry |
| `Error acquiring the state lock` | Another run holds the lock, or a crashed run left it | Confirm no apply is running, then `terraform force-unlock <LOCK_ID>` (**dangerous** if one is) |
| Terraform wants to replace a resource unexpectedly | Changed an immutable attribute, renamed resource, provider upgrade | Read `forces replacement`; use `moved` blocks; pin providers |
| Action fails `Resource not accessible by integration` | `GITHUB_TOKEN` permissions too narrow, or fork PR (read-only token) | Grant the specific permission on that job; don't switch to `pull_request_target` |

## 13. Review checklist

- [ ] Images: pinned base, multi-stage, non-root, `.dockerignore`, no secrets in layers/args, healthcheck/probes.
- [ ] Kubernetes: requests/limits, readiness/liveness/startup probes, security context, least-privilege RBAC, Secrets not in plain Git.
- [ ] Terraform: remote locked state, plan reviewed, versions pinned, no secrets in code, no unexpected destroy/replace.
- [ ] Workflows: `permissions: contents: read`, no `pull_request_target` + PR checkout, no event data in `run:`, SHA-pinned actions, OIDC, protected environments.
- [ ] Deploy: rollback path known and tested, migrations compatible, smoke tests and symptom alerts in place.
