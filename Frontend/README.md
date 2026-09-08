# SECURE CASE

Secure Case is a hackathon-ready prototype for digital evidence ingestion,
integrity verification, controlled access, AI-assisted analysis, PII
redaction, and audit visibility.

## Repository layout

- `Frontend/` - React/Vite frontend.
- `Backend/` - Express API, MongoDB persistence, and local Ollama integration.
- `PRD.md` - product requirements, security boundaries, and release criteria.

## Features

- Six-digit PIN login with bcrypt-backed role identities and short-lived JWTs.
- Role-based upload, view, download, delete, access-request, and audit controls.
- Server-side SHA-256 integrity verification before evidence is served.
- MongoDB-backed evidence metadata and binary storage.
- PDF/TXT text extraction and structured analysis through a local Ollama model.
- Controlled PDF preview, responsive phone upload flow, and audit activity.
- Helmet security headers, CORS allowlisting, request rate limits, and upload limits.

## Demo setup

The project has two processes:

- `Frontend`: React/Vite frontend on `http://localhost:5173`
- `Backend`: Express API on `http://localhost:5000` with MongoDB storage

### 1. Start the backend

Make sure MongoDB is running, then open a terminal:

```powershell
cd ..\Backend
npm install
npm start
```

The backend reads `Backend\.env`. For a fresh setup, copy
`Backend\.env.example` to `Backend\.env` and provide a MongoDB URI, JWT
secret, and bcrypt hashes for the three demo officer PINs.

### 2. Start the frontend

In a second terminal:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The login screen accepts the configured
six-digit demo PINs for the Investigating Officer, Legal Officer, and
Administrator roles. Use the Administrator role for the complete demo flow:
upload evidence, verify the SHA-256 digest, run analysis, and inspect the
audit log.

Before presenting, upload a small PDF, TXT, PNG, JPG, or WEBP file so the
evidence vault has a real artifact to show.

## Share with collaborators (temporary demo only)

The frontend and backend must each have a tunnel. Ollama stays private on the
host and is called only by the backend.

Start the backend and Ollama first:

```powershell
ollama serve
cd ..\Backend
npm run dev
```

Expose the backend from another terminal:

```powershell
cloudflared tunnel --url http://localhost:5000
```

Copy the backend `https://*.trycloudflare.com` URL into `Frontend\.env`:

```env
VITE_API_URL=https://<backend-tunnel>.trycloudflare.com/api
```

Start the frontend:

```powershell
cd ..\Frontend
npm run share
```

Expose the frontend from a separate terminal:

```powershell
npm run tunnel
```

Copy the frontend URL into `Backend\.env`:

```env
FRONTEND_ORIGIN=https://<frontend-tunnel>.trycloudflare.com
```

Before starting Vite through a tunnel, set the hostname (without `https://`) in
`Frontend\.env`:

```env
VITE_ALLOWED_HOST=<frontend-tunnel>.trycloudflare.com
```

Restart the backend and frontend after changing environment files. Share only
the frontend URL. Never share the backend tunnel, Ollama port, MongoDB URI, JWT
secret, PIN hashes, or `.env` files.

Cloudflare quick tunnels are public, temporary URLs: anyone who obtains the
frontend URL can reach the login page. Application data and API actions still
require a valid JWT and server-side role authorization. For real deployment,
use a named tunnel or hosted HTTPS services with identity access controls,
secret management, monitoring, backups, and a production database.

## Security notes

- Keep Ollama bound to the local machine; do not tunnel port `11434`.
- Use unique production PIN hashes and a random JWT secret of at least 32 characters.
- Keep `FRONTEND_ORIGIN` exact; do not use wildcard CORS in production.
- Treat uploaded evidence as sensitive data and use a private MongoDB deployment.
- Rotate any credential that has ever been exposed in terminal output, screenshots,
  chat, or source control.

## Validation

```powershell
npm run lint
npm run build
```
