// ---------------------------------------------------------------------------
// Evidence integrity end-to-end tests.
//
// Requirement: three distinct states.
//   - INTACT                 : stored SHA-256 matches current bytes
//   - TAMPERED               : stored SHA-256 no longer matches current bytes
//   - INTEGRITY_UNAVAILABLE  : no stored hash / no bytes -> must NOT be TAMPERED
//
// The test is fully self-contained: it spawns a dedicated backend instance
// bound to an isolated database (secure-case-integrity-test) so the real
// `Secure-case` data on Atlas is never touched. All created evidence is
// deleted and the test database is dropped at the end.
//
// Run from the Backend directory:  node test-integrity.mjs
// ---------------------------------------------------------------------------
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Evidence from "./src/models/Evidence.js";

// The environment's default resolver intermittently refuses Atlas SRV queries.
// The spawned backend forces Google DNS via FORCE_DNS_SERVERS; the test process
// must use the same resolver so its direct mongoose connection behaves identically.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = __dirname;
const TEST_PORT = 5077;
const BASE = `http://localhost:${TEST_PORT}`;
const ORIGIN = "http://localhost:5173";
const TEST_DB_NAME = "secure-case-integrity-test";

const results = [];
let serverChild = null;
let adminToken = "";

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(52)} ${detail}`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// Minimal legal-doc text + valid PDF/PNG generators (repo convention).
// ---------------------------------------------------------------------------
function makeLegalText(targetChars) {
  const block =
    "On 12 March 2026, Investigating Officer Sharma recorded the statement of witness Ramesh Gupta regarding the fraudulent transfer of INR 4,50,000 from the account of Meridian Traders Pvt Ltd. " +
    "The cheque dated 08 March 2026 bearing number 445120 was issued against invoice INV-2026-0912 without authorization by the board of directors. ";
  let out = "";
  while (out.length < targetChars) out += block;
  return out.slice(0, targetChars);
}
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

function makePng() {
  // 16 bytes: PNG magic (8) + minimal IHDR header bytes (8).
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  ]);
}
// ---------------------------------------------------------------------------
// Test database derivation: same Atlas cluster, dedicated database name.
// ---------------------------------------------------------------------------
function loadMongoUriFromEnvFile() {
  const envPath = path.join(BACKEND_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Backend/.env not found. Copy .env.example to .env and set MONGO_URI before running this test.",
    );
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("MONGO_URI="));
  if (!line) throw new Error("MONGO_URI not found in Backend/.env");
  return line.slice("MONGO_URI=".length).trim().replace(/^["']|["']$/g, "");
}

function testDbUri(original) {
  const url = new URL(original);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}
// ---------------------------------------------------------------------------
// Dedicated backend instance on an isolated database.
// ---------------------------------------------------------------------------
async function startServer() {
  const originalUri = loadMongoUriFromEnvFile();
  const testUri = testDbUri(originalUri);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "secure-case-ig-"));

  // index.js calls configDotenv({ override: true }) from the process cwd, so
  // write a dedicated .env in a sandbox dir and spawn with that cwd. The real
  // Backend/.env (production Atlas database) is therefore never loaded.
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    [
      `MONGO_URI="${testUri}"`,
      `JWT_SECRET="integrity-test-secret-0123456789abcdef0123456789abcdef"`,
      `NODE_ENV=test`,
      `DEMO_LOGIN=1`,
      `PORT=${TEST_PORT}`,
      `FRONTEND_ORIGIN=${ORIGIN}`,
      `OLLAMA_URL=http://localhost:11434`,
      `FORCE_DNS_SERVERS=8.8.8.8,8.8.4.4`,
      "",
    ].join("\n"),
  );

  const child = spawn(process.execPath, [path.join(BACKEND_DIR, "src", "index.js")], {
    cwd: tempDir,
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverChild = child;

  let output = "";
  child.stdout.on("data", (d) => (output += d.toString()));
  child.stderr.on("data", (d) => (output += d.toString()));

  // Wait for the process to become healthy (MongoDB connected + listening).
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`spawned backend exited early (code ${child.exitCode}):\n${output}`);
    }
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return { testUri, tempDir };
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`backend did not become healthy within 60s:\n${output}`);
}

async function stopServer() {
  if (!serverChild) return;
  try {
    serverChild.kill();
    await Promise.race([
      new Promise((r) => serverChild.once("exit", () => r(true))),
      new Promise((r) => setTimeout(() => r(false), 3000)),
    ]);
  } catch {
    /* already gone */
  }
  serverChild = null;
}
// ---------------------------------------------------------------------------
// API helpers.
// ---------------------------------------------------------------------------
async function login(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ role }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${role} failed: ${res.status}`);
  return body.token;
}

async function upload(token, buffer, filename, mimetype, caseId = "CASE-INTEGRITY-TEST") {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimetype }), filename);
  form.append("caseId", caseId);
  form.append("title", filename);
  const res = await fetch(`${BASE}/api/evidence/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function listEvidence(token) {
  const res = await fetch(`${BASE}/api/evidence`, {
    headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function fetchContent(id, token) {
  const res = await fetch(`${BASE}/api/evidence/${id}/content`, {
    headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN },
  });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, body, isJson };
}

async function deleteEvidence(id, token) {
  await fetch(`${BASE}/api/evidence/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN },
  }).catch(() => {});
}

// Direct DB mutation (bypasses the API on purpose) to simulate tampering and a
// missing hash exactly as if the stored record itself had changed.
async function mutateEvidence(id, testUri, mutation) {
  await mongoose.connect(testUri);
  await Evidence.updateOne({ _id: id }, mutation);
}
// ---------------------------------------------------------------------------
// Test matrix.
// ---------------------------------------------------------------------------
async function main() {
  const { testUri, tempDir } = await startServer();
  const createdIds = [];

  try {
    adminToken = await login("Administrator");
    record("demo-login Administrator", true, "HTTP 200");

    // ---- T1: untouched TXT -> INTACT; canonical hash from original bytes; round-trip
    {
      const txt = Buffer.from(makeLegalText(1500), "utf8");
      const expectedHash = sha256(txt);
      const up = await upload(adminToken, txt, "statement.txt", "text/plain");
      if (up.status !== 201) {
        record("T1: upload untouched TXT", false, `HTTP ${up.status}`);
      } else {
        createdIds.push(up.body.data.id);
        const okHash = up.body.data.sha256 === expectedHash;
        const list = await listEvidence(adminToken);
        const item = list.body.data.find((e) => e._id === up.body.data.id);
        const okStatus = item?.integrityStatus === "INTACT";
        const okCurrent = item?.sha256Current === expectedHash;
        const content = await fetchContent(up.body.data.id, adminToken);
        const okRoundTrip = !content.isJson && content.status === 200 && Buffer.compare(content.body, txt) === 0;
        record("T1a: untouched TXT -> INTACT in list", okStatus, `integrityStatus=${item?.integrityStatus}`);
        record("T1b: canonical SHA-256 from original bytes", okHash, `sha256=${up.body.data.sha256?.slice(0, 12)}…`);
        record("T1c: content round-trip bytes identical", okRoundTrip, `HTTP ${content.status}`);
        record("T1d: sha256Current matches stored hash", okCurrent, `sha256Current=${item?.sha256Current?.slice(0, 12)}…`);
      }
    }

    // ---- T2: untouched PDF -> INTACT; binary preserved
    {
      const pdf = makePdf(makeLegalText(2000));
      const expectedHash = sha256(pdf);
      const up = await upload(adminToken, pdf, "report.pdf", "application/pdf");
      if (up.status !== 201) {
        record("T2: upload untouched PDF", false, `HTTP ${up.status}`);
      } else {
        createdIds.push(up.body.data.id);
        const list = await listEvidence(adminToken);
        const item = list.body.data.find((e) => e._id === up.body.data.id);
        const okStatus = item?.integrityStatus === "INTACT";
        const content = await fetchContent(up.body.data.id, adminToken);
        const okRoundTrip = !content.isJson && content.status === 200 && Buffer.compare(content.body, pdf) === 0;
        const okHash = up.body.data.sha256 === expectedHash;
        record("T2a: untouched PDF -> INTACT in list", okStatus, `integrityStatus=${item?.integrityStatus}`);
        record("T2b: PDF binary round-trip identical", okRoundTrip, `HTTP ${content.status}`);
        record("T2c: PDF canonical hash matches original bytes", okHash, `sha256=${up.body.data.sha256?.slice(0, 12)}…`);
      }
    }
// ---- T3: untouched image (PNG) -> INTACT; binary preserved
    {
      const png = makePng();
      const expectedHash = sha256(png);
      const up = await upload(adminToken, png, "scene.png", "image/png");
      if (up.status !== 201) {
        record("T3: upload untouched PNG", false, `HTTP ${up.status}`);
      } else {
        createdIds.push(up.body.data.id);
        const list = await listEvidence(adminToken);
        const item = list.body.data.find((e) => e._id === up.body.data.id);
        const okStatus = item?.integrityStatus === "INTACT";
        const content = await fetchContent(up.body.data.id, adminToken);
        const okRoundTrip = !content.isJson && content.status === 200 && Buffer.compare(content.body, png) === 0;
        const okHash = up.body.data.sha256 === expectedHash;
        record("T3a: untouched PNG -> INTACT in list", okStatus, `integrityStatus=${item?.integrityStatus}`);
        record("T3b: PNG binary round-trip identical", okRoundTrip, `HTTP ${content.status}`);
        record("T3c: PNG canonical hash matches original bytes", okHash, `sha256=${up.body.data.sha256?.slice(0, 12)}…`);
      }
    }

    // ---- T4: intentionally modified file -> TAMPERED (list + content 409)
    {
      const txt = Buffer.from("Original statement bytes, untouched at upload time.", "utf8");
      const up = await upload(adminToken, txt, "tampered.txt", "text/plain");
      if (up.status !== 201) {
        record("T4: upload file for tampering", false, `HTTP ${up.status}`);
      } else {
        createdIds.push(up.body.data.id);
        // Falsify the stored bytes without touching the stored hash.
        await mutateEvidence(up.body.data.id, testUri, {
          $set: { data: Buffer.from("Original statement bytes HAVE BEEN CHANGED after upload.", "utf8") },
        });
        const list = await listEvidence(adminToken);
        const item = list.body.data.find((e) => e._id === up.body.data.id);
        const okList = item?.integrityStatus === "TAMPERED";
        const content = await fetchContent(up.body.data.id, adminToken);
        const okContent = content.status === 409 && content.isJson && content.body?.code === "EVIDENCE_TAMPERED";
        record("T4a: modified bytes -> TAMPERED in list", okList, `integrityStatus=${item?.integrityStatus}`);
        record("T4b: modified bytes -> content blocked 409 EVIDENCE_TAMPERED", okContent, `HTTP ${content.status} code=${content.body?.code}`);
      }
    }

    // ---- T5: missing stored hash -> INTEGRITY_UNAVAILABLE (NOT TAMPERED)
    {
      const txt = Buffer.from("This record will lose its stored hash.", "utf8");
      const up = await upload(adminToken, txt, "no-hash.txt", "text/plain");
      if (up.status !== 201) {
        record("T5: upload file for hash removal", false, `HTTP ${up.status}`);
      } else {
        createdIds.push(up.body.data.id);
        await mutateEvidence(up.body.data.id, testUri, { $unset: { sha256: "" } });
        const list = await listEvidence(adminToken);
        const item = list.body.data.find((e) => e._id === up.body.data.id);
        const okList = item?.integrityStatus === "INTEGRITY_UNAVAILABLE";
        record("T5a: missing hash -> INTEGRITY_UNAVAILABLE", okList, `integrityStatus=${item?.integrityStatus}`);
        const content = await fetchContent(up.body.data.id, adminToken);
        const okContent =
          content.status === 423 && content.isJson && content.body?.code === "EVIDENCE_INTEGRITY_UNAVAILABLE";
        record("T5b: missing hash -> 423 EVIDENCE_INTEGRITY_UNAVAILABLE (not a tamper alert)", okContent, `HTTP ${content.status} code=${content.body?.code}`);
      }
    }

    // ---- T6: separate evidence versions verify against their own hash
    {
      const first = Buffer.from("Evidence version A bytes.", "utf8");
      const second = Buffer.from("Evidence version B bytes, semantically different.", "utf8");
      const upA = await upload(adminToken, first, "version-a.txt", "text/plain");
      const upB = await upload(adminToken, second, "version-b.txt", "text/plain");
      if (upA.status !== 201 || upB.status !== 201) {
        record("T6: upload two evidence versions", false, `A=${upA.status} B=${upB.status}`);
      } else {
        createdIds.push(upA.body.data.id, upB.body.data.id);
        const list = await listEvidence(adminToken);
        const itemA = list.body.data.find((e) => e._id === upA.body.data.id);
        const itemB = list.body.data.find((e) => e._id === upB.body.data.id);
        const okIds = upA.body.data.id !== upB.body.data.id;
        const okHashesDiffer = upA.body.data.sha256 !== upB.body.data.sha256;
        const okA = itemA?.integrityStatus === "INTACT" && itemA?.sha256 === upA.body.data.sha256;
        const okB = itemB?.integrityStatus === "INTACT" && itemB?.sha256 === upB.body.data.sha256;
        const contentA = await fetchContent(upA.body.data.id, adminToken);
        const contentB = await fetchContent(upB.body.data.id, adminToken);
        const okRoundTripA = !contentA.isJson && Buffer.compare(contentA.body, first) === 0;
        const okRoundTripB = !contentB.isJson && Buffer.compare(contentB.body, second) === 0;
        record("T6a: two versions have distinct evidence ids", okIds, `A=${upA.body.data.id} B=${upB.body.data.id}`);
        record("T6b: two versions have distinct stored hashes", okHashesDiffer, `A=${upA.body.data.sha256?.slice(0, 12)}… B=${upB.body.data.sha256?.slice(0, 12)}…`);
        record("T6c: version A verified against its own hash -> INTACT", okA, `integrityStatus=${itemA?.integrityStatus}`);
        record("T6d: version B verified against its own hash -> INTACT", okB, `integrityStatus=${itemB?.integrityStatus}`);
        record("T6e: version A / B content round-trip bytes distinct", okRoundTripA && okRoundTripB, `A=${contentA.status} B=${contentB.status}`);
      }
    }
  } finally {
    // Cleanup: remove created evidence, drop the dedicated test DB, kill server.
    for (const id of createdIds) await deleteEvidence(id, adminToken);
    await stopServer();
    try {
      await mongoose.connect(testUri);
      await mongoose.connection.db.dropDatabase();
    } catch {
      /* collection may already be empty */
    }
    await mongoose.disconnect().catch(() => {});
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log("\n--------------------------------------------");
  console.log(`Integrity tests: ${passed}/${results.length} passed`);
  if (results.some((r) => !r.pass)) {
    console.log("Failing checks:");
    for (const r of results.filter((r) => !r.pass)) console.log(`  - ${r.name}: ${r.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Test run failed:", error);
  process.exit(1);
});