# Security Policy

## Supported Versions

Security fixes are provided for the actively maintained code in this repository:

| Version / Branch | Supported |
| --- | --- |
| `main` / latest working branch | Yes |
| Older snapshots, forks, and ad-hoc local copies | No |

If you are running a long-lived instance, upgrade to the latest maintained revision before requesting a security fix whenever possible.

## Reporting a Vulnerability

Please report security issues privately. Do not open a public issue, pull request, or discussion with exploit details.

Contact the repository owner directly with:

- A short summary of the issue and affected service
- Impact assessment
- Reproduction steps or proof of concept
- Affected environment
- Any suggested mitigation if you already have one

If the report involves secrets, customer data, payment flows, tenant isolation, or signing keys, mark it as high severity in the subject line.

## Response Expectations

The maintainers will aim to:

- Acknowledge receipt within 3 business days
- Confirm triage status within 7 business days
- Share mitigation guidance or a remediation plan after validation

Fix timelines depend on severity and exploitability.

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

## Local hardening notes

When running the stack locally:

- Do not commit real Razorpay live keys, vault keys, or database passwords
- Keep webhook secrets and JWT signing keys in gitignored `.env` files
- Avoid recording raw secrets, tokens, or full sensitive payloads in logs

## Testing Guidelines

Security research should be limited to systems you own or are explicitly authorized to test. Please avoid:

- Accessing data that does not belong to you
- Running destructive tests against shared environments
- Flooding live endpoints
- Public disclosure before the maintainers have had time to investigate and remediate

## Disclosure

After a fix is available, coordinated disclosure is welcome. Please wait for maintainer confirmation before sharing technical details publicly.
