import { useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
  LoaderCircle,
} from "lucide-react";
import API from "../services/api";
import { redactPII } from "../utils/pii";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function formatAnalysisLabel(label) {
  return label
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.values(value).some(hasMeaningfulValue);
  }
  return value !== undefined && value !== null && value !== "";
}

function renderAnalysisValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return <span>Not stated in the evidence.</span>;

    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={index} className="border-l border-indigo-400/30 pl-3">
            {typeof item === "object" && item !== null
              ? renderAnalysisValue(item)
              : item}
          </li>
        ))}
      </ul>
    );
  }

  if (value && typeof value === "object") {
    return (
      <div className="space-y-2">
        {Object.entries(value).filter(([, nestedValue]) => hasMeaningfulValue(nestedValue)).map(([key, nestedValue]) => (
          <div key={key}>
            <span className="font-semibold text-slate-400">{formatAnalysisLabel(key)}: </span>
            {renderAnalysisValue(nestedValue)}
          </div>
        ))}
      </div>
    );
  }

  return value || "Not stated in the evidence.";
}

function renderAnalysisSections(analysis) {
  if (typeof analysis === "string") {
    return <div className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{analysis}</div>;
  }

  return Object.entries(analysis).filter(([, value]) => hasMeaningfulValue(value)).map(([key, value]) => (
    <section key={key} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
        {formatAnalysisLabel(key)}
      </h4>
      <div className="text-xs leading-6 text-slate-300">{renderAnalysisValue(value)}</div>
    </section>
  ));
}

function PdfPreview({ file }) {
  const previewRef = useRef(null);
  const [status, setStatus] = useState("Loading PDF preview...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let pdfDocument;
    let loadingTask;
    const previewContainer = previewRef.current;

    async function renderPdf() {
      setStatus("Loading PDF preview...");
      setError("");
      previewContainer?.replaceChildren();

      try {
        loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
        pdfDocument = await loadingTask.promise;
        if (cancelled) return;

        setStatus(`Rendering ${pdfDocument.numPages} page${pdfDocument.numPages === 1 ? "" : "s"}...`);
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          if (cancelled) return;

          const container = previewContainer;
          if (!container) return;
          const canvas = window.document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          const scale = Math.min(1.5, Math.max(1, container.clientWidth / page.getViewport({ scale: 1 }).width));
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-4 block max-w-full shadow-2xl";
          canvas.setAttribute("aria-label", `Evidence PDF page ${pageNumber}`);
          container.appendChild(canvas);
          await page.render({ canvasContext: context, viewport }).promise;
        }
        if (!cancelled) setStatus("");
      } catch (renderError) {
        if (!cancelled) {
          setError("This PDF could not be rendered in the secure preview.");
          setStatus("");
          console.error("PDF preview error:", renderError);
        }
      }
    }

    renderPdf();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
      previewContainer?.replaceChildren();
    };
  }, [file]);

  return (
    <div className="min-h-[65vh] rounded-xl bg-slate-900 p-3" onContextMenu={(event) => event.preventDefault()}>
      {status && <p className="py-6 text-center text-xs text-slate-500">{status}</p>}
      {error && <p className="py-6 text-center text-xs text-red-400">{error}</p>}
      <div ref={previewRef} />
    </div>
  );
}

function EvidenceViewer({
  file,
  url,
  mode,
  hash,
  role,
  clearance,
  text,
  evidenceId,
  officerId,
  extractionMs,
  canDownload = true,
  onClose,
  onLog,
}) {
  const [analysis, setAnalysis] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [pdfText, setPdfText] = useState("");
  const [viewMode, setViewMode] = useState("original");
  const [analysisProvider, setAnalysisProvider] = useState("");
  const [statusLine, setStatusLine] = useState("");

  if (!file) return null;

  const availableText = text?.trim() || pdfText.trim();
  const canAnalyze = mode === "pdf" || (mode === "text" && Boolean(availableText));

  async function analyzeEvidence() {
    if (analyzing) return;

    setAnalysis("");
    setAnalysisError("");
    setAnalysisProvider("");
    setAnalyzing(true);

    // Honest progress: rotating activity labels, never fake percentages.
    const statusMessages = [
      "Analyzing evidence…",
      "Extracting relevant information…",
      "Generating investigation summary…",
    ];
    let statusIndex = 0;
    setStatusLine(statusMessages[0]);
    const statusTimer = window.setInterval(() => {
      statusIndex = (statusIndex + 1) % statusMessages.length;
      setStatusLine(statusMessages[statusIndex]);
    }, 2500);

    try {
      let evidenceText = availableText;
      if (mode === "pdf" && !pdfText.trim()) {
        const extractionStartedAt = performance.now();
        const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items.map((item) => item.str).join(" "));
        }
        evidenceText = pages.join("\n\n").trim();
        setPdfText(evidenceText);
        console.info(
          `[AI-PERF] pdf-extraction:${Math.round(performance.now() - extractionStartedAt)}ms chars:${evidenceText.length}`,
        );
      }

      if (!evidenceText) {
        setAnalysisError("No readable text was found in this evidence file. Scanned or image-only PDFs cannot be analyzed as text.");
        return;
      }

      const requestStartedAt = performance.now();
      if (extractionMs !== undefined) {
        console.info(`[AI-PERF] pdf-extraction:${extractionMs}ms chars:${evidenceText.length}`);
      }
      const response = await API.post("/ai/analyze", {
        text: redactPII(evidenceText).text,
        evidenceId,
        evidenceHash: hash,
        officerId,
        role,
      });
      console.info(
        `[AI-PERF] frontend request:${Math.round(performance.now() - requestStartedAt)}ms provider=${response.data?.provider || "?"} cached=${response.data?.cached ? "yes" : "no"}`,
      );
      setAnalysis(response.data.analysis || response.data.result || "No analysis was returned.");
      setAnalysisProvider(response.data.provider || "");
      onLog?.(`AI analysis completed: ${file.name}`, "AUTHORIZED");
    } catch (error) {
      setAnalysisError(
        error.response?.data?.message ||
          "AI analysis is unavailable. Check that Ollama and the backend are running."
      );
      onLog?.(`AI analysis failed: ${file.name}`, "ERROR");
    } finally {
      window.clearInterval(statusTimer);
      setStatusLine("");
      setAnalyzing(false);
    }
  }

  function downloadFile() {
    if (!canDownload) {
      onLog?.(
        `Unauthorized evidence download blocked: ${file.name}`,
        "BLOCKED"
      );

      return;
    }

    const link =
      document.createElement("a");

    link.href = url;
    link.download = file.name;

    document.body.appendChild(link);

    link.click();

    link.remove();

    onLog?.(
      `Evidence downloaded: ${file.name}`,
      "AUTHORIZED"
    );
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">

      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#0f1522]">

        {}

        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">

          <div className="min-w-0">

            <p className="truncate text-xs font-bold text-white">
              {file.name}
            </p>

            <p className="text-[9px] text-emerald-400">
              SHA-256 VERIFIED • {role} • {clearance}
            </p>

          </div>

          <div className="flex gap-2">

            {canDownload ? (
              <button
                onClick={downloadFile}
                className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-white transition hover:bg-slate-800"
              >
                <Download size={13} />
                Download
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-[10px] text-slate-600">
                <Download size={13} />
                Download Restricted
              </div>
            )}

            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-800"
            >
              <X size={16} />
            </button>

          </div>

        </div>

        {}

        <div className="flex-1 overflow-auto bg-slate-950/70 p-4">

          {}

          <div className="mb-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-emerald-400">

              <CheckCircle2 size={13} />

              ACCESS GRANTED

              <span className="text-slate-600">
                •
              </span>

              Identity verified

              <span className="text-slate-600">
                •
              </span>

              SHA-256 verified

              <span className="text-slate-600">
                •
              </span>

              Role authorized

            </div>

            <p className="mt-2 break-all font-mono text-[9px] text-slate-500">
              {hash}
            </p>

          </div>

          {}

          <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">

            <ShieldCheck
              size={16}
              className="text-emerald-400"
            />

            <div>

              <p className="text-[9px] font-bold text-white">
                ACCESS CONTROL
              </p>

              <p className="text-[9px] text-slate-500">
                {role} • {clearance}
                {" • "}
                {canDownload
                  ? "Download authorized"
                  : "View-only access"}
              </p>

            </div>

          </div>

          <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {[["original", "Original"], ["analysis", "AI Analyze"]].map(([value, label]) => (
              <button key={value} onClick={() => setViewMode(value)} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${viewMode === value ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
                {label}
              </button>
            ))}
          </div>

          {viewMode === "analysis" && <div className="mb-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-white">AI Evidence Analysis</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {canAnalyze
                    ? mode === "pdf"
                      ? "Extract and analyze readable PDF text through the secure backend."
                      : "Analyze readable evidence text through the secure backend."
                    : "Scanned or image-only files cannot be analyzed as text."}
                </p>
              </div>
              <button
                onClick={analyzeEvidence}
                disabled={!canAnalyze || analyzing}
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {analyzing ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {analyzing ? "Analyzing..." : "Analyze with AI"}
              </button>
            </div>

            {analyzing && statusLine && (
              <p className="mt-3 flex items-center gap-2 text-[10px] text-indigo-300">
                <LoaderCircle size={12} className="animate-spin" />
                {statusLine}
              </p>
            )}

            {analysisError && (
              <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-[10px] text-red-400">
                {analysisError}
              </p>
            )}

            {analysis && (
              <div className="mt-3 space-y-2 rounded-md border border-indigo-500/20 bg-slate-950/50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    AI Analysis Result
                  </p>
                  {analysisProvider && (
                    <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-300">
                      {analysisProvider === "gemini"
                        ? "AI Analysis • Gemini"
                        : `AI Analysis • Fallback (${analysisProvider.replace("ollama-", "")})`}
                    </span>
                  )}
                </div>
                {renderAnalysisSections(analysis)}
              </div>
            )}
          </div>}

          {}

          {viewMode === "original" && mode === "pdf" && <PdfPreview file={file} />}

          {}

          {viewMode === "original" && mode === "image" && (
            <div className="flex min-h-[65vh] items-center justify-center rounded-xl bg-slate-900">

              <img
                src={url}
                alt="Evidence"
                className="max-h-[65vh] max-w-full object-contain"
              />

            </div>
          )}

          {}

          {viewMode === "original" && mode === "text" && (
            <pre className="min-h-[65vh] whitespace-pre-wrap rounded-xl bg-slate-900 p-5 font-mono text-xs leading-7 text-slate-300">
              {text}
            </pre>
          )}

          {}

          {viewMode === "original" && mode === "download" && (
            <div className="flex min-h-[65vh] flex-col items-center justify-center">

              <FileText
                size={35}
                className="mb-4 text-slate-600"
              />

              <p className="text-sm font-semibold text-white">
                Evidence verified successfully
              </p>

              <p className="mt-2 text-[10px] text-slate-500">
                This file type cannot be previewed
                in the browser.
              </p>

              {canDownload ? (
                <button
                  onClick={downloadFile}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-400"
                >
                  <Download size={14} />
                  Download Verified Copy
                </button>
              ) : (
                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-[10px] font-semibold text-red-400">
                  Download restricted for your role
                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

export default EvidenceViewer;
