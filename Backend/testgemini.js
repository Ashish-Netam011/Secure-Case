import { analyzeEvidence } from "./services/aiService.js";

try {
  console.log("Connecting to Gemini...");
  const start = Date.now();
  const first = await analyzeEvidence(
    "The evidence was submitted on 2026-01-15 by Officer Lee.",
  );
  const second = await analyzeEvidence(
    "The evidence was submitted on 2026-01-15 by Officer Lee.",
  );

  console.log("\nGemini response:");
  console.log(second.result);
  console.log(`\nResponse time: ${Date.now() - start} ms`);
  console.log(`Gemini API is working with ${second.model}!`);
  console.log("First request timings:", first.timings);
  console.log("Second request timings:", second.timings);
} catch (error) {
  console.error("\nGemini error:", error.message);
  process.exitCode = 1;
}
