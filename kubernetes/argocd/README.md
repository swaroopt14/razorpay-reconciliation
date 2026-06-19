# Argo CD GitOps — Complete Step-by-Step Setup Guide

This guide covers everything from installing Argo CD on your EKS cluster to fully automated deployments. No prior ArgoCD experience needed.

---

## What You Will Achieve

```
Developer pushes code → Jenkins builds image → Jenkins updates deployment.yaml → Git push
                                                                                    │
                                                                    Argo CD detects change
                                                                                    │
                                                                    Auto-deploys to EKS
                                                                                    │
                                                                    You see it in Argo CD UI
```

**Before (manual):**
```bash
# You had to run this every time after Jenkins built new images
kubectl apply -k kubernetes/eks
```

**After (automated):**
```
Jenkins pushes updated deployment.yaml to GitHub → Argo CD auto-deploys → done
You never touch kubectl again.
```

---

## What Argo CD Will Manage

| App Name | GitHub Path | Deploys To | What It Contains |
|----------|-------------|-----------|-----------------|
| `zord-platform` | `kubernetes/eks` | `zord` namespace | All 9 microservices + Postgres + Kafka |
| `kong-api-gateway` | `kubernetes/api-gateway` | `api-gateway` namespace | Kong Gateway + Admin UI |
| `monitoring` | `kubernetes/monitoring` | `monitoring` namespace | Prometheus + Grafana |
| `logging` | `kubernetes/logging` | `logging` namespace | Elasticsearch + Fluentd + Kibana |
| `tracing` | `kubernetes/tracing` | `tracing` namespace | OTel Collector + Jaeger |

---

## Prerequisites

Before you begin, make sure you have:

- AWS CLI installed and configured with access to account `522189039032`
- `kubectl` installed and connected to your EKS cluster
- Access to the GitHub repo: `Arealis-network/Arealis-Zord-intent`
- A GitHub account that can create Personal Access Tokens
- DNS access to create records for `zordnet.com`

Verify your cluster connection:

```bash
kubectl cluster-info
kubectl get nodes
```

You should see your EKS nodes listed. If not, run:

```bash
aws eks update-kubeconfig --name zord-production --region ap-south-1
```

---

## Part 1: Install Argo CD on EKS

### Step 1.1: Create the ArgoCD Namespace

```bash
kubectl create namespace argocd
```

Verify:

```bash
kubectl get namespace argocd
```

You should see:

```
NAME     STATUS   AGE
argocd   Active   5s
```

---

### Step 1.2: Install Argo CD (Official Manifests)

This installs all ArgoCD components (server, controller, repo-server, redis, dex, notifications):

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml
```

This creates approximately 15-20 resources (Deployments, Services, ConfigMaps, RBAC, etc.)

---

### Step 1.3: Wait for All Pods to Be Ready

```bash
kubectl get pods -n argocd -w
```

Wait until ALL pods show `Running` status (takes 2-3 minutes):

```
NAME                                                READY   STATUS    RESTARTS   AGE
argocd-application-controller-0                     1/1     Running   0          2m
argocd-applicationset-controller-xxx                1/1     Running   0          2m
argocd-dex-server-xxx                               1/1     Running   0          2m
argocd-notifications-controller-xxx                 1/1     Running   0          2m
argocd-redis-xxx                                    1/1     Running   0          2m
argocd-repo-server-xxx                              1/1     Running   0          2m
argocd-server-xxx                                   1/1     Running   0          2m
```

Press `Ctrl+C` once all are Running.

If any pod shows `CrashLoopBackOff` or `Error`, check logs:

```bash
kubectl logs <pod-name> -n argocd
```

---

### Step 1.4: Disable Internal TLS (ALB Will Handle TLS)

Since your ALB (Application Load Balancer) terminates HTTPS, ArgoCD server doesn't need its own TLS:

```bash
kubectl apply -f kubernetes/argocd/argocd-cm-patch.yaml
```

This applies the ConfigMap that sets `server.insecure: "true"`.

Now restart the ArgoCD server to pick up the new config:

```bash
kubectl rollout restart deployment argocd-server -n argocd
```

Wait for it to be ready again:

```bash
kubectl rollout status deployment/argocd-server -n argocd --timeout=120s
```

Expected output:

```
deployment "argocd-server" successfully rolled out
```

---

## Part 2: Expose Argo CD via Load Balancer

### Step 2.1: Create the ALB Ingress

```bash
kubectl apply -f kubernetes/argocd/ingress.yaml
```

This creates an internet-facing ALB that routes `argocd.zordnet.com` to the ArgoCD server.

---

### Step 2.2: Get the ALB Address

```bash
kubectl get ingress argocd-public -n argocd
```

Output will look like:

```
NAME             CLASS   HOSTS                ADDRESS                                          PORTS   AGE
argocd-public    alb     argocd.zordnet.com   k8s-argocd-xxxx-yyyy.ap-south-1.elb.amazonaws.com   80, 443   30s
```

Copy the `ADDRESS` value — that's your ALB DNS name.

If ADDRESS is empty, wait 2-3 minutes. AWS takes time to provision the ALB.

```bash
# Check again after 2 minutes
kubectl get ingress argocd-public -n argocd -w
```

---

### Step 2.3: Create DNS Record

Go to your DNS provider (Route 53 or wherever you manage `zordnet.com`):

1. Open **Route 53** → **Hosted Zones** → `zordnet.com`
2. Click **Create Record**
3. Fill in:
   - **Record name:** `argocd`
   - **Record type:** `CNAME`
   - **Value:** paste the ALB address from Step 2.2 (e.g., `k8s-argocd-xxxx-yyyy.ap-south-1.elb.amazonaws.com`)
   - **TTL:** 300
4. Click **Create Records**

Wait 1-2 minutes for DNS to propagate.

---

### Step 2.4: Get the Initial Admin Password

ArgoCD generates a random admin password on install. Get it:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

**Save this password somewhere safe.** You'll need it to log in.

- **Username:** `admin`
- **Password:** (the output from above command)

---

### Step 2.5: Access the Argo CD UI

Open your browser:

```
https://argocd.zordnet.com
```

Login with:
- **Username:** `admin`
- **Password:** (from Step 2.4)

You should see the ArgoCD dashboard with no applications yet.

**IMPORTANT: Change the default password immediately:**

1. Click the user icon (top left) → **User Info**
2. Click **Update Password**
3. Enter old password → new password → confirm
4. Click **Save**

---

## Part 3: Connect Your Private GitHub Repository

Your repository `Arealis-Zord-intent` is **private**, so ArgoCD needs credentials to read it. Here's how to fix that.

### Step 3.1: Generate a GitHub Personal Access Token (PAT)

1. Go to: `https://github.com/settings/tokens?type=beta` (Fine-grained tokens)
2. Click **Generate new token**
3. Fill in:
   - **Token name:** `argocd-repo-access`
   - **Expiration:** 90 days (or custom — you'll need to rotate it before expiry)
   - **Resource owner:** Select `Arealis-network` (your organization)
   - **Repository access:** Select **Only select repositories** → choose `Arealis-Zord-intent`
   - **Permissions:**
     - **Repository permissions:**
       - **Contents:** Read-only ✅
       - **Metadata:** Read-only ✅ (auto-selected)
     - Everything else: No access
4. Click **Generate token**
5. **COPY THE TOKEN NOW** — you won't see it again

If fine-grained tokens aren't available for your org, use a Classic token:
1. `https://github.com/settings/tokens` → Generate new token (classic)
2. Select scope: `repo` (Full control of private repositories)
3. Generate and copy

---

### Step 3.2: Connect the Repository in ArgoCD UI

1. In ArgoCD UI, go to **Settings** (gear icon, left sidebar)
2. Click **Repositories**
3. Click **+ Connect Repo**
4. Fill in:

| Field | Value |
|-------|-------|
| **Choose your connection method** | VIA HTTPS |
| **Type** | git |
| **Project** | default |
| **Repository URL** | `https://github.com/Arealis-network/Arealis-Zord-intent.git` |
| **Username** | your GitHub username (e.g., `yaswanth-arealis`) |
| **Password** | paste the PAT from Step 3.1 |

5. Click **Connect**

---

### Step 3.3: Verify Connection

After clicking Connect, you should see:

```
Connection Status: Successful ✅
```

If it shows **Failed**:
- Double-check the PAT has `Contents: Read-only` permission
- Make sure the repo URL ends with `.git`
- Verify the PAT hasn't expired
- If using an org, ensure the PAT is authorized for the org (Settings → Personal Access Tokens → check org access)

---

## Part 4: Create Applications in ArgoCD UI

Now you'll create 5 apps — one for each part of your platform. ArgoCD will automatically sync them.

### Important Concept: Auto-Create Namespace

Your EKS cluster may not have namespaces like `zord`, `api-gateway`, `monitoring`, etc. created yet. **That's fine.** When you enable **Auto-Create Namespace** in the sync options, ArgoCD will automatically create the namespace before deploying resources into it.

You do NOT need to manually run `kubectl create namespace`. ArgoCD handles it.

---

### Step 4.1: Create App — `zord-platform` (All 9 Microservices)

1. Click **+ New App** (top left of ArgoCD UI)
2. Fill in:

**GENERAL section:**

| Field | Value |
|-------|-------|
| Application Name | `zord-platform` |
| Project Name | `default` |
| Sync Policy | `Automatic` |

After selecting `Automatic`, two checkboxes appear. **Check BOTH:**

| Checkbox | Check? | What it does |
|----------|--------|-------------|
| **Prune Resources** | ✅ Yes | If you delete a manifest from Git, ArgoCD deletes it from cluster |
| **Self Heal** | ✅ Yes | If someone manually changes something in cluster, ArgoCD reverts it to match Git |

**SOURCE section:**

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/Arealis-network/Arealis-Zord-intent.git` (select from dropdown — it will appear because you connected it in Part 3) |
| Revision | `main` |
| Path | `kubernetes/eks` |

**DESTINATION section:**

| Field | Value |
|-------|-------|
| Cluster URL | `https://kubernetes.default.svc` (this is your local cluster — select from dropdown) |
| Namespace | `zord` |

**SYNC OPTIONS section** (expand "Sync Options" if collapsed):

Check these boxes:

| Option | Check? | What it does |
|--------|--------|-------------|
| **Auto-Create Namespace** | ✅ Yes | Creates the `zord` namespace if it doesn't exist |
| **Apply Out Of Sync Only** | ✅ Yes | Only applies resources that actually changed (faster) |
| **Prune Last** | ✅ Yes | Deletes resources last (safer order) |

**RETRY section** (expand if available):

| Field | Value |
|-------|-------|
| Limit | `3` |
| Duration | `30s` |
| Max Duration | `3m` |
| Factor | `2` |

3. Click **Create**

---

### Step 4.2: Create App — `kong-api-gateway`

Click **+ New App** again:

**GENERAL:**

| Field | Value |
|-------|-------|
| Application Name | `kong-api-gateway` |
| Project Name | `default` |
| Sync Policy | `Automatic` |
| Prune Resources | ✅ |
| Self Heal | ✅ |

**SOURCE:**

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/Arealis-network/Arealis-Zord-intent.git` |
| Revision | `main` |
| Path | `kubernetes/api-gateway` |

**DESTINATION:**

| Field | Value |
|-------|-------|
| Cluster URL | `https://kubernetes.default.svc` |
| Namespace | `api-gateway` |

**SYNC OPTIONS:**

| Option | Check? |
|--------|--------|
| Auto-Create Namespace | ✅ |
| Apply Out Of Sync Only | ✅ |

Click **Create**.

---

### Step 4.3: Create App — `monitoring`

Click **+ New App**:

**GENERAL:**

| Field | Value |
|-------|-------|
| Application Name | `monitoring` |
| Project Name | `default` |
| Sync Policy | `Automatic` |
| Prune Resources | ✅ |
| Self Heal | ✅ |

**SOURCE:**

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/Arealis-network/Arealis-Zord-intent.git` |
| Revision | `main` |
| Path | `kubernetes/monitoring` |

**DESTINATION:**

| Field | Value |
|-------|-------|
| Cluster URL | `https://kubernetes.default.svc` |
| Namespace | `monitoring` |

**SYNC OPTIONS:**

| Option | Check? |
|--------|--------|
| Auto-Create Namespace | ✅ |
| Apply Out Of Sync Only | ✅ |

Click **Create**.

---

### Step 4.4: Create App — `logging`

Click **+ New App**:

**GENERAL:**

| Field | Value |
|-------|-------|
| Application Name | `logging` |
| Project Name | `default` |
| Sync Policy | `Automatic` |
| Prune Resources | ✅ |
| Self Heal | ✅ |

**SOURCE:**

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/Arealis-network/Arealis-Zord-intent.git` |
| Revision | `main` |
| Path | `kubernetes/logging` |

**DESTINATION:**

| Field | Value |
|-------|-------|
| Cluster URL | `https://kubernetes.default.svc` |
| Namespace | `logging` |

**SYNC OPTIONS:**

| Option | Check? |
|--------|--------|
| Auto-Create Namespace | ✅ |
| Apply Out Of Sync Only | ✅ |

Click **Create**.

---

### Step 4.5: Create App — `tracing`

Click **+ New App**:

**GENERAL:**

| Field | Value |
|-------|-------|
| Application Name | `tracing` |
| Project Name | `default` |
| Sync Policy | `Automatic` |
| Prune Resources | ✅ |
| Self Heal | ✅ |

**SOURCE:**

| Field | Value |
|-------|-------|
| Repository URL | `https://github.com/Arealis-network/Arealis-Zord-intent.git` |
| Revision | `main` |
| Path | `kubernetes/tracing` |

**DESTINATION:**

| Field | Value |
|-------|-------|
| Cluster URL | `https://kubernetes.default.svc` |
| Namespace | `tracing` |

**SYNC OPTIONS:**

| Option | Check? |
|--------|--------|
| Auto-Create Namespace | ✅ |
| Apply Out Of Sync Only | ✅ |

Click **Create**.

---

### Step 4.6: Watch the Magic Happen

After creating all 5 apps, ArgoCD will immediately start syncing. Go back to the main dashboard.

You should see all 5 apps appear. They will go through these states:

```
Progressing (syncing...) → Synced ✅ + Healthy 💚
```

This means ArgoCD:
1. Connected to your private GitHub repo ✅
2. Read the manifests from each path ✅
3. Created the namespaces automatically ✅
4. Applied all resources to your cluster ✅
5. Verified pods are healthy ✅

Expected final state:

| App | Sync Status | Health |
|-----|-------------|--------|
| zord-platform | Synced ✅ | Healthy 💚 |
| kong-api-gateway | Synced ✅ | Healthy 💚 |
| monitoring | Synced ✅ | Healthy 💚 |
| logging | Synced ✅ | Healthy 💚 |
| tracing | Synced ✅ | Healthy 💚 |

If any app shows **Degraded** or **Missing**, click on it to see which specific resource failed.

---

## Part 5: Set Up Instant Sync (GitHub Webhook)

By default, ArgoCD polls your repo every 3 minutes. With a webhook, deploys happen within **seconds** of pushing to GitHub.

### Step 5.1: Create the Webhook

1. Go to GitHub: `https://github.com/Arealis-network/Arealis-Zord-intent/settings/hooks`
2. Click **Add webhook**
3. Fill in:

| Field | Value |
|-------|-------|
| **Payload URL** | `https://argocd.zordnet.com/api/webhook` |
| **Content type** | `application/json` |
| **Secret** | leave empty (or set one and configure in ArgoCD) |
| **Which events?** | Select: **Just the push event** |
| **Active** | ✅ checked |

4. Click **Add webhook**

### Step 5.2: Verify Webhook

After creating:
- GitHub will send a test ping
- Check the webhook page — it should show a green checkmark ✅ with status `200`

If it shows red ❌:
- Make sure `https://argocd.zordnet.com` is accessible from the internet
- Check the ALB is healthy: `kubectl get ingress -n argocd`
- DNS must be resolving correctly

### Step 5.3: Test It

1. Make a small change to any file in `kubernetes/eks/` (like adding a comment to a yaml)
2. Commit and push to `main`
3. Watch ArgoCD UI — it should sync within 5-10 seconds instead of waiting 3 minutes

---

## Part 6: How the Full Automation Works Now

### Flow: Developer Deploys a New Service Version

```
1. Developer pushes code changes to main branch
         │
2. Jenkins detects the push (or manual trigger)
         │
3. Jenkins runs:
   a. SonarQube scan (code quality)
   b. Docker build
   c. Docker push to ECR (e.g., zord-edge:v5)
   d. sed updates kubernetes/eks/services/zord-edge/deployment.yaml (image tag → v5)
   e. git commit + git push to main
         │
4. GitHub receives the push
         │
5. GitHub webhook fires → hits https://argocd.zordnet.com/api/webhook
         │
6. ArgoCD detects change in kubernetes/eks/services/zord-edge/deployment.yaml
         │
7. ArgoCD applies the new deployment.yaml to EKS cluster
         │
8. Kubernetes performs rolling update:
   - Starts new pod with v5 image
   - Waits for readiness probe to pass
   - Routes traffic to new pod
   - Terminates old pod
         │
9. ArgoCD marks app as "Synced + Healthy"
         │
10. You see it in the ArgoCD UI — zero manual steps
```

### Flow: Config Change (No Image Rebuild Needed)

```
1. You edit kubernetes/api-gateway/kong/configmap.yaml (add a new route)
2. git commit + push to main
3. GitHub webhook → ArgoCD detects change
4. ArgoCD applies the new ConfigMap
5. NOTE: Pods won't auto-restart for ConfigMap changes
6. You need to either:
   a. Add a restart annotation in the deployment.yaml (triggers rolling restart)
   b. Or manually: kubectl rollout restart deployment/kong-gateway -n api-gateway
```

### Flow: Rollback (Something Goes Wrong)

**Via ArgoCD UI:**
1. Click the app (e.g., `zord-platform`)
2. Click **History and Rollback** (clock icon at top)
3. You see every deployment that happened (with Git commit hash)
4. Click **Rollback** on the previous good version
5. ArgoCD reverts the cluster to that state

**Via Git (preferred — keeps Git as source of truth):**
1. `git revert <bad-commit>` (creates a new commit that undoes the change)
2. `git push`
3. ArgoCD detects the revert → applies old config → everything rolls back

---

## Part 7: Understanding Auto-Create Namespace

### Why This Matters

In a fresh EKS cluster, namespaces like `zord`, `api-gateway`, `monitoring` don't exist. Without the auto-create option, ArgoCD would fail with:

```
namespace "zord" not found
```

### How It Works

When you check **Auto-Create Namespace** (or add `CreateNamespace=true` to sync options):

1. ArgoCD checks: does namespace `zord` exist?
2. If NO → ArgoCD creates it automatically
3. Then ArgoCD deploys all resources into that namespace
4. If YES → ArgoCD skips creation and deploys normally

This means:
- You NEVER need to manually run `kubectl create namespace`
- ArgoCD handles it on first sync
- On subsequent syncs, the namespace already exists so it's skipped

### What About namespace.yaml in Your Manifests?

Your `kubernetes/eks/kustomization.yaml` includes a `namespace.yaml` resource. That's fine — ArgoCD is smart enough to handle both:
- If the namespace was auto-created by ArgoCD, and the manifest also defines it, ArgoCD just sees it already exists and moves on
- No conflict, no error

---

## Part 8: Sync Options Explained In Detail

| Setting | What It Does | Why You Want It |
|---------|-------------|-----------------|
| **Automated Sync** | ArgoCD syncs automatically when Git changes (no manual click) | No human intervention needed |
| **Prune Resources** | If you delete a manifest from Git, ArgoCD deletes it from cluster | Keeps cluster clean, matches Git exactly |
| **Self Heal** | If someone manually `kubectl edit` something, ArgoCD reverts it | Prevents drift — Git is always the truth |
| **Auto-Create Namespace** | Creates namespace if it doesn't exist | No manual `kubectl create namespace` needed |
| **Apply Out Of Sync Only** | Only applies resources that actually changed | Faster syncs, less API pressure |
| **Prune Last** | Deletes resources last (after new ones are created) | Safer — new resources ready before old ones die |
| **Retry (limit: 3)** | If sync fails, retries 3 times with backoff | Handles transient errors (network blip, API throttle) |

### What is Self Heal?

Scenario without self-heal:
1. You have `replicas: 2` in Git
2. Someone runs `kubectl scale deployment zord-edge --replicas=5`
3. Cluster now has 5 replicas, Git says 2
4. ArgoCD shows "OutOfSync" but does nothing

Scenario WITH self-heal:
1. You have `replicas: 2` in Git
2. Someone runs `kubectl scale deployment zord-edge --replicas=5`
3. ArgoCD detects the drift within seconds
4. ArgoCD reverts it back to `replicas: 2`
5. Git wins. Always.

### Ignore Differences (Advanced)

Your `zord-platform` app has this configured:

```yaml
ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas
```

This tells ArgoCD: "Don't fight with HPA over replica counts." Because HPA (Horizontal Pod Autoscaler) dynamically changes replicas, and you don't want ArgoCD reverting that every time.

---

## Part 9: Monitoring ArgoCD Itself

### Health Check

```bash
kubectl get pods -n argocd
```

All pods should be `Running`. Key pods:

| Pod | What It Does |
|-----|-------------|
| `argocd-server` | UI + API |
| `argocd-application-controller` | Watches apps, performs syncs |
| `argocd-repo-server` | Clones Git repos, renders manifests |
| `argocd-redis` | Caching layer |
| `argocd-dex-server` | SSO/authentication (optional) |
| `argocd-notifications-controller` | Sends Slack/email notifications |

### Logs

```bash
# Check ArgoCD server logs
kubectl logs deployment/argocd-server -n argocd --tail=50

# Check controller logs (sync issues appear here)
kubectl logs statefulset/argocd-application-controller -n argocd --tail=50

# Check repo-server logs (Git connection issues appear here)
kubectl logs deployment/argocd-repo-server -n argocd --tail=50
```

### Resource Usage

ArgoCD is lightweight. Typical usage for 5 apps:
- CPU: ~200m total across all pods
- Memory: ~512Mi total
- Storage: minimal (uses Redis for cache)

---

## Part 10: Troubleshooting

### Problem: App shows "OutOfSync" but won't auto-sync

**Cause:** Auto-sync might not be enabled, or there's a sync error.

**Fix:**
1. Click the app in UI
2. Check if "Automated" appears under Sync Policy
3. If not, click **App Details** → **Edit** → set Sync Policy to Automatic
4. If already Automatic, check the **Events** tab for error messages

---

### Problem: App shows "ComparisonError" or "Unknown"

**Cause:** ArgoCD can't render the manifests (usually a Kustomize error).

**Fix:**
```bash
# Test locally that kustomize works
kubectl kustomize kubernetes/eks
```

If this fails locally, fix the kustomization.yaml first.

---

### Problem: "repository not accessible" or "authentication required"

**Cause:** GitHub PAT expired, wrong permissions, or repo URL typo.

**Fix:**
1. Go to **Settings** → **Repositories**
2. Click the ❌ failed repo
3. Click **Disconnect**
4. Re-add with correct PAT (Step 3.1 and 3.2)

---

### Problem: App is "Synced" but "Degraded"

**Cause:** Resources deployed successfully but pods aren't healthy (CrashLoopBackOff, ImagePullBackOff, etc.)

**Fix:**
1. Click the app → find the red/yellow resource
2. Click on it → check **Events** tab
3. Common causes:
   - `ImagePullBackOff`: Image doesn't exist in ECR (wrong tag)
   - `CrashLoopBackOff`: App crashes on startup (check logs)
   - `Pending`: Not enough cluster resources (nodes full)

```bash
# Check pod events
kubectl describe pod <pod-name> -n zord

# Check pod logs
kubectl logs <pod-name> -n zord
```

---

### Problem: Namespace not created automatically

**Cause:** `CreateNamespace=true` sync option is not set.

**Fix:**
1. Click the app → **App Details** → **Edit**
2. Scroll to **Sync Options**
3. Add: `CreateNamespace=true`
4. Save

Or delete and recreate the app with the checkbox enabled.

---

### Problem: ArgoCD UI not loading

**Cause:** ALB not ready, DNS not configured, or ArgoCD server pod crashed.

**Fix:**
```bash
# Check ingress
kubectl get ingress -n argocd

# Check if ALB has an address
kubectl describe ingress argocd-public -n argocd

# Check ArgoCD server pod
kubectl get pods -n argocd | grep argocd-server

# If pod is not running, check logs
kubectl logs deployment/argocd-server -n argocd
```

---

### Problem: Webhook not triggering (still takes 3 minutes)

**Cause:** Webhook URL unreachable or misconfigured.

**Fix:**
1. Go to GitHub → repo Settings → Webhooks
2. Click the webhook
3. Scroll down to **Recent Deliveries**
4. Check if deliveries show green ✅ (200) or red ❌
5. If red: check the response body for error details
6. Common fix: ensure ALB security group allows inbound HTTPS (443) from `0.0.0.0/0`

---

## Part 11: Rotating the GitHub PAT (Before It Expires)

Your PAT has an expiration date. Before it expires, you need to rotate it:

1. Generate a new PAT (same steps as Step 3.1)
2. In ArgoCD UI → **Settings** → **Repositories**
3. Click your repo → **Edit**
4. Update the Password field with the new PAT
5. Click **Save**
6. Verify connection status shows ✅

Set a calendar reminder for 1 week before expiry.

---

## Part 12: Security Best Practices

| Practice | Status | Action |
|----------|--------|--------|
| Change default admin password | ❗ Do this first | Settings → User Info → Update Password |
| Use read-only GitHub PAT | ✅ | Only needs Contents: Read permission |
| ALB uses HTTPS (TLS termination) | ✅ | ACM certificate handles this |
| Internal TLS disabled (no double encryption) | ✅ | `argocd-cm-patch.yaml` handles this |
| Restrict ALB access (optional) | ❓ Consider | Add security group rules to limit access to your team's IPs |
| Enable SSO (optional, future) | ❓ Consider | GitHub OAuth instead of shared admin password |

---

## Part 13: Complete Command Summary (Quick Reference)

### One-Time Setup (Run Once)

```bash
# 1. Create namespace
kubectl create namespace argocd

# 2. Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml

# 3. Wait for pods
kubectl get pods -n argocd -w

# 4. Disable internal TLS
kubectl apply -f kubernetes/argocd/argocd-cm-patch.yaml
kubectl rollout restart deployment argocd-server -n argocd

# 5. Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 6. Create ingress (load balancer access)
kubectl apply -f kubernetes/argocd/ingress.yaml

# 7. Get ALB address for DNS
kubectl get ingress argocd-public -n argocd

# 8. Then in UI:
#    - Change admin password
#    - Connect private repo (Settings → Repositories)
#    - Create 5 apps (New App × 5)
#    - Set up GitHub webhook
```

### Daily Operations (You Do Nothing — It's Automated)

```bash
# Check app status (optional — just look at UI)
kubectl get applications -n argocd

# Force sync if needed (rarely)
kubectl patch application zord-platform -n argocd --type merge -p '{"operation":{"initiatedBy":{"username":"admin"},"sync":{}}}'
```

### If Something Goes Wrong

```bash
# Check what's different between Git and cluster
kubectl exec -n argocd deployment/argocd-server -- argocd app diff zord-platform --local kubernetes/eks

# Force hard refresh from Git
kubectl patch application zord-platform -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'

# Check ArgoCD controller logs
kubectl logs statefulset/argocd-application-controller -n argocd --tail=100
```

---

## Folder Structure

```
kubernetes/argocd/
├── kustomization.yaml          ← reference file (lists all resources)
├── namespace.yaml              ← argocd namespace definition
├── secret.yaml                 ← admin credentials reference
├── argocd-cm-patch.yaml        ← disable internal TLS (ALB handles it)
├── ingress.yaml                ← argocd.zordnet.com ALB Ingress
├── apps/
│   ├── zord-app.yaml           ← watches kubernetes/eks → zord namespace
│   ├── kong-app.yaml           ← watches kubernetes/api-gateway → api-gateway namespace
│   ├── monitoring-app.yaml     ← watches kubernetes/monitoring → monitoring namespace
│   ├── logging-app.yaml        ← watches kubernetes/logging → logging namespace
│   └── tracing-app.yaml        ← watches kubernetes/tracing → tracing namespace
└── README.md                   ← this file
```

---

## DNS Records

| Domain | Points To | Purpose |
|--------|-----------|---------|
| `argocd.zordnet.com` | ALB address | Argo CD UI |

---

## After Setup — Your New Workflow

**Old workflow (manual):**
```
Code change → Jenkins build → someone runs kubectl apply (manual) → pray it works → no visibility
```

**New workflow (automated):**
```
Code change → Jenkins build → Git push → ArgoCD auto-deploys → see status in UI → rollback with one click if needed
```

You never run `kubectl apply` again. Everything goes through Git. Everything is tracked. Everything is automated.
