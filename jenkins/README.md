# Jenkins Deployment Guide

This guide explains how to deploy the Arealis Zord services with Jenkins.

## Pipeline Files

- `jenkins/Jenkinsfile.service-ecr`
  Deploy one service at a time.
- `jenkins/Jenkinsfile.all-services-ecr`
  Deploy multiple services in one run.

## What The Pipelines Do

1. Check out this repository.
2. Optionally run SonarQube analysis.
3. Make sure the target Amazon ECR repository exists.
4. Build the Docker image from `backend/<service>`.
5. Push the image to Amazon ECR.
6. Update the Kubernetes manifest in `kubernetes/eks/services/<service>/deployment.yaml`.
7. Commit and push the manifest change back to GitHub.

## Before You Start

Make sure your Jenkins agent has:

- Docker CLI with permission to build and push images
- AWS CLI v2
- Git
- Bash or another Unix-like shell
- SonarScanner installed in Jenkins if you want SonarQube scans

## Step 0: Install Jenkins Plugins

Install these Jenkins plugins before creating the pipeline jobs.

### Required Plugins

- `Pipeline`
  Needed to run `Jenkinsfile` pipelines.
- `Pipeline: Stage View`
  Shows the pipeline stages clearly in Jenkins.
- `Git`
  Needed for checkout from GitHub.
- `Credentials`
  Lets Jenkins store GitHub and AWS credentials safely.
- `Credentials Binding`
  Needed because the pipeline uses `usernamePassword(...)`.
- `SonarQube Scanner for Jenkins`
  Needed for `withSonarQubeEnv(...)` and SonarQube integration.

### Recommended Plugins

- `GitHub`
  Helpful if you connect Jenkins jobs directly with GitHub.
- `Blue Ocean`
  Optional, but gives a cleaner pipeline UI.

### Not Required For This Pipeline

- `Docker Pipeline`
  Not required here because this repo uses normal shell commands like `docker build` and `docker push`.

## Step 1: Create Jenkins Credentials

Create these credentials in Jenkins.

### GitHub Credential

- Credential ID: `github-pat`
- Type: `Username with password`
- Username: your GitHub username
- Password: a GitHub personal access token with repo write access

### AWS Credential

Only required if `USE_INSTANCE_ROLE=false`.

- Credential ID: `aws-ecr-credentials`
- Type: `Username with password`
- Username: AWS access key ID
- Password: AWS secret access key

## Step 2: Configure SonarQube In Jenkins

Only needed if you want SonarQube analysis.

### Part A: Generate A SonarQube Token

1. Log in to SonarQube as an administrator or a user who can generate tokens.
2. Open `My Account`.
3. Open `Security`.
4. In `Generate Tokens`, enter a token name.
   Example: `jenkins-sonarqube-token`
5. Keep `Type` as `User Token`.
6. Set the expiry as needed.
   Example: `1 year`
7. Click the generate button.
8. Copy the token immediately.

Important:

- SonarQube usually shows the token only once.
- Save it safely because you will use it in Jenkins.

### Part A1: Add The SonarQube Token As A Jenkins Credential

1. Open `Jenkins Dashboard`.
2. Open `Manage Jenkins`.
3. Open `Credentials`.
4. Click `System`.
5. Open `Global credentials (unrestricted)`.
6. Click `Add Credentials`.
7. Fill in the fields like this:

- `Kind`: `Secret text`
- `Secret`: paste your SonarQube token
- `ID`: `sonarqube-token`
- `Description`: `sonarqube-token`

8. Click `Create`.

Important:

- Use the same token you generated in SonarQube.
- You will select or reference this credential when configuring the SonarQube server in Jenkins.

### Part B: Configure The SonarQube Server In Jenkins

Your Jenkinsfile uses this parameter by default:

- `SONARQUBE_ENV=sonarqube`

So the SonarQube installation name in Jenkins should be exactly:

- `sonarqube`

Steps:

1. Open `Manage Jenkins`.
2. Open `System`.
3. Find the `SonarQube servers` section.
4. Click `Add SonarQube`.
5. In `Name`, enter:

```text
sonarqube
```

6. In `Server URL`, enter your SonarQube URL.
   Example:

```text
http://13.206.199.9:7771
```

7. In `Server authentication token`, add the token you created in SonarQube.
8. Save the Jenkins configuration.

### Part C: Configure The SonarScanner Tool In Jenkins

Your Jenkinsfile uses this parameter by default:

- `SONAR_SCANNER_TOOL=sonar-scanner`

So the SonarScanner tool name in Jenkins should be exactly:

- `sonar-scanner`

Steps:

1. Open `Manage Jenkins`.
2. Open `Tools`.
3. Find `SonarQube Scanner installations`.
4. Click `Add SonarQube Scanner`.
5. In `Name`, enter:

```text
sonar-scanner
```

6. Install it automatically, or point Jenkins to an existing scanner installation.
7. Save the Jenkins configuration.

### Part D: Confirm The Names Match The Pipeline

In this repo, the pipeline expects these default values:

- `SONARQUBE_ENV=sonarqube`
- `SONAR_SCANNER_TOOL=sonar-scanner`

These values are used in:

- [Jenkinsfile.all-services-ecr](</c:/Users/Yaswanth Reddy/OneDrive - vitap.ac.in/Desktop/Arealis-Zord-intent/jenkins/Jenkinsfile.all-services-ecr:16>)
- [Jenkinsfile.all-services-ecr](</c:/Users/Yaswanth Reddy/OneDrive - vitap.ac.in/Desktop/Arealis-Zord-intent/jenkins/Jenkinsfile.all-services-ecr:17>)
- [Jenkinsfile.service-ecr](</c:/Users/Yaswanth Reddy/OneDrive - vitap.ac.in/Desktop/Arealis-Zord-intent/jenkins/Jenkinsfile.service-ecr:31>)
- [Jenkinsfile.service-ecr](</c:/Users/Yaswanth Reddy/OneDrive - vitap.ac.in/Desktop/Arealis-Zord-intent/jenkins/Jenkinsfile.service-ecr:32>)

If you use different names in Jenkins, then pass those different names in the build parameters when you run the job.

### Part E: Configure The SonarQube Webhook

This part is needed only if you want Jenkins to wait for the SonarQube Quality Gate result by using `waitForQualityGate(...)`.

Right now, the current pipelines in this repo run SonarQube scans, but they do not yet stop and wait for the Quality Gate result. So for the current version, webhook setup is optional.

If you later add a Quality Gate wait stage, configure the webhook like this.

1. Log in to SonarQube.
2. Open `Administration`.
3. Open `Configuration`.
4. Open `Webhooks`.
5. Click `Create`.
6. In `Name`, enter a webhook name.
   Example:

```text
jenkins-sonarqube-webhook
```

7. In `URL`, enter your Jenkins webhook URL.
   Example:

```text
http://13.206.199.9:7777/sonarqube-webhook/
```

8. Make sure the URL ends with a trailing slash `/`.
9. Save the webhook.

Important:

- The trailing slash is mandatory.
- Use your real Jenkins URL, not the example URL, if your Jenkins address is different.
- You can configure the webhook globally in SonarQube, or at project level if you want more control.

Optional security:

- You can also configure a webhook secret in Jenkins and SonarQube if you want Jenkins to verify that the webhook request really came from SonarQube.

You need the webhook when:

- you use `waitForQualityGate(...)` in Jenkins
- you want the pipeline to fail automatically when the SonarQube Quality Gate fails

## Step 3: Create The Jenkins Job

### For One Service

1. Create a new Jenkins pipeline job.
2. Choose `Pipeline`.
3. In the pipeline definition, use `Pipeline script from SCM`.
4. Select your Git repository.
5. Set the script path to `jenkins/Jenkinsfile.service-ecr`.
6. Save the job.

### For All Services

1. Create another Jenkins pipeline job.
2. Choose `Pipeline`.
3. In the pipeline definition, use `Pipeline script from SCM`.
4. Select your Git repository.
5. Set the script path to `jenkins/Jenkinsfile.all-services-ecr`.
6. Save the job.

## Step 4: Choose Pipeline Parameters

These are the important parameters used by the pipelines.

- `AWS_ACCOUNT_ID`
  Your AWS account ID.
- `AWS_REGION`
  Example: `ap-south-1`.
- `IMAGE_TAG`
  Optional image tag. If left empty, Jenkins uses `vBUILD_NUMBER`.
- `GIT_BRANCH`
  Branch to update in GitHub. Use values like `main`.
- `ECR_REPOSITORY_PREFIX`
  Repository namespace in ECR, for example `zord`.
- `USE_INSTANCE_ROLE`
  Keep this `true` if Jenkins runs on an EC2 instance with a working IAM role.
- `RUN_SONARQUBE`
  Set to `true` to scan code before building.
- `SONARQUBE_ENV`
  Jenkins SonarQube server name, for example `sonarqube`.
- `SONAR_SCANNER_TOOL`
  Jenkins SonarScanner tool name, for example `sonar-scanner`.
- `SONAR_PROJECT_KEY_PREFIX`
  Base SonarQube project key prefix, for example `Arealis-network_Arealis-Zord`.
- `PUSH_MANIFEST_CHANGES`
  If `true`, Jenkins commits the updated deployment manifest and pushes it to GitHub.

Extra parameters by pipeline:

- `SERVICE_NAME`
  Used only in `Jenkinsfile.service-ecr`.
- `SERVICES`
  Comma-separated list used only in `Jenkinsfile.all-services-ecr`.

## Step 5: Run Single-Service Deployment

Use `jenkins/Jenkinsfile.service-ecr` when you want to deploy one service.

1. Open the Jenkins job for single-service deployment.
2. Click `Build with Parameters`.
3. Select the `SERVICE_NAME`.
4. Fill in or confirm the remaining parameters.
5. Start the build.
6. Jenkins will:
   - optionally run SonarQube
   - build the Docker image
   - push the image to ECR
   - update the Kubernetes deployment manifest
   - commit and push the manifest change

## Step 6: Run Multi-Service Deployment

Use `jenkins/Jenkinsfile.all-services-ecr` when you want to deploy multiple services.

1. Open the Jenkins job for all-services deployment.
2. Click `Build with Parameters`.
3. In `SERVICES`, enter a comma-separated list such as:

```text
zord-console,zord-edge,zord-intelligence
```

4. Fill in or confirm the remaining parameters.
5. Start the build.
6. Jenkins will repeat the full deploy flow for each listed service.

## Step 7: Apply The Updated Kubernetes Manifests

These Jenkins pipelines update the manifest files in GitHub, but they do not directly run `kubectl apply`.

After Jenkins updates the deployment YAML files, apply them to your cluster using your normal Kubernetes deployment flow, for example:

```bash
kubectl apply -f kubernetes/eks/services/zord-console/deployment.yaml
```

If you use Argo CD, Flux, or another GitOps tool, that tool should pick up the manifest change from GitHub and deploy it automatically.

## SonarQube Project Pattern

The pipeline creates one SonarQube analysis per service.

Examples:

- `Arealis-network_Arealis-Zord:zord-console`
- `Arealis-network_Arealis-Zord:zord-edge`
- `Arealis-network_Arealis-Zord:zord-intelligence`

## Common Folder Pattern

Each deployable service is expected to follow this structure:

- `backend/<service>`
- `backend/<service>/Dockerfile`
- `kubernetes/eks/services/<service>/deployment.yaml`

Example:

- `backend/zord-console`
- `backend/zord-console/Dockerfile`
- `kubernetes/eks/services/zord-console/deployment.yaml`

## Troubleshooting

### SonarQube Stage Fails

Check:

- Jenkins SonarQube server name matches `SONARQUBE_ENV`
- Jenkins SonarScanner tool name matches `SONAR_SCANNER_TOOL`
- Jenkins agent can reach the SonarQube server

### AWS Push Fails

Check:

- `AWS_ACCOUNT_ID` and `AWS_REGION`
- IAM role permissions or `aws-ecr-credentials`
- ECR repository naming under `ECR_REPOSITORY_PREFIX`

### Docker Is Not Found In Jenkins

If the build fails with `docker: not found` during ECR login, Jenkins is running on an agent without the Docker CLI.

Run this check on the Jenkins agent or from a pipeline workspace:

```bash
bash jenkins/verify-jenkins-runtime.sh
```

For the EC2 Docker-based setup in this repository, start Jenkins with:

```bash
bash ools/tools.sh
```

That script builds a Jenkins image with AWS CLI, Docker CLI, and Git, then mounts `/var/run/docker.sock` so Jenkins can run `docker build` and `docker push`.

### Git Push Fails

Check:

- `github-pat` exists in Jenkins
- the token has repo write access
- `GIT_BRANCH` is correct, for example `main`

### Manifest Update Fails

Check:

- the service folder exists under `backend/`
- the deployment file exists under `kubernetes/eks/services/`
- the deployment YAML contains an `image:` field

## Recommended Defaults

For your current setup, these values are a good starting point:

- `AWS_ACCOUNT_ID=522189039032`
- `AWS_REGION=ap-south-1`
- `ECR_REPOSITORY_PREFIX=zord`
- `GIT_BRANCH=main`
- `USE_INSTANCE_ROLE=true`
- `RUN_SONARQUBE=true`
- `SONARQUBE_ENV=sonarqube`
- `SONAR_SCANNER_TOOL=sonar-scanner`

## Quick Example

### Single Service

- Script path: `jenkins/Jenkinsfile.service-ecr`
- `SERVICE_NAME=zord-console`
- `IMAGE_TAG=v10`

### All Services

- Script path: `jenkins/Jenkinsfile.all-services-ecr`
- `SERVICES=zord-console,zord-edge,zord-intelligence,ml-service`
- `IMAGE_TAG=v10`
