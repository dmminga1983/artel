# Terraform reference

Reference for the `devops` skill. Applies to Terraform and, for most points, OpenTofu (`tofu` CLI). Feature versions are noted — check `terraform version` and `required_version` in the project.

## Layout

```
infra/
  modules/
    network/          # reusable, no provider or backend config inside
      main.tf  variables.tf  outputs.tf  versions.tf
  envs/
    staging/          # one root module + one state per environment
      main.tf  backend.tf  providers.tf  terraform.tfvars
    production/
      ...
```

- Separate state per environment and per blast radius (network, data, apps) — a bad apply then touches less. Directories per environment are easier to reason about than workspaces for differing environments.
- Root modules configure providers and backends; child modules only declare `required_providers`.

## Versions

```hcl
terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"     # check the current major and pin to it
    }
  }
}
```

- Commit `.terraform.lock.hcl` (provider checksums). Update deliberately with `terraform init -upgrade` and review the diff; for multiple platforms `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`.
- Pin module sources: registry modules with `version = "x.y.z"`, Git modules with `?ref=<tag or commit>`.

## Remote state with locking

```hcl
# S3 with native lock files (Terraform 1.10+; the DynamoDB lock table is deprecated)
terraform {
  backend "s3" {
    bucket       = "example-tfstate-prod"
    key          = "apps/web/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

Other locking backends: `gcs` (locks natively), `azurerm` (blob lease), HCP Terraform/Terraform Enterprise, `pg`. The local backend and plain HTTP storage without lock support are not for teams.

State bucket: versioning on (recovery from a bad write), encryption on, public access blocked, access limited to the CI role and a few admins, access logs on. **State contains secrets in plain text** — treat it like a credentials store. OpenTofu can additionally encrypt state client-side (1.7+).

Never commit `*.tfstate`, `*.tfstate.backup`, `.terraform/`, `*.tfplan`, or `*.tfvars` files that contain secrets. A safe `.gitignore`:

```
.terraform/
*.tfstate
*.tfstate.*
*.tfplan
crash.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json
```

## Plan before apply

```bash
terraform fmt -check -recursive
terraform init -input=false
terraform validate
terraform plan -input=false -out=tfplan
terraform show -no-color tfplan > plan.txt     # for the PR comment / review
terraform apply -input=false tfplan            # applies exactly what was reviewed
```

- In CI: plan on pull requests (read-only role), apply only from the default branch through a protected environment with required reviewers, using the saved plan or a fresh plan that is re-reviewed.
- Read every `-/+ destroy and then create replacement`, `# forces replacement` and `destroy` line. Stateful resources (databases, buckets, volumes) get `lifecycle { prevent_destroy = true }`.
- `-target` is for emergencies, not routine work — it leaves the rest of the config unapplied.
- `terraform apply -auto-approve` without a reviewed plan is **dangerous**; `terraform destroy` is **destructive**.

## Modules

- Small, single-purpose; inputs typed with `validation` blocks and descriptions; outputs only what callers need.
- No hard-coded account IDs, regions or names inside modules — pass them in.
- `for_each` over maps/sets (stable keys) instead of `count` for collections, so removing one item doesn't shift and recreate the rest.
- Don't wrap a single resource in a module just to rename its arguments.

```hcl
variable "environment" {
  type        = string
  description = "Deployment environment."
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
```

## Secrets

- Don't put secret values in `.tf`, `.tfvars` or variables' defaults. Pass them from the CI secret store as `TF_VAR_name` environment variables, or better, don't pass them at all: have Terraform create a secret **container** (secret manager entry, KMS key) and let the application or a rotation job set the value.
- `sensitive = true` on variables/outputs only redacts CLI output; the value is still in state and plan files.
- Generated passwords (`random_password`) live in state — acceptable only if state is protected; prefer the cloud's managed-password features where available.
- Newer releases add **ephemeral** values and resources (Terraform 1.10+) and **write-only** arguments (Terraform 1.11+, provider support required) that keep values out of state and plan — use them where the provider supports them.
- Saved plan files contain sensitive values too — don't upload them as public artifacts.

## Drift

- Detect: `terraform plan -refresh-only` (shows what changed outside Terraform without proposing config changes); run it on a schedule and alert on differences.
- Resolve by updating code to match an intentional change, or applying to revert an unintended one. Avoid console changes; if unavoidable, record and codify them immediately.
- `ignore_changes` only for attributes legitimately managed elsewhere (e.g. autoscaler-managed desired counts), with a comment.

## Refactoring without state surgery

```hcl
moved {                       # Terraform 1.1+: rename/move without destroy/create
  from = aws_s3_bucket.logs
  to   = module.logging.aws_s3_bucket.this
}

import {                      # Terraform 1.5+: adopt existing infrastructure via plan
  to = aws_s3_bucket.assets
  id = "example-assets-bucket"
}

removed {                     # Terraform 1.7+: stop managing without destroying
  from = aws_instance.legacy
  lifecycle { destroy = false }
}
```

`terraform plan -generate-config-out=generated.tf` drafts config for `import` blocks. `terraform state mv/rm` still exist but bypass review — prefer the blocks above.

## State locks

- `Error acquiring the state lock`: another plan/apply holds it, or a crashed run left it. Check CI and colleagues first. Only when sure nothing is running: `terraform force-unlock <LOCK_ID>` (**dangerous** — two concurrent applies can corrupt state).
- Use CI `concurrency` groups per state so two pipelines never run against the same state.
- `-lock-timeout=5m` makes a run wait for a lock instead of failing immediately.

## CI checks

- `terraform fmt -check`, `terraform validate`, TFLint (with the provider plugin), a security/policy scanner (Checkov, Trivy config, or OPA/Conftest against `terraform show -json tfplan`).
- Cloud credentials via OIDC (see [github-actions.md](github-actions.md)), with a read-only role for plan and a separate apply role restricted to the protected branch/environment.
- Cost estimation and plan summaries posted to the PR help reviewers spot surprises.

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `Inconsistent dependency lock file` | Provider changed without updating the lock file | `terraform init -upgrade`, review and commit `.terraform.lock.hcl` |
| `Backend configuration changed` | Backend block edited | `terraform init -reconfigure` (new empty state) or `-migrate-state` (move state) — choose deliberately |
| `Provider produced inconsistent final plan` | Provider bug or unknown values at plan time | Upgrade provider; split apply; report upstream |
| `Error: Cycle` | Resources reference each other | Break the dependency (separate rule resources, data sources) |
| `Invalid count argument` / `for_each` unknown | Keys depend on values known only after apply | Use static keys; create the dependency in an earlier apply |
| Unexpected replacement | Immutable attribute changed, resource address changed | `moved` block; revert the attribute; read provider upgrade notes |
| `AccessDenied` in apply but not plan | Plan role is read-only (good) or apply role lacks a permission | Grant the specific action to the apply role, not `*` |
