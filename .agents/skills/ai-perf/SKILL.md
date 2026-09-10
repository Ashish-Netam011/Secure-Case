---
name: ai-perf
description: >
  Secure Case AI analysis latency: hybrid Gemini→Ollama architecture, measured
  latency bands, env knobs, [AI-PERF] verification, and the playbook for
  diagnosing slow or failed analyses. Use when AI analysis is slow, when
  touching Backend/services/aiService.js, or when tuning Render AI env vars.
---

# AI Analysis Performance (Secure Case)

AI analysis must land in the 3–5s band for normal text PDFs; 5–8s acceptable.
Provider latency is external; the code's job is fast first pass + working
failover, never parallel speculative calls.

## Architecture (do not break these invariants)

```
PDF (browser: PDF.js text) → redactPII → POST /api/ai/analyze
  → requireAuth → evidence authorization → SHA-256 check → cache / in-flight dedup
  → selectEvidenceText (full | head 40% + tail 40% + strided middle)
  → Gemini (JSON schema, 15s cap, one attempt - no same-provider retry;
     429/5xx/timeout fails over immediately)
      ├─ success → normalize → cache → audit → 200 (provider: gemini)
      └─ 429/5xx/timeout/invalid JSON
          → Ollama Cloud Nemotron (45s)
              ├─ success → same normalized JSON (provider: ollama-cloud)
              └─ fail → local Ollama (dev only) → else 503 graceful
```

Invariants:
- Fallbacks are sequential, never parallel.
- Both providers pass the same `validateAnalysis` — one response contract.
- Oversized docs get structured sampling (`selectEvidenceText`), never a blind cut.
- All-providers-down = HTTP 503 "AI analysis is temporarily unavailable.
  Evidence access is unaffected." + audit event. Evidence routes never depend
  on AI availability.

## Environment variables (Render, server-side only)

| Key | Value | Role |
|---|---|---|
| `GEMINI_API_KEY` | secret | Fast first pass. Required. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Measured ~10× faster than gemini-3.6-flash. Do not "upgrade" without benchmarking. |
| `AI_REQUEST_TIMEOUT_MS` | `15000` | First-pass cap; hung Gemini fails over instead of blocking. |
| `AI_ANALYSIS_VERSION` | `fast-v1` | Stored with each analysis; cached results are only served when versions match (bump to invalidate stale caches). |
| `OLLAMA_API_KEY` | secret | Cloud fallback. Without it, Gemini quota/5xx has nowhere to go. |
| `OLLAMA_MODEL` | `nemotron:cloud` | Fallback target. |
| `OLLAMA_BASE_URL` | `https://ollama.com` | HTTPS API, Bearer auth. |
| `OLLAMA_TIMEOUT_MS` | `45000` | Bounds fallback. |
| `OLLAMA_LOCAL` | `0` in prod | Critical: else orchestrator adds a localhost:11434 attempt that burns ~10s per full failover. |
| `GEMINI_NUM_PREDICT` / `OLLAMA_NUM_PREDICT` | 700 | Output token cap. Lower = faster reports. |
| `AI_FULL_TEXT_LIMIT` / `AI_TEXT_BUDGET` | 40000 / 80000 | Input selection: whole text up to the 80K budget; sampled above. The /api/ai/analyze route accepts up to 120K chars. |
| `OLLAMA_KEEP_ALIVE` | `10m` | Keeps fallback model warm. |
| `AI_PROVIDER` | unset (=hybrid) | `gemini` disables fallback entirely. |

## Measured bands (baseline for regressions)

| Scenario | Result |
|---|---|
| Small text PDF (2K chars) | ~3.0s (gemini, full) |
| ~48K chars text | 4.1–6.3s (gemini, full) |
| Cached second call | 0.8–1.0s (cached=true, provider preserved) |
| Gemini down → ollama-cloud | ~1.3s |
| Both down | ~1.1s clean 503 |
| PDF upload itself (500KB, Atlas network) | 8.9–11.4s — unrelated to AI, do not chase |

## Root-cause playbook when latency regresses

1. Read `[AI-PERF]` lines in Render logs first: `provider= model= strategy=
   prompt:Xms gemini:Xms fallback:Xms total:Xms chars:N->M`. The slow segment
   names the culprit.
2. `gemini:` high → wrong/saturated model. Probe candidate models directly;
   503 "high demand" = capacity-starved, switch model. Historical traps:
   gemini-3.6-flash 38.9s, gemini-2.0-flash 404 retired.
3. `fallback:` high on every request → `OLLAMA_LOCAL` not `0`, or dead
   endpoint in chain. No Ollama daemon exists on Render; localhost attempts
   are pure dead weight.
4. `strategy=sampled` on small docs → text budgets misconfigured.
5. Slow but not in Gemini/fallback segments → check cache misses: provider
   must persist in `evidence.aiAnalysis` (Mongoose strict mode strips unknown
   fields); Evidence schema uses `data: { select: false }` so cache-hit lookups
   skip the file buffer; integrity re-hash uses `+data`.
6. PDF parsing is client-side (PDF.js). Backend never touches PDF bytes during
   analysis — a RAG/pipeline rebuild will not fix analysis latency.

## Verification after any AI change

1. `GET /healthz` → `{"status":"ok"}`.
2. One fresh analysis → expect provider `gemini`, 3–6s.
3. Repeat same evidence → `cached=true`, ~1s, provider preserved.
4. Render logs show one `[AI-PERF]` line per attempt with sane segments.
5. Frontend shows provider chip (Gemini / Fallback cloud|local) and honest
   rotating status — no fake progress %.

Test utilities: `Backend/test-aiperf.mjs` (live perf), `Backend/test-ollama-mock.mjs`
(mock fallback). Local benchmarks ran on the dev server on :5000.

## Boundaries

- Never log API keys or raw evidence text.
- Never expose AI env values to the frontend; only provider label.
- Security surfaces (auth/audit/integrity) are out of scope for latency work —
  do not weaken them to save milliseconds.
