
import dns from "dns";

if (process.env.FORCE_DNS_SERVERS) {
  const servers = process.env.FORCE_DNS_SERVERS.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length) {
    dns.setServers(servers);
  }
}

import { configDotenv } from "dotenv";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";

import connectDB from "./db/db.js";
import AccessRequest from "./models/AccessRequest.js";
import AuditEvent from "./models/AuditEvent.js";
import Evidence from "./models/Evidence.js";
import { analyzeEvidence } from "../services/aiService.js";
import { authenticatePin, requireAuth, requireRole, signUser } from "./middleware/auth.js";

configDotenv({ override: true });

if (process.env.FORCE_DNS_SERVERS) {
  const servers = process.env.FORCE_DNS_SERVERS.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length) {
    dns.setServers(servers);
  }
}

if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN must be configured in production.");
}

const app = express();
const inFlightAnalyses = new Map();

app.set("trust proxy", 1);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 3).toString("latin1") === "IDS" || buffer.subarray(0, 4).toString("hex") === "49492a00") return "image/tiff";
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

app.use(helmet());
const allowedOrigins = new Set([
  (process.env.FRONTEND_ORIGIN || "http://localhost:5173").trim(),
  "http://127.0.0.1:5173",
]);
const corsOptions = {
  origin: (origin, callback) => {
    const localViteOrigin = /^http:\/\/(localhost|127\.0\.0\.1):517\d$/;
    const isDevelopmentOrigin = process.env.NODE_ENV !== "production" && localViteOrigin.test(origin || "");
    callback(null, !origin || allowedOrigins.has(origin) || isDevelopmentOrigin);
  },
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
  const pin = typeof req.body?.pin === "string" ? req.body.pin : "";
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ success: false, message: "A six-digit PIN is required." });
  }

  const user = await authenticatePin(pin);
  if (!user) return res.status(401).json({ success: false, message: "Invalid security PIN." });

  const { pinHash, ...publicUser } = user;
  return res.json({ success: true, token: signUser(publicUser), user: publicUser });
});

app.use("/api", requireAuth);

function isAdmin(req) {
  return req.user?.role === "Administrator";
}

function recordAudit(event) {
  return AuditEvent.create(event);
}

function getEvidenceHash(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data?.buffer || data);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function verifyEvidenceIntegrity(evidence, req) {
  const currentHash = getEvidenceHash(evidence.data);
  if (currentHash === evidence.sha256) return true;

  await recordAudit({
    action: "Evidence tamper detected",
    status: "ALERT",
    officerId: req.user?.id,
    evidence: evidence._id,
    reason: `Stored hash ${evidence.sha256} does not match current hash ${currentHash}.`,
  });
  return false;
}

async function getAuthorizedEvidence(id, req) {
  const evidence = await Evidence.findById(id);
  if (!evidence) return { error: { status: 404, message: "Evidence not found." } };

  const requesterId = req.user.id;
  const requesterRole = req.user.role;
  const administrator = requesterRole === "Administrator" || requesterRole === "Admin";
  const owner = requesterId && requesterId === evidence.uploadedBy;
  const approved = await AccessRequest.exists({
    evidence: evidence._id,
    officerId: requesterId,
    status: "APPROVED",
  });

  if (!administrator && !owner && !approved) {
    return { error: { status: 403, message: "Access must be approved by an administrator first." } };
  }

  return { evidence };
}

app.post("/api/evidence/upload", requireRole("Administrator", "Investigating Officer"), upload.single("file"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No evidence file was provided.",
    });
  }

  try {
    const detectedType = detectFileType(req.file.buffer);
    const isPlainText = /^text\/plain($|;)/.test(req.file.mimetype) && !req.file.buffer.subarray(0, 512).includes(0);

    if (!ALLOWED_MIME_TYPES.has(req.file.mimetype) || (!detectedType && !isPlainText)) {
      return res.status(400).json({
        success: false,
        message: "File content does not match a supported evidence type (PDF, TXT, PNG, JPG, WEBP).",
      });
    }

    const evidence = await Evidence.create({
      caseId: req.body.caseId || "UNASSIGNED",
      title: req.body.title || req.file.originalname,
      category: req.body.category || "Evidence Document",
      uploadedBy: req.user.id,
      uploadedByRole: req.user.role,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      sha256: getEvidenceHash(req.file.buffer),
      data: req.file.buffer,
    });

    await recordAudit({
      action: "Evidence uploaded",
      status: "VERIFIED",
      officerId: evidence.uploadedBy,
      evidence: evidence._id,
    });

    res.status(201).json({
      success: true,
      data: {
        id: evidence._id,
        filename: evidence.filename,
        mimetype: evidence.mimetype,
        size: evidence.size,
        sha256: evidence.sha256,
        caseId: evidence.caseId,
        title: evidence.title,
        category: evidence.category,
        uploadedBy: evidence.uploadedBy,
        uploadedByRole: evidence.uploadedByRole,
        uploadedAt: evidence.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/analyze", async (req, res, next) => {
  const requestStartedAt = performance.now();
  const text =
    typeof req.body?.text === "string"
      ? req.body.text.trim()
      : "";

  if (!text) {
    return res.status(400).json({
      success: false,
      message: "A non-empty text value is required.",
    });
  }

  if (text.length > 50000) {
    return res.status(413).json({
      success: false,
      message: "Text must be 50,000 characters or fewer.",
    });
  }

  try {
    const evidenceId = req.body?.evidenceId;
    if (!evidenceId) {
      return res.status(400).json({ success: false, message: "A document ID is required for AI analysis." });
    }

    const authorization = await getAuthorizedEvidence(evidenceId, req);
    if (authorization.error) {
      return res.status(authorization.error.status).json({ success: false, message: authorization.error.message });
    }

    const lookupStartedAt = performance.now();
    const evidenceHash = req.body?.evidenceHash;
    const evidence = authorization.evidence;
    if (evidenceHash && evidenceHash !== evidence.sha256) {
      return res.status(400).json({ success: false, message: "Evidence integrity verification failed." });
    }
    const mongoLookupMs = Math.round(performance.now() - lookupStartedAt);

    if (evidence?.aiAnalysis?.analysis) {
      return res.json({
        success: true,
        analysis: evidence.aiAnalysis.analysis,
        model: evidence.aiAnalysis.model,
        cached: true,
        responseTime: `${Math.round(performance.now() - requestStartedAt)} ms`,
        timings: { mongoLookupMs, totalRequestMs: Math.round(performance.now() - requestStartedAt) },
      });
    }

    const analysisKey = evidence._id.toString();
    if (inFlightAnalyses.has(analysisKey)) {
      const { analysis, model } = await inFlightAnalyses.get(analysisKey);
      return res.json({
        success: true,
        analysis,
        model,
        cached: false,
        deduplicated: true,
        responseTime: `${Math.round(performance.now() - requestStartedAt)} ms`,
      });
    }

    const analysisPromise = (async () => {
      const analysisResult = await analyzeEvidence(text);
      await Evidence.updateOne(
        { _id: evidence._id },
        { $set: { aiAnalysis: { analysis: analysisResult.result, model: analysisResult.model, analyzedAt: new Date() } } },
      );
      return analysisResult;
    })();
    inFlightAnalyses.set(analysisKey, analysisPromise);

    let analysisOutcome;
    try {
      analysisOutcome = await analysisPromise;
    } finally {
      inFlightAnalyses.delete(analysisKey);
    }

    const { result, model, provider, timings } = analysisOutcome;
    const mongoStoreMs = 0;

    const responseTime = Math.round(performance.now() - requestStartedAt);

    await recordAudit({
      action: "AI analysis completed",
      status: "AUTHORIZED",
      officerId: req.user.id,
      evidence: evidence._id,
      reason: `Model ${model} (${provider} tier).`,
    });

    return res.json({
      success: true,
      analysis: result,
      model,
      provider,
      cached: false,
      responseTime: `${responseTime} ms`,
      timings: { ...timings, mongoLookupMs, mongoStoreMs, totalRequestMs: responseTime },
    });

  } catch (error) {
    if (req.body?.evidenceId) {
      inFlightAnalyses.delete(String(req.body.evidenceId));
    }

    try {
      await recordAudit({
        action: "AI analysis failed",
        status: "ERROR",
        officerId: req.user?.id,
        evidence: req.body?.evidenceId || undefined,
        reason: error.message || "Unknown AI failure.",
      });
    } catch {
      // Audit failures must not mask the AI error response.
    }

    return res.status(502).json({
      success: false,
      message: error.message || "Ollama analysis failed.",
    });
  }
});

app.get("/api/evidence", async (req, res, next) => {
  try {
    const evidence = await Evidence.find()
      .sort({ createdAt: -1 })
      .lean();
    const data = evidence.map((item) => {
      const { data: fileData, ...metadata } = item;
      return {
        ...metadata,
        integrityStatus: fileData && getEvidenceHash(fileData) === item.sha256 ? "VERIFIED" : "TAMPERED",
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/evidence/:id/access-requests", async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: "A reason is required." });
    }

    const evidence = await Evidence.findById(req.params.id).select("_id");
    if (!evidence) {
      return res.status(404).json({ success: false, message: "Evidence not found." });
    }

    const existing = await AccessRequest.findOne({ evidence: evidence._id, officerId: req.user.id, status: "PENDING" });
    if (existing) {
      return res.status(409).json({ success: false, message: "You already have a pending request for this evidence." });
    }

    const request = await AccessRequest.create({
      evidence: evidence._id,
      officerId: req.user.id,
      officerRole: req.user.role,
      reason: reason.trim(),
    });
    await recordAudit({
      action: "Evidence access requested",
      status: "PENDING",
      officerId: req.user.id,
      evidence: evidence._id,
      request: request._id,
      reason: reason.trim(),
    });
    res.status(201).json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

app.get("/api/access-requests", async (req, res, next) => {
  try {
    const filter = isAdmin(req) ? {} : { officerId: req.user.id };
    const requests = await AccessRequest.find(filter)
      .populate("evidence", "filename caseId title category size mimetype createdAt uploadedBy")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/access-requests/:id", async (req, res, next) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Only administrators can review access requests." });
    }

    const { status } = req.body;
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Decision must be APPROVED or REJECTED." });
    }

    const request = await AccessRequest.findByIdAndUpdate(
      req.params.id,
      { status, reviewedBy: req.user.id, reviewedAt: new Date() },
      { new: true },
    ).populate("evidence", "filename caseId title");

    if (!request) {
      return res.status(404).json({ success: false, message: "Access request not found." });
    }
    await recordAudit({
      action: `Evidence access ${status.toLowerCase()}`,
      status,
      officerId: request.officerId,
      adminId: req.user.id,
      evidence: request.evidence?._id || request.evidence,
      request: request._id,
      reason: request.reason,
    });
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

app.get("/api/evidence/:id/content", async (req, res, next) => {
  try {
    const authorization = await getAuthorizedEvidence(req.params.id, req);
    if (authorization.error) return res.status(authorization.error.status).json({ success: false, message: authorization.error.message });
    const { evidence } = authorization;
    if (!(await verifyEvidenceIntegrity(evidence, req))) {
      return res.status(409).json({ success: false, code: "EVIDENCE_TAMPERED", message: "TAMPER ALERT: Evidence integrity verification failed. Access has been blocked." });
    }
    const administrator = req.user.role === "Administrator";

    res.set("Content-Type", evidence.mimetype);
    const safeFilename = evidence.filename.replace(/[\r\n"]/g, "");
    res.set("Content-Disposition", `inline; filename="${safeFilename}"`);
    await recordAudit({
      action: "Evidence accessed",
      status: "AUTHORIZED",
      officerId: administrator ? undefined : req.user.id,
      adminId: administrator ? req.user.id : undefined,
      evidence: evidence._id,
    });
    res.send(evidence.data);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/evidence/:id", async (req, res, next) => {
  try {
    const evidence = await Evidence.findById(req.params.id).select("filename uploadedBy");
    if (!evidence) {
      return res.status(404).json({ success: false, message: "Evidence not found." });
    }

    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    if (requesterRole !== "Administrator" && requesterId !== evidence.uploadedBy) {
      return res.status(403).json({ success: false, message: "Only the uploading officer or an administrator can remove this evidence." });
    }

    await Evidence.findByIdAndDelete(req.params.id);
    await recordAudit({
      action: "Evidence removed from storage",
      status: "AUTHORIZED",
      officerId: requesterRole === "Administrator" ? undefined : requesterId,
      adminId: requesterRole === "Administrator" ? requesterId : undefined,
      evidence: evidence._id,
    });
    res.json({ success: true, data: { id: evidence._id, filename: evidence.filename } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit-events", async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: "Only administrators can view audit events." });
    const events = await AuditEvent.find()
      .populate("evidence", "filename caseId")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "Evidence file must be smaller than 15 MB.",
    });
  }

  if (process.env.NODE_ENV !== "production") {
  console.error("Request error:", error);
  }
  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
});

const port = Number(process.env.PORT || 5000);

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch(() => {
    process.exitCode = 1;
  });
