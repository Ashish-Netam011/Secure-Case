# Secure Case

## Product Requirements Document

### 1. Overview

Secure Case is a digital evidence management system for investigation and legal teams. It provides controlled access to evidence, verifies file integrity, records chain-of-custody activity, and supports AI-assisted review of readable documents.

The current release is a local/demo deployment. Remote demonstrations use
separate temporary tunnels for the frontend and backend; the local Ollama
service remains private and is never exposed directly.

### 2. Objectives

- Keep evidence files and their integrity records together.
- Ensure access decisions are enforced by the backend.
- Require approval before restricted evidence is viewed.
- Detect changes to stored evidence and block access when a mismatch is found.
- Provide useful, reviewable AI summaries without replacing professional judgment.
- Maintain a complete record of evidence activity.

### 3. Users and permissions

#### Investigating Officer

- Upload evidence.
- View evidence they uploaded.
- Request access to other evidence.
- Analyze evidence they are authorized to view.

#### Legal Officer

- Request access to evidence.
- View evidence after approval.
- Analyze approved evidence.
- Cannot upload or download evidence.

#### Administrator

- Upload and view evidence.
- Approve or reject access requests.
- Download evidence.
- Review audit events and integrity alerts.

### 4. User journeys

#### Upload evidence

1. An authorized user selects a supported file.
2. The client calculates a SHA-256 hash for immediate feedback.
3. The backend calculates the hash again and stores the file with the server-generated value.
4. The upload is recorded in the audit log.

Supported formats are PDF, TXT, PNG, JPG, JPEG, and WEBP. The maximum file size is 15 MB.

#### Request access

1. A user selects restricted evidence and provides a reason.
2. The request is linked to the authenticated user and evidence record.
3. An Administrator approves or rejects the request.
4. The decision is recorded and applies only to the requested evidence and user.

#### View evidence

1. The backend verifies the user’s authorization.
2. The backend recalculates the file hash.
3. Access is granted only when authorization and integrity checks pass.
4. PDFs are rendered in the application’s controlled preview rather than the browser’s native PDF viewer.
5. Download is available only to Administrators.

#### Detect tampering

1. The current file hash is calculated when evidence metadata is loaded and before content is served.
2. The current hash is compared with the original stored hash.
3. A mismatch marks the file as `TAMPERED` and blocks access.
4. The system records the expected hash, current hash, evidence ID, user, and timestamp.
5. Administrators see the alert in the evidence list and audit log.

#### Analyze evidence

1. An authorized user selects AI Analyze.
2. Text is extracted from PDFs through PDF.js or read directly from TXT files.
3. The backend sends the text to the configured local language model.
4. The result is validated and displayed as structured findings.
5. The result is stored with the model name and analysis timestamp.

### 5. Functional requirements

#### Authentication

- Users authenticate with a six-digit security PIN.
- The backend issues a signed, short-lived JWT.
- Invalid and expired tokens return HTTP 401.
- PIN hashes and signing secrets are supplied through environment variables.

#### Evidence records

Each record must contain:

- Case ID
- Title and category
- Original filename and MIME type
- File size
- Uploader identity and role
- SHA-256 hash
- Created timestamp
- Integrity status

Evidence-list responses must not include file contents.

#### Authorization

- Upload, view, download, delete, and administrative actions must be checked on the server.
- Client-supplied user IDs and roles must not be used for authorization.
- Access requests must be tied to the identity in the JWT.
- Only Administrators may review requests or view audit events.

#### Integrity alerts

- The original hash must not be changed after upload.
- Evidence must be rehashed before it is served.
- Mismatched evidence must not be returned to the client.
- Tamper events must use a distinct alert status and be visible to Administrators.
- The interface must show a clear warning and disable the View action.

#### AI analysis

- Empty input must be rejected.
- Input must have a defined maximum length.
- The response must be valid JSON with at least a summary, classification, and confidence value.
- AI failures must produce a readable error message and leave the application usable.
- Results must be treated as assistance for review, not as final legal findings.
- PDF and TXT analysis are supported in the current release. Image OCR is a future capability.

#### Audit log

The system must record uploads, access requests, approvals, rejections, views, downloads, removals, AI analysis outcomes, and tamper alerts.

Events should include the action, status, user identity, evidence ID, request ID when applicable, reason when applicable, and timestamp.

### 6. Non-functional requirements

- Backend authorization must not depend on frontend controls.
- API responses must use a consistent JSON error format.
- Sensitive values must not be written to logs.
- The interface must provide clear loading, success, blocked, empty, and error states.
- The system must support MongoDB and the configured AI service through environment variables.
- Production deployments must require a strong JWT secret and configured PIN hashes.

### 7. Success criteria

- Unauthorized users cannot retrieve evidence content.
- Every served evidence file passes a hash check or is blocked.
- Every access decision creates an audit event.
- Legal Officers can view approved evidence without receiving an application download control.
- PDF and TXT files produce structured AI analysis when readable text is available.
- Tampered files are identified, inaccessible, and recorded in the audit log.
- Failed requests do not result in a blank page or application crash.

### 7.1 Remote demo and tunnel boundary

- The frontend is exposed through a temporary HTTPS tunnel to the Vite server.
- The backend is exposed through a separate temporary HTTPS tunnel to the API.
- `VITE_API_URL` must point to the backend tunnel and include `/api`.
- `FRONTEND_ORIGIN` must exactly match the current frontend tunnel origin.
- Ollama remains reachable only from the backend host at its local URL.
- Only the frontend URL is shared with collaborators.
- The backend tunnel, Ollama endpoint, database URI, JWT secret, and PIN hashes
  must never be shared.
- Temporary tunnel URLs are bearer links: anyone who obtains the frontend URL
  can open the login page, so authentication and server-side authorization
  remain mandatory.

This boundary is suitable for a controlled demonstration, not a production
security perimeter. Production requires a named tunnel or hosted HTTPS
deployment, identity-aware access controls, managed secrets, monitoring,
backups, and a hardened database.

### 8. Future improvements

- OCR for image evidence.
- Case-level permissions.
- AI findings linked to source pages and passages.
- Digital signatures and signed evidence manifests.
- Append-only audit storage.
- Email or webhook notifications for integrity alerts.
- Chain-of-custody report export.
- File-signature validation and malware scanning.

### 9. Release acceptance criteria

The release is complete when:

- Configured users can authenticate successfully.
- Authorized users can upload supported evidence files.
- Hashes are generated, stored, and verified on access.
- Access requests and Administrator decisions work correctly.
- Legal Officers can view approved evidence in the controlled preview.
- Administrators can download authorized evidence.
- PDF and TXT AI analysis works through the configured model.
- Tampered evidence is marked, blocked, and audited.
- Backend syntax checks, frontend linting, and the production build pass.
- Local health checks pass for the frontend, backend, and Ollama.
- A remote browser can authenticate through the frontend tunnel and invoke the
  backend AI route without direct access to Ollama.
- Cross-origin preflight requests succeed only for the configured frontend
  origin.
- No `.env`, credential, tunnel log, `node_modules`, or build output is tracked.
