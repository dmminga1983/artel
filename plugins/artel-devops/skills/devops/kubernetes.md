# Kubernetes reference

Reference for the `devops` skill. Check field availability against the cluster version (`kubectl version`, `kubectl explain deployment.spec --recursive`).

## A production-ready Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app.kubernetes.io/name: web }
spec:
  replicas: 3
  revisionHistoryLimit: 5
  selector:
    matchLabels: { app.kubernetes.io/name: web }
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0          # never drop below desired capacity during a rollout
  template:
    metadata:
      labels: { app.kubernetes.io/name: web }
    spec:
      serviceAccountName: web
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        fsGroup: 10001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: web
          image: registry.example.com/web@sha256:<digest>   # immutable reference
          ports:
            - { name: http, containerPort: 8080 }
          envFrom:
            - configMapRef: { name: web-config }
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: web-secrets, key: database-url }
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }       # CPU limit omitted on purpose; set one if your policy requires it
          startupProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 5
            failureThreshold: 30            # up to 150 s to boot
          readinessProbe:
            httpGet: { path: /readyz, port: http }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 10
            failureThreshold: 3
          lifecycle:
            preStop:
              sleep: { seconds: 5 }         # let endpoints update before SIGTERM; older clusters: exec a sleep binary
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: tmp
          emptyDir: {}
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
spec:
  minAvailable: 2
  selector:
    matchLabels: { app.kubernetes.io/name: web }
```

The `preStop.sleep` action is a newer built-in (beta and on by default from Kubernetes 1.30); on older clusters use `exec: { command: ["sleep", "5"] }` if the image has a `sleep` binary.

## Resources

- **Requests** drive scheduling and the QoS class; **limits** cap usage. Memory over the limit → container killed (`OOMKilled`, exit 137). CPU over the limit → throttled (latency spikes), not killed.
- QoS: requests = limits for all resources → `Guaranteed`; some requests → `Burstable`; none → `BestEffort` (evicted first).
- Size from measurements (metrics-server, Prometheus, VPA in recommendation mode), not guesses. Language runtimes must respect the container limit: JVM `-XX:MaxRAMPercentage`, Node `--max-old-space-size`, Go `GOMEMLIMIT`.
- `LimitRange` and `ResourceQuota` per namespace prevent unbounded pods.
- HPA scales on CPU/memory utilisation relative to **requests** — requests must be realistic for autoscaling to work.

## Probes

| Probe | Question | On failure | Rules |
|---|---|---|---|
| `startupProbe` | Has it finished booting? | Restart after threshold; other probes wait | Use for slow starts instead of a huge `initialDelaySeconds` |
| `readinessProbe` | Should it receive traffic now? | Removed from Service endpoints | May check critical dependencies briefly; cheap; also used during rollouts |
| `livenessProbe` | Is the process wedged? | Container restarted | Only in-process health; **never** depend on DB/other services; generous thresholds |

Separate endpoints (`/healthz`, `/readyz`) keep these concerns apart. A liveness probe identical to readiness causes cascading restarts during an outage.

## Graceful shutdown

On termination the pod is removed from endpoints and gets `SIGTERM` concurrently — so traffic can still arrive for a moment. Sequence: `preStop` (short sleep) → `SIGTERM` → app stops accepting, drains in-flight requests, closes pools → exits before `terminationGracePeriodSeconds` → otherwise `SIGKILL`. The app must run as PID 1 with exec-form `CMD` (or under an init) to receive the signal.

## ConfigMaps and Secrets

- ConfigMap: non-sensitive settings. Secret: credentials, keys, certificates. Both via `envFrom`/`env` or as mounted files (files update in place on change; env vars need a restart).
- Secrets are base64, **not encrypted** — anyone who can `get secrets` in the namespace or create pods there can read them. Enable etcd encryption at rest (managed clusters: check the provider option/KMS), restrict RBAC, and keep secret values out of Git: External Secrets Operator, Secrets Store CSI driver, or encrypted manifests (Sealed Secrets, SOPS).
- Roll pods on config change: a checksum annotation of the config in the pod template (Helm pattern) or `kubectl rollout restart deployment/web`.
- `immutable: true` for config that must not change in place.

## Rollouts and rollback

```bash
kubectl rollout status deployment/web --timeout=5m
kubectl rollout history deployment/web
kubectl rollout undo deployment/web                      # back to previous revision
kubectl rollout undo deployment/web --to-revision=3
kubectl rollout pause|resume deployment/web
```

- With GitOps (Argo CD, Flux) roll back by reverting the Git commit, otherwise the controller re-applies the bad version.
- `progressDeadlineSeconds` marks a stuck rollout as failed; CI should wait on `rollout status` and fail the job.
- Canary/blue-green beyond basic rolling updates: Argo Rollouts, Flagger, or service-mesh/ingress traffic splitting.

## Security

### Pod Security Admission

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: web
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
```

`restricted` requires non-root, no privilege escalation, dropped capabilities and a seccomp profile — the security context in the Deployment above satisfies it.

### RBAC least privilege

```yaml
apiVersion: v1
kind: ServiceAccount
metadata: { name: web, namespace: web }
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: web-read-config, namespace: web }
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["web-config"]
    verbs: ["get", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: web-read-config, namespace: web }
subjects:
  - { kind: ServiceAccount, name: web, namespace: web }
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: web-read-config
```

- No `"*"` in verbs/resources; avoid `ClusterRoleBinding` for workloads; `cluster-admin` only for break-glass humans.
- Sensitive verbs: `get/list secrets`, `create pods` (can mount any secret in the namespace), `pods/exec`, `escalate`, `bind`, `impersonate`, `nodes/proxy`.
- Audit: `kubectl auth can-i --list --as=system:serviceaccount:web:web -n web`.
- Cloud access from pods via workload identity (IRSA/EKS Pod Identity, GKE Workload Identity, Azure Workload Identity), not mounted cloud keys.

### NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: web }
spec:
  podSelector: {}
  policyTypes: ["Ingress", "Egress"]
```

Then allow specific ingress (from the ingress controller) and egress (DNS to kube-system on port 53, the database). Requires a CNI that enforces policies.

## Debugging commands

```bash
kubectl get pods -n web -o wide
kubectl describe pod <pod> -n web                 # events: scheduling, pulls, probe failures, OOM
kubectl logs <pod> -n web -c web --previous        # logs of the crashed container
kubectl get events -n web --sort-by=.lastTimestamp
kubectl top pod -n web                             # needs metrics-server
kubectl debug -it <pod> -n web --image=busybox:1.36 --target=web   # ephemeral debug container
kubectl port-forward svc/web 8080:80 -n web
kubectl get endpointslices -n web -l kubernetes.io/service-name=web   # is anything ready behind the Service?
```

| Status / reason | Look at |
|---|---|
| `Pending` | events: `Insufficient cpu/memory`, taints, node affinity, PVC binding |
| `ContainerCreating` for long | volume mount, secret/configmap missing, CNI errors |
| `CreateContainerConfigError` | referenced Secret/ConfigMap or key missing |
| `CrashLoopBackOff` | `logs --previous`, exit code (1 app error, 137 OOM/SIGKILL, 143 SIGTERM), liveness probe events |
| `ImagePullBackOff` | image name/digest, registry auth (`imagePullSecrets`), architecture, registry rate limits |
| `Evicted` | node memory/disk pressure; ephemeral-storage requests |
| Service has no endpoints | selector labels vs pod labels, readiness failing, `targetPort` mismatch |

## Manifests hygiene

- Labels: `app.kubernetes.io/name`, `…/instance`, `…/version`, `…/part-of`.
- Validate in CI: `kubectl apply --dry-run=server` (against a cluster) or schema validation with `kubeconform`; policy checks with Kyverno/Gatekeeper or `conftest`.
- Helm: pin chart versions; keep secrets out of `values.yaml`; `helm template` and `helm diff` before `upgrade`; `helm upgrade --install --atomic` rolls back on failure.
- Never `kubectl apply` hand-edited production manifests that are managed by GitOps/Helm — it drifts.
