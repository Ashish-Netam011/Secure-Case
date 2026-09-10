# Project Skills

Agent skills live here, vendored into the repo so every checkout gets the same
behavior with no global installs.

## caveman

Source: https://github.com/JuliusBrussee/caveman (MIT) — vendored 2026-09-10.

Ultra-compressed reply style: drops filler, keeps all technical substance
(code, commands, error strings stay verbatim). Cuts output tokens ~65% in the
upstream benchmarks. Level defaults to `full`; say "stop caveman" or "normal
mode" to revert.

Activate by asking for: `/caveman`, "caveman mode", "talk like caveman",
"be brief", or "less tokens".

License: MIT — https://github.com/JuliusBrussee/caveman/blob/main/LICENSE

## ai-perf

Project-native skill (written 2026-09-10 from the AI analysis latency
optimization report).

Secure Case hybrid AI tier: Gemini fast first pass → Ollama Cloud fallback.
Captures the architecture invariants, the measured 3–5s latency bands, all
Render env knobs, `[AI-PERF]` log verification, and the root-cause playbook
for slow or failed analyses. Loads automatically when working on
`Backend/services/aiService.js` or tuning AI env vars.
