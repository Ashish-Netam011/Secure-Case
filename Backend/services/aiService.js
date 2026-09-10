import { configDotenv } from "dotenv";

configDotenv();

// ---------------------------------------------------------------------------
// Provider configuration (all overridable via environment; secrets stay
// server-side and are never logged).
// ---------------------------------------------------------------------------
const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
// Fast first-pass model. gemini-3.5-flash-lite measured 3.4s on a ~24K-char
// legal payload with valid schema JSON; gemini-3.6-flash measured 38.9s+.
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// Gemini first-pass must feel fast; overloaded-model 503s fail over instead of hanging.
const geminiTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 15000);

// Ollama Cloud (Nemotron) fallback — reached through its HTTPS API. The Ollama
// daemon is NOT installed on the Render server; local mode is dev-only.
const ollamaApiKey = (process.env.OLLAMA_API_KEY || "").trim();
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "https://ollama.com").replace(/\/+$/, "");
const ollamaModel = process.env.OLLAMA_MODEL || "nemotron:cloud";
const ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
// Local Ollama daemon (http://localhost:11434) for development only.
const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
const ollamaLocalEnabled = process.env.OLLAMA_LOCAL !== "0";
const ollamaLocalModel = process.env.OLLAMA_LOCAL_MODEL || "qwen2.5:3b";

const AI_PROVIDER = (process.env.AI_PROVIDER || "hybrid").toLowerCase();

// Input selection bounds (characters). Small docs go whole; larger docs are
// sampled intelligently instead of blindly truncated.
const FULL_TEXT_LIMIT = Number(process.env.AI_FULL_TEXT_LIMIT || 40000);
const SAMPLED_TEXT_BUDGET = Number(process.env.AI_TEXT_BUDGET || 80000);

// Hard cap on generated tokens: a first-pass report is short by design.
const GEMINI_NUM_PREDICT = Number(process.env.GEMINI_NUM_PREDICT || 700);
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 700);

// ---------------------------------------------------------------------------
// Response contract (shared by every provider — normalized once, below).
// ---------------------------------------------------------------------------
const geminiSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    classification: { type: "STRING" },
    confidence: { type: "NUMBER" },
    entities: {
      type: "OBJECT",
      properties: {
        persons: { type: "ARRAY", items: { type: "STRING" } },
        organizations: { type: "ARRAY", items: { type: "STRING" } },
        locations: { type: "ARRAY", items: { type: "STRING" } },
        dates: { type: "ARRAY", items: { type: "STRING" } },
      },
    },
    timeline: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { date: { type: "STRING" }, event: { type: "STRING" } },
        required: ["date", "event"],
      },
    },
    relationships: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { relationship: { type: "STRING" }, support: { type: "STRING" } },
        required: ["relationship", "support"],
      },
    },
    followupEvidence: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { item: { type: "STRING" }, whyItMatters: { type: "STRING" } },
        required: ["item", "whyItMatters"],
      },
    },
  },
  required: ["summary", "classification", "confidence"],
};

// JSON-schema `format` for Ollama (same contract as the Gemini schema).
const ollamaFormat = {
  type: "object",
  properties: {
    summary: { type: "string" },
    classification: { type: "string" },
    confidence: { type: "number" },
    entities: {
      type: "object",
      properties: {
        persons: { type: "array", items: { type: "string" } },
        organizations: { type: "array", items: { type: "string" } },
        locations: { type: "array", items: { type: "string" } },
        dates: { type: "array", items: { type: "string" } },
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: { date: { type: "string" }, event: { type: "string" } },
        required: ["date", "event"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: { relationship: { type: "string" }, support: { type: "string" } },
        required: ["relationship", "support"],
      },
    },
    followupEvidence: {
      type: "array",
      items: {
        type: "object",
        properties: { item: { type: "string" }, whyItMatters: { type: "string" } },
        required: ["item", "whyItMatters"],
      },
    },
  },
  required: ["summary", "classification", "confidence"],
};

// ---------------------------------------------------------------------------
// Compact prompt: no chain-of-thought, no essays, structured JSON only.
// ---------------------------------------------------------------------------
function buildPrompt(text) {
  return `Analyze the supplied evidence for a legal/investigative case.

Return ONLY valid JSON.

Required:
- summary: maximum 3 sentences
- classification: evidence category
- confidence: number 0-1
- entities: { "persons": [], "organizations": [], "locations": [], "dates": [] } - only meaningful entities
- relationships: [{ "relationship": "string", "support": "string" }] - only meaningful relationships
- timeline: [{ "date": "string", "event": "string" }] - only important events
- followupEvidence: [{ "item": "string", "whyItMatters": "string" }] - only useful follow-up

Only include information directly supported by the evidence. Do not invent facts. Keep every list short and concise; no explanations.`;
}

// ---------------------------------------------------------------------------
// Intelligent text selection: full text for normal documents, structured
// head/tail/stride sampling for oversized ones. Never a blind cut.
// ---------------------------------------------------------------------------
export function selectEvidenceText(text) {
  const total = text.length;
  // Whole text fits comfortably in the model context budget: send it intact.
  if (total <= SAMPLED_TEXT_BUDGET) {
    return { text, strategy: "full", totalChars: total, selectedChars: total };
  }

  // Oversized: structured head/tail/stride sampling — never a blind cut.
  const headShare = Math.floor(SAMPLED_TEXT_BUDGET * 0.4);
  const tailShare = Math.floor(SAMPLED_TEXT_BUDGET * 0.4);
  const midBudget = SAMPLED_TEXT_BUDGET - headShare - tailShare;

  const head = text.slice(0, headShare);
  const tail = text.slice(total - tailShare);

  const middle = text.slice(headShare, total - tailShare);
  const stride = Math.max(1, Math.floor(middle.length / Math.max(1, Math.floor(midBudget / 400))));
  const slices = [];
  for (let i = 0; i < middle.length && slices.length < 200; i += stride) {
    slices.push(middle.slice(i, i + 400));
  }
  const sampledMiddle = slices.join("\n[…]\n");

  const combined = `${head}\n[… middle portion condensed …]\n${sampledMiddle}\n[…]\n${tail}`;
  return {
    text: combined,
    strategy: "sampled",
    totalChars: total,
    selectedChars: combined.length,
  };
}

// ---------------------------------------------------------------------------
// Parsing + validation (normalization layer shared by all providers).
// ---------------------------------------------------------------------------
function extractJson(value) {
  const cleaned = value.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

function removeEmptyValues(value) {
  if (Array.isArray(value)) {
    const items = value.map(removeEmptyValues).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, nestedValue]) => [key, removeEmptyValues(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return value === "" || value === null || value === undefined ? undefined : value;
}

function validateAnalysis(result, sourceLabel) {
  if (!result || Array.isArray(result) || typeof result !== "object") {
    throw new Error(`${sourceLabel} returned an invalid analysis object.`);
  }

  const cleaned = removeEmptyValues(result) || {};
  if (
    typeof cleaned.summary !== "string" ||
    typeof cleaned.classification !== "string" ||
    typeof cleaned.confidence !== "number"
  ) {
    throw new Error(`${sourceLabel} analysis is missing required fields.`);
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Error classification: which failures justify failing over to the next
// provider? Provider quota/availability problems and unusable model output
// both do; we never retry the same provider in a loop.
// ---------------------------------------------------------------------------
export function isProviderFailure(error) {
  const message = String(error?.message || "");
  const providerStatus = Number(error?.providerStatus || 0);
  return (
    providerStatus === 429 ||
    providerStatus >= 500 ||
    /timed out|unreachable|ECONN|ENOTFOUND|ETLS|high demand|invalid analysis JSON|missing required fields|invalid analysis object|empty analysis/i.test(
      message,
    )
  );
}

function classifyHttpError(provider, status, payload) {
  const error = new Error(
    payload?.error?.message || `${provider} returned HTTP ${status}.`,
  );
  error.providerStatus = status;
  return error;
}

// ---------------------------------------------------------------------------
// Gemini (primary).
// ---------------------------------------------------------------------------
async function callGemini(prompt) {
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  let response;
  const attemptStartedAt = performance.now();
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: GEMINI_NUM_PREDICT,
            responseMimeType: "application/json",
            responseSchema: geminiSchema,
          },
        }),
        signal: AbortSignal.timeout(geminiTimeoutMs),
      },
    );
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`Gemini ${geminiModel} timed out after ${Math.round(geminiTimeoutMs / 1000)}s.`);
    }
    throw new Error(`Gemini is unreachable: ${error.message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw classifyHttpError("Gemini", response.status, payload);
  }

  const responseText =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("") || "";

  if (!responseText.trim()) {
    throw new Error("Gemini returned an empty analysis.");
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(responseText));
  } catch {
    throw new Error("Gemini returned invalid analysis JSON.");
  }

  const result = validateAnalysis(parsed, "Gemini");
  return {
    result,
    model: geminiModel,
    provider: "gemini",
    attemptMs: Math.round(performance.now() - attemptStartedAt),
  };
}

// ---------------------------------------------------------------------------
// Ollama family (Nemotron cloud fallback; local daemon for dev).
// ---------------------------------------------------------------------------
async function callOllamaEndpoint({ label, url, model, prompt, apiKey, timeoutMs }) {
  let response;
  const attemptStartedAt = performance.now();
  try {
    response = await fetch(`${url}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: ollamaFormat,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || "10m",
        options: {
          temperature: 0.1,
          num_predict: OLLAMA_NUM_PREDICT,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED" || error.code === "ECONNREFUSED") {
      throw new Error(`${label} is unavailable (connection refused).`);
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`${label} model ${model} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw new Error(`${label} is unreachable: ${error.message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw classifyHttpError(label, response.status, payload);
  }

  if (typeof payload?.response !== "string" || !payload.response.trim()) {
    throw new Error(`${label} model ${model} returned an empty analysis.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(payload.response));
  } catch {
    throw new Error(`${label} model ${model} returned invalid analysis JSON.`);
  }

  const result = validateAnalysis(parsed, label);
  return {
    result,
    model: payload.model || model,
    provider: label,
    attemptMs: Math.round(performance.now() - attemptStartedAt),
  };
}

// ---------------------------------------------------------------------------
// Orchestrator: Gemini first; fallback only on provider failure.
// AI_PROVIDER=gemini skips fallbacks entirely; anything else runs hybrid.
// ---------------------------------------------------------------------------
export async function analyzeEvidence(text) {
  const totalStartedAt = performance.now();
  const timings = {};

  const selectionStartedAt = performance.now();
  const selection = selectEvidenceText(text);
  timings.selectionMs = Math.round(performance.now() - selectionStartedAt);
  timings.selectionStrategy = selection.strategy;
  timings.totalChars = selection.totalChars;
  timings.selectedChars = selection.selectedChars;

  const promptStartedAt = performance.now();
  const prompt = `${buildPrompt("")}\n\nEvidence:\n${selection.text}`;
  timings.promptMs = Math.round(performance.now() - promptStartedAt);

  const attempts = [];
  if (geminiApiKey) {
    attempts.push({
      label: "gemini",
      run: () => callGemini(prompt),
    });
  }

  if (AI_PROVIDER !== "gemini") {
    if (ollamaApiKey) {
      attempts.push({
        label: "ollama-cloud",
        run: () =>
          callOllamaEndpoint({
            label: "ollama-cloud",
            url: ollamaBaseUrl,
            model: ollamaModel,
            prompt,
            apiKey: ollamaApiKey,
            timeoutMs: ollamaTimeoutMs,
          }),
      });
    }
    if (ollamaLocalEnabled) {
      attempts.push({
        label: "ollama-local",
        run: () =>
          callOllamaEndpoint({
            label: "ollama-local",
            url: ollamaUrl,
            model: ollamaLocalModel,
            prompt,
            apiKey: "",
            timeoutMs: 10000,
          }),
      });
    }
  }

  if (!attempts.length) {
    throw new Error("No AI provider is configured (GEMINI_API_KEY / OLLAMA_API_KEY missing).");
  }

  const failures = [];
  let fallbackMs = 0;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const attemptStartedAt = performance.now();
    try {
      const outcome = await attempt.run();
      if (index > 0) {
        fallbackMs += Math.round(performance.now() - attemptStartedAt);
      }

      const totalMs = Math.round(performance.now() - totalStartedAt);
      timings.geminiMs = index === 0 ? outcome.attemptMs : 0;
      timings.fallbackMs = fallbackMs;
      timings.totalMs = totalMs;

      console.info(
        `[AI-PERF] provider=${outcome.provider} model=${outcome.model} strategy=${selection.strategy} ` +
          `prompt:${timings.promptMs}ms gemini:${timings.geminiMs}ms fallback:${fallbackMs}ms total:${totalMs}ms ` +
          `chars:${selection.totalChars}->${selection.selectedChars}`,
      );

      return {
        result: outcome.result,
        model: outcome.model,
        provider: outcome.provider,
        timings,
      };
    } catch (error) {
      if (index > 0) {
        fallbackMs += Math.round(performance.now() - attemptStartedAt);
      }
      failures.push(`${attempt.label}: ${error.message}`);
      // Only keep waiting on providers when the failure is the provider's
      // (quota/availability/timeout). Anything else still fails over, but the
      // classification is what keeps this from retrying endlessly.
      if (!isProviderFailure(error) && index === attempts.length - 1) {
        break;
      }
    }
  }

  const error = new Error(`AI analysis failed on all providers. ${failures.join(" | ")}`);
  error.failures = failures;
  throw error;
}
