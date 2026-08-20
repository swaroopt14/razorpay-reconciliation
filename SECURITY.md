# Security Policy

## Supported Versions

Security fixes are provided for the actively maintained code in this repository:

| Version / Branch | Supported |
| --- | --- |
| `main` / latest private working branch | Yes |
| Older snapshots, forks, and ad-hoc local copies | No |

If you are running a long-lived deployment, upgrade to the latest maintained revision before requesting a security fix whenever possible.

## Reporting a Vulnerability

Please report security issues privately. Do not open a public issue, pull request, or discussion with exploit details.

Use your existing private maintainer channel for this repository, or contact the repository owners directly with:

- A short summary of the issue and affected service
- Impact assessment
- Reproduction steps or proof of concept
- Affected environment or deployment path
- Any suggested mitigation if you already have one

If the report involves secrets, customer data, payment flows, tenant isolation, or signing keys, mark it as high severity in the subject line.

## Response Expectations

The maintainers will aim to:

- Acknowledge receipt within 3 business days
- Confirm triage status within 7 business days
- Share mitigation guidance or a remediation plan after validation

Fix timelines depend on severity, exploitability, and deployment exposure.

## Scope

The highest-priority reports for this repository include:

- Authentication or authorization bypasses in `zord-edge`, `zord-console`, or admin/operator flows
- Tenant-isolation failures or cross-tenant data access
- Webhook forgery, replay, or signature-validation bypasses
- Leakage of API keys, webhook secrets, database credentials, vault keys, or signing keys
- PII exposure in ingestion, tokenization, storage, logs, or console views
- Tampering with contract signing, receipt integrity, or evidence artifacts
- Remote code execution, SSRF, injection, unsafe deserialization, or arbitrary file access
- Prompt-layer issues that can expose sensitive internal data or bypass intended data boundaries

## Deployment Hardening Notes

This repository includes multiple backend services, a console app, Docker/Kubernetes manifests, and local-development helpers. Before exposing any deployment to real traffic:

- Replace all development, demo, or fallback secrets with unique production-managed secrets.
- Store sensitive values such as `ZORD_VAULT_KEY`, database credentials, webhook secrets, and signing keys in a proper secret manager or encrypted deployment secret store. zord-token-enclave no longer holds a static master key at all -- it wraps tenant DEKs via AWS KMS (`KMS_KEY_ID`, a non-secret ARN) using its IAM role, so the credential surface to protect there is the IAM grant itself, not an application-level secret.
- Do not rely on mock or browser-local authentication patterns for internet-exposed environments.
- Keep `/metrics`, health endpoints, admin surfaces, and internal service ports restricted to trusted networks.
- Enforce TLS at the edge and for service-to-service paths where required by your environment.
- Rotate credentials immediately if they were ever committed, copied into chat, or used in an insecure environment.
- Review public endpoints such as tenant registration and webhook ingestion before production exposure.
- Log securely and avoid recording raw secrets, tokens, or full sensitive payloads.

## Testing Guidelines

Security research should be limited to systems you own or are explicitly authorized to test. Please avoid:

- Accessing data that does not belong to you
- Running destructive tests against shared environments
- Flooding production endpoints
- Public disclosure before the maintainers have had time to investigate and remediate

## Disclosure

After a fix is available and deployed, coordinated disclosure is welcome. Please wait for maintainer confirmation before sharing technical details publicly.
