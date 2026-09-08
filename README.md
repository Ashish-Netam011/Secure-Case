# Secure Case

Secure Case is a digital evidence management prototype with role-based
authorization, SHA-256 integrity verification, controlled evidence access,
audit visibility, and local Ollama-assisted review.

## Monorepo layout

- `Backend/` - Express API, MongoDB persistence, authentication, and Ollama integration.
- `Frontend/` - React/Vite frontend.
- `PRD.md` - product requirements and release acceptance criteria.

See [Frontend/README.md](Frontend/README.md) for setup, tunneling, and
validation instructions. Never commit `.env` files or real credentials.
