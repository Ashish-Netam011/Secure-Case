import { configDotenv } from "dotenv";

configDotenv();

const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";
// Hybrid AI, cloud-first: 1) Gemini cloud API (when GEMINI_API_KEY is set),
// 2) Ollama cloud models (suffixed ":cloud", reached through the local Ollama
// daemon, no separate key), 3) local Ollama model as the final fallback.
const cloudModel = process.env.AI_CLOUD_MODEL || "deepseek-v4-flash:cloud";
const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const requestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000);

const analysisSchema = {
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
        properties: {
          date: { type: "string" },
          event: { type: "string" },
        },
        required: ["date", "event"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          relationship: { type: "string" },
          support: { type: "string" },
        },
        required: ["relationship", "support"],
      },
    },
    followupEvidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          whyItMatters: { type: "string" },
        },
        required: ["item", "whyItMatters"],
      },
    },
  },
  required: ["summary", "classification", "confidence"],
};

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
    suspicious_points: { type: "ARRAY", items: { type: "STRING" } },
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

function buildPrompt(text) {
  return `
You are a digital-forensics evidence analyst. Return only valid JSON and use only the supplied evidence.

Use this shape:
{
  "summary": "string",
  "entities": { "persons": [], "organizations": [], "locations": [], "dates": [] },
  "suspicious_points": ["string"],
  "relationships": [{ "relationship": "string", "support": "string" }],
  "timeline": [{ "date": "string", "event": "string" }],
  "classification": "string",
  "confidence": 0.0,
  "followupEvidence": [{ "item": "string", "whyItMatters": "string" }]
}

Rules:
- Never invent facts, names, dates, locations, motives, relationships, or suspicious activity.
- Omit unsupported optional fields.
- Keep the summary concise and distinguish facts from inferences.
- Confidence must be a number from 0 to 1.

Evidence:
${text}
`;
}

async function callGemini(prompt) {
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  let response;
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
            maxOutputTokens: Number(process.env.GEMINI_NUM_PREDICT || 2048),
            responseMimeType: "application/json",
            responseSchema: geminiSchema,
          },
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`Gemini ${geminiModel} timed out after ${Math.round(requestTimeoutMs / 1000)}s.`);
    }
    throw new Error(`Gemini is unreachable: ${error.message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini returned HTTP ${response.status}.`);
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

  return { result: validateAnalysis(parsed, "Gemini"), model: geminiModel };
}

async function callOllama(model, prompt) {
  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: analysisSchema,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || "10m",
        options: {
          temperature: 0.1,
          num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 700),
        },
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED" || error.code === "ECONNREFUSED") {
      throw new Error("Ollama is unavailable. Start Ollama with `ollama serve` and try again.");
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`Ollama model ${model} timed out after ${Math.round(requestTimeoutMs / 1000)}s.`);
    }
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Ollama returned HTTP ${response.status} for ${model}.`);
  }

  if (typeof payload?.response !== "string" || !payload.response.trim()) {
    throw new Error(`Ollama model ${model} returned an empty analysis.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(payload.response));
  } catch {
    throw new Error(`Ollama model ${model} returned invalid analysis JSON.`);
  }

  return { result: validateAnalysis(parsed, `Ollama model ${model}`), model: payload.model || model };
}

export async function analyzeEvidence(text) {
  const promptStartedAt = performance.now();
  const prompt = buildPrompt(text);
  const promptConstructionMs = Math.round(performance.now() - promptStartedAt);

  const attempts = [];
  if (geminiApiKey) {
    attempts.push({ tier: "cloud", label: `gemini (${geminiModel})`, run: () => callGemini(prompt) });
  }
  attempts.push({ tier: "cloud", label: `ollama-cloud (${cloudModel})`, run: () => callOllama(cloudModel, prompt) });
  attempts.push({ tier: "local", label: `ollama-local (${ollamaModel})`, run: () => callOllama(ollamaModel, prompt) });

  const failures = [];
  const inferenceStartedAt = performance.now();

  for (const attempt of attempts) {
    try {
      const { result, model } = await attempt.run();
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      return {
        result,
        model,
        provider: attempt.tier,
        timings: {
          promptConstructionMs,
          inferenceMs,
        },
      };
    } catch (error) {
      failures.push(`${attempt.label}: ${error.message}`);
    }
  }

  const error = new Error(
    `Hybrid AI analysis failed on all providers. ${failures.join(" | ")}`,
  );
  error.failures = failures;
  throw error;
}
