import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  FileImage,
  Fingerprint,
  RefreshCw,
  CheckCircle2,
  Copy,
  Check,
  X,
  Eye,
  LockKeyhole,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";

import { calculateSHA256 } from "../utils/crypto";
import API from "../services/api";

function EvidenceIngestion({
  user,
  selectedFile,
  setSelectedFile,
  hash,
  setHash,
  onEvidenceReady,
  onClear,
  onView,
  canUpload = true,
  caseId = "CASE-2026-001",
}) {
  const fileInputRef = useRef(null);

  const [dragActive, setDragActive] = useState(false);
  const [hashing, setHashing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function processFile(file) {
    if (!file) return;

    setErrorMessage("");

    const allowedExtensions = [
      "pdf",
      "txt",
      "png",
      "jpg",
      "jpeg",
      "webp",
    ];

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      alert("Unsupported file. Use PDF, TXT, PNG, JPG or WEBP.");
      return;
    }

    setSelectedFile(file);
    setHash("");
    setHashing(true);

    let generatedHash = "";

    try {
      generatedHash = await calculateSHA256(file);
      setHash(generatedHash);
    } catch (error) {
      console.error("Hashing error:", error);
      alert("Unable to calculate SHA-256.");
      setHashing(false);
      return;
    } finally {
      setHashing(false);
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caseId", caseId);
      formData.append("title", file.name);
      formData.append("category", "Evidence Document");
      formData.append("officerId", user?.id || "UNKNOWN-OFFICER");
      formData.append("officerRole", user?.role || "Unknown");

      const response = await API.post("/evidence/upload", formData, {
      });

      if (response.data.success) {
        onEvidenceReady?.({
          file,
          hash: generatedHash,
          serverData: response.data.data,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      const msg =
        error.response?.data?.message ||
        "Failed to upload evidence to server.";
      setErrorMessage(msg);
    } finally {
      setUploading(false);
    }
  }

  async function copyHash() {
    if (!hash) return;

    await navigator.clipboard.writeText(hash);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  async function clear() {
    if (selectedFile && onClear) {
      const removed = await onClear();
      if (!removed) return;
    }

    setSelectedFile(null);
    setHash("");
    setErrorMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      {}
      <div className="glass rounded-2xl p-5">
        {canUpload ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              processFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex min-h-[270px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${
              dragActive
                ? "border-emerald-400 bg-emerald-500/10"
                : "border-slate-700 bg-slate-950/30 hover:border-emerald-500/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => processFile(e.target.files?.[0])}
            />

            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
              <Upload size={28} className="text-emerald-400" />
            </div>

            <h3 className="text-sm font-semibold text-white">
              Drop evidence file here
            </h3>

            <p className="mb-4 mt-2 text-xs text-slate-500">
              or click to browse
            </p>

            <div className="flex gap-2">
              <Badge icon={FileText} text="PDF" />
              <Badge icon={FileText} text="TXT" />
              <Badge icon={FileImage} text="IMAGE" />
            </div>
          </div>
        ) : (
          <div className="flex min-h-[270px] flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 px-6 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
              <ShieldAlert size={28} className="text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Upload restricted</h3>
            <p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">
              Legal Officers can view approved evidence and request access, but cannot upload new evidence.
            </p>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-amber-400">
              Investigating Officer or Administrator required
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {}
      <div className="glass rounded-2xl p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              SHA-256 Digest
            </p>

            <h3 className="mt-1 text-sm font-semibold text-white">
              SHA-256 Integrity Lock
            </h3>
          </div>

          <Fingerprint size={19} className="text-emerald-400" />
        </div>

        {hashing || uploading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="text-center">
              <RefreshCw
                size={24}
                className="mx-auto mb-3 animate-spin text-indigo-400"
              />

              <p className="text-xs text-indigo-300">
                {hashing
                  ? "Calculating SHA-256..."
                  : "Uploading evidence to backend..."}
              </p>
            </div>
          </div>
        ) : hash ? (
          <>
            <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 size={17} className="text-emerald-400" />

                <span className="text-xs font-bold text-emerald-400">
                  Local & Server SHA-256 Verified
                </span>
              </div>

              <p className="break-all font-mono text-[10px] text-slate-400">
                {hash}
              </p>

              <button
                onClick={copyHash}
                className="mt-3 flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-[10px] text-slate-300 hover:bg-slate-800"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy Hash"}
              </button>
            </div>

            <div className="space-y-3">
              <Info label="Evidence" value={selectedFile?.name} />

              <Info
                label="Size"
                value={
                  selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(2)} KB`
                    : "-"
                }
              />

              <Info label="Algorithm" value="SHA-256" />

              <Info
                label="Status"
                value={errorMessage ? "Upload Failed" : "Stored & Verified"}
                green={!errorMessage}
              />
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                onClick={onView}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15"
              >
                <Eye size={14} />
                View Document
              </button>

              <button
                onClick={clear}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 py-2.5 text-xs text-slate-400 hover:text-red-400 hover:border-red-500/40"
              >
                <X size={14} />
                Remove Evidence
              </button>
            </div>
          </>
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
            <LockKeyhole size={25} className="mb-3 text-slate-600" />

            <p className="text-xs text-slate-500">Awaiting evidence</p>

            <p className="mt-1 text-[10px] text-slate-700">
              Upload a file to generate fingerprint & store on server
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ icon: Icon, text }) {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-[9px] text-slate-500">
      <Icon size={11} />
      {text}
    </span>
  );
}

function Info({ label, value, green }) {
  return (
    <div className="flex justify-between border-b border-slate-800 pb-2">
      <span className="text-[10px] text-slate-600">{label}</span>

      <span
        className={`max-w-[65%] truncate text-right text-[10px] ${
          green ? "text-emerald-400" : "text-slate-400"
        }`}
      >
        {value || "-"}
      </span>
    </div>
  );
}

export default EvidenceIngestion;