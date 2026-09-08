# Secure Case - Product Requirements

## Product

Secure Case is a digital evidence management prototype for investigation and
legal teams. It ingests evidence, verifies integrity, enforces role-based
access, records audit events, and provides local AI-assisted review of
readable documents.

## Current release scope

- Six-digit PIN authentication backed by bcrypt hashes and short-lived JWTs.
- Investigating Officer, Legal Officer, and Administrator roles.
- Evidence upload for PDF, TXT, PNG, JPG, JPEG, and WEBP files up to 15 MB.
- Server-side SHA-256 hashing and integrity verification before content access.
- Administrator-controlled access requests and evidence deletion.
- Controlled PDF/text preview and Administrator-only downloads.
- Structured PDF/TXT analysis through a locally running Ollama model.
- Audit events for uploads, access decisions, views, downloads, removals,
  analysis, and integrity alerts.
- Responsive browser experience suitable for desktop and phone demonstrations.

## Authorization requirements

All authorization decisions must be enforced by the backend. Client-supplied
roles and IDs must not grant access. Evidence metadata must not include file
contents, and evidence content must be returned only after JWT authorization
and a fresh hash comparison succeed. Tampered evidence must be blocked and
recorded as an alert.

## AI requirements

The backend rejects empty or oversized input, calls the configured local model,
validates the JSON response, and stores the model name and timestamp with the
result. AI output is advisory and must not be treated as a legal conclusion.
Image OCR is outside the current release.

## Local and remote demo topology

```text
Browser -> frontend tunnel -> Vite :5173
                         -> backend tunnel -> Express :5000
                                             -> Ollama :11434 (private)
```

The frontend and backend use separate temporary HTTPS tunnels. The frontend
`VITE_API_URL` must include `/api` and point to the backend tunnel. The backend
`FRONTEND_ORIGIN` must exactly match the frontend tunnel origin. Ollama and
MongoDB must never be exposed directly.

Only the frontend URL is shared. A temporary tunnel URL is a bearer link:
anyone who obtains it can open the login page, while all protected data and
actions still require valid authentication and server-side authorization.
Production deployment requires controlled HTTPS ingress, identity-aware access
controls, managed secrets, monitoring, backups, and a hardened database.

## Release acceptance criteria

- Configured users can authenticate through local and tunneled frontend flows.
- Authorized users can upload, view, and manage evidence according to role.
- Evidence hashes are stored immutably and verified before content is served.
- Access requests, administrator decisions, and audit events are persisted.
- Readable PDF and TXT files produce validated structured AI results.
- Ollama remains reachable only from the backend host.
- API CORS allows only the configured frontend origin in production.
- `.env`, credentials, tunnel logs, `node_modules`, and build output are ignored.
- Frontend lint/build and backend syntax checks pass.

## Future improvements

OCR, case-level permissions, source-linked AI findings, signed manifests,
append-only audit storage, malware scanning, notifications, and report export.
