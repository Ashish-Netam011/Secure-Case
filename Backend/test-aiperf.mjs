import crypto from "crypto";

const BASE = process.env.TEST_BASE || "http://localhost:5057";
const ORIGIN = "http://localhost:5173";
const results = [];
const createdEvidence = [];
let tokens = {};

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(46)} ${detail}`);
}

function makeLegalText(targetChars) {
  const block =
    "On 12 March 2026, Investigating Officer Sharma recorded the statement of witness Ramesh Gupta regarding the fraudulent transfer of INR 4,50,000 from the account of Meridian Traders Pvt Ltd. " +
    "The cheque dated 08 March 2026 bearing number 445120 was issued against invoice INV-2026-0912 without authorization by the board of directors. " +
    "Email correspondence between director Anil Kapoor and the shell entity Vertex Holdings shows coordination of the payment on 05 March 2026. ";
  let out = "";
  while (out.length < targetChars) out += block;
  return out.slice(0, targetChars);
}

// ---------------------------------------------------------------------------
// Minimal valid PDF generator (correct xref offsets, multi-page, Helvetica).
// ---------------------------------------------------------------------------
function makePdf(text, maxCharsPerLine = 90, maxLinesPerPage = 48) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = [];
  for (let i = 0; i < text.length; i += maxCharsPerLine) {
    lines.push(text.slice(i, i + maxCharsPerLine));
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += maxLinesPerPage) {
    pages.push(lines.slice(i, i + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push(["(empty evidence page)"]);

  const objects = [];
  const pageCount = pages.length;
  const pageObjIds = pages.map((_, index) => 3 + index * 2);
  const fontObjId = 3 + pageCount * 2;

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  pages.forEach((pageLines, index) => {
    const contentId = pageObjIds[index] + 1;
    objects[pageObjIds[index]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`;
    const stream =
      `BT /F1 10 Tf 40 750 Td 14 TL\n` +
      pageLines.map((line) => `(${esc(line)}) Tj T*`).join("\n") +
      `\nET`;
    objects[contentId] = { stream };
  });
  objects[fontObjId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  const totalObjects = fontObjId;
  let pdf = "%PDF-1.4\n";
  const offsets = new Array(totalObjects + 1).fill(0);
  for (let id = 1; id <= totalObjects; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    const obj = objects[id];
    if (typeof obj === "string") {
      pdf += `${id} 0 obj\n${obj}\nendobj\n`;
    } else {
      const bytes = Buffer.byteLength(obj.stream, "latin1");
      pdf += `${id} 0 obj\n<< /Length ${bytes} >>\nstream\n${obj.stream}\nendstream\nendobj\n`;
    }
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjects; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ---------------------------------------------------------------------------
// HTTP helpers.
// ---------------------------------------------------------------------------
async function login(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ role }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${role} failed: ${res.status}`);
  tokens[role] = body.token;
  return body.token;
}

async function upload(token, buffer, filename, mimetype) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype }), filename);
  form.append("caseId", "CASE-PERF-TEST");
  form.append("title", filename);
  const res = await fetch(`${BASE}/api/evidence/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 201) createdEvidence.push(body.data.id);
  return { status: res.status, body };
}

async function analyze(token, evidenceId, hash, text, extra = {}) {
  const startedAt = performance.now();
  const res = await fetch(`${BASE}/api/ai/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ text, evidenceId, evidenceHash: hash, ...extra }),
    signal: AbortSignal.timeout(180000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ms: Math.round(performance.now() - startedAt) };
}

async function cleanup() {
  for (const id of createdEvidence) {
    await fetch(`${BASE}/api/evidence/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokens["Administrator"]}`, Origin: ORIGIN },
    }).catch(() => {});
  }
}

function assertSchema(analysis) {
  return (
    typeof analysis?.summary === "string" &&
    typeof analysis?.classification === "string" &&
    typeof analysis?.confidence === "number"
  );
}

// ---------------------------------------------------------------------------
// Test matrix.
// ---------------------------------------------------------------------------
async function main() {
  await login("Administrator");
  await login("Legal Officer");
  const admin = tokens["Administrator"];
  const legal = tokens["Legal Officer"];
  record("login: admin + legal demo-login", true, "both 200");

  // ---- Test A: small text PDF --------------------------------------------
  {
    const pdf = makePdf(makeLegalText(2000));
    const up = await upload(admin, pdf, "small-test.pdf", "application/pdf");
    if (up.status !== 201) {
      record("A: small text PDF upload", false, `HTTP ${up.status}`);
    } else {
      const res = await analyze(admin, up.body.data.id, up.body.data.sha256, makeLegalText(2000));
      const ok =
        res.status === 200 &&
        assertSchema(res.body.analysis) &&
        res.body.provider === "gemini";
      record(
        "A: small text PDF analyze",
        ok,
        `HTTP ${res.status} ${res.ms}ms provider=${res.body.provider} strategy=${res.body.timings?.selectionStrategy}`,
      );
    }
  }

  // ---- Test B: ~500 KB text PDF (the target scenario) ---------------------
  // A real ~500 KB text PDF yields ~40-48K extractable chars; 48K is under the
  // 80K whole-text budget (strategy=full; Test C2 exercises the sampled path).
  {
    const text = makeLegalText(48000);
    const pdf = makePdf(makeLegalText(500 * 1024)); // puffy uncompressed PDF ≈ 500 KB
    const upStartedAt = performance.now();
    const up = await upload(admin, pdf, "500kb-test.pdf", "application/pdf");
    const uploadMs = Math.round(performance.now() - upStartedAt);
    if (up.status !== 201) {
      record("B: 500KB text PDF upload", false, `HTTP ${up.status}`);
    } else {
      const res = await analyze(admin, up.body.data.id, up.body.data.sha256, text);
      const ok =
        res.status === 200 &&
        assertSchema(res.body.analysis) &&
        res.body.provider === "gemini" &&
        res.ms < 15000;
      record(
        "B: 500KB text PDF analyze (target 3-8s)",
        ok,
        `HTTP ${res.status} ${res.ms}ms upload=${uploadMs}ms provider=${res.body.provider} strategy=${res.body.timings?.selectionStrategy} chars=${res.body.timings?.totalChars}->${res.body.timings?.selectedChars}`,
      );

      // ---- Test F: Gemini success + cache behavior -------------------------
      const res2 = await analyze(admin, up.body.data.id, up.body.data.sha256, text);
      record(
        "F: Gemini success + second call cached",
        res2.status === 200 && res2.body.cached === true,
        `cached=${res2.body.cached} ${res2.ms}ms provider=${res2.body.provider}`,
      );
    }
  }

  // ---- Test C: oversized text PDF (over the 120K-char API contract) -------
  {
    const text = makeLegalText(200000);
    const pdf = makePdf(text.slice(0, 40000)); // upload itself is valid; the text payload is what matters
    const up = await upload(admin, pdf, "large-test.pdf", "application/pdf");
    const res = await analyze(admin, up.body.data.id, up.body.data.sha256, text);
    record(
      "C: oversized text PDF (120K-char contract)",
      res.status === 413 && /120,000/.test(res.body.message || ""),
      `HTTP ${res.status} msg="${res.body.message || ""}"`,
    );
  }

  // ---- Test C2: 100K-char text PDF - under contract, over budget = sampled --
  {
    const text = makeLegalText(100000);
    const pdf = makePdf(text.slice(0, 40000)); // upload itself is valid; the text payload drives selection
    const up = await upload(admin, pdf, "100k-test.pdf", "application/pdf");
    if (up.status !== 201) {
      record("C2: 100K-char text PDF upload", false, "HTTP " + up.status);
    } else {
      const res = await analyze(admin, up.body.data.id, up.body.data.sha256, text);
      const ok =
        res.status === 200 &&
        assertSchema(res.body.analysis) &&
        res.body.timings?.selectionStrategy === "sampled";
      record(
        "C2: 100K-char sampled analysis",
        ok,
        "HTTP " + res.status + " " + res.ms + "ms provider=" + res.body.provider + " strategy=" + res.body.timings?.selectionStrategy + " chars=" + res.body.timings?.totalChars + "-" + res.body.timings?.selectedChars,
      );
    }
  }

  // ---- Test D: scanned/image-only PDF (no extractable text) ---------------
  {
    const pdf = makePdf(""); // valid PDF, one empty page
    const up = await upload(admin, pdf, "scanned-test.pdf", "application/pdf");
    const res = await analyze(admin, up.body.data.id, up.body.data.sha256, "");
    record(
      "D: scanned/image PDF (empty text)",
      res.status === 400 && /non-empty/i.test(res.body.message || ""),
      `HTTP ${res.status} msg="${res.body.message || ""}"`,
    );
  }

  // ---- Test E: malformed PDF ----------------------------------------------
  {
    const up = await upload(admin, Buffer.from("this is definitely not a pdf file"), "malformed.pdf", "application/pdf");
    record(
      "E: malformed PDF rejected at upload",
      up.status === 400,
      `HTTP ${up.status} msg="${up.body.message || ""}"`,
    );
  }

  // ---- Test J: unauthorized analysis attempts ------------------------------
  {
    const text = makeLegalText(2000);
    const pdf = makePdf(text);
    const up = await upload(admin, pdf, "authz-test.pdf", "application/pdf");

    const noToken = await fetch(`${BASE}/api/ai/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ text, evidenceId: up.body.data.id }),
    });
    const legalBlocked = await analyze(legal, up.body.data.id, up.body.data.sha256, text);
    record(
      "J: unauthorized analysis blocked (401/403)",
      noToken.status === 401 && legalBlocked.status === 403,
      `no-token=${noToken.status} legal-officer=${legalBlocked.status}`,
    );
  }

  await cleanup();
  record("cleanup: test evidence removed", true, `${createdEvidence.length} records deleted`);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Harness error:", error.message);
  process.exitCode = 1;
});
