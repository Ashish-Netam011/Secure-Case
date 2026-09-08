import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, Database, Eye, FileText, Lock, ShieldAlert, X } from "lucide-react";
import API from "../services/api";
import EvidenceViewer from "./EvidenceViewer";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";
}

function EvidenceStorage({ user, refreshKey = 0, onLog }) {
  const [evidence, setEvidence] = useState([]);
  const [requests, setRequests] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState("");
  const [officerIdInput, setOfficerIdInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [viewer, setViewer] = useState(null);
  const isAdmin = user?.role === "Administrator";

  const loadData = useCallback(async () => {
    try {
      const [evidenceResponse, requestResponse, auditResponse] = await Promise.all([
        API.get("/evidence"),
        API.get("/access-requests", {
          params: isAdmin ? { role: user.role } : { officerId: user.id },
        }),
        isAdmin ? API.get("/audit-events", { params: { role: user.role } }) : Promise.resolve({ data: { data: [] } }),
      ]);
      setEvidence(evidenceResponse.data.data || []);
      setRequests(requestResponse.data.data || []);
      setAuditEvents(auditResponse.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || "Unable to load evidence storage.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user.id, user.role]);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadData, 0);
    const interval = window.setInterval(loadData, 10000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadData, refreshKey]);

  function requestFor(item) {
    setMessage("");
    setReasonFor(item);
    setReason("");
    setOfficerIdInput("");
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!reason.trim()) return;
    if (officerIdInput.trim() !== user.id) {
      setMessage("Officer ID does not match the current login identity.");
      return;
    }
    try {
      await API.post(`/evidence/${reasonFor._id}/access-requests`, {
        officerId: user.id,
        officerRole: user.role,
        reason,
      });
      onLog?.(`Access requested for ${reasonFor.filename}`, "PENDING");
      setReasonFor(null);
      setMessage("Access request sent to the administrator.");
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || "Unable to submit access request.");
    }
  }

  function requestForEvidence(item) {
    return requests.find((request) => request.evidence?._id === item._id);
  }

  async function openEvidence(item) {
    if (item.integrityStatus === "TAMPERED") {
      setMessage(`TAMPER ALERT: ${item.filename} failed SHA-256 verification. Access has been blocked.`);
      onLog?.(`Tamper detected and access blocked: ${item.filename}`, "ALERT");
      return;
    }
    const request = requestForEvidence(item);
    const isOwner = item.uploadedBy === user.id;
    if (!isAdmin && !isOwner && request?.status !== "APPROVED") return;
    try {
      const response = await API.get(`/evidence/${item._id}/content`, {
        params: { officerId: user.id, role: user.role },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const file = new File([response.data], item.filename, { type: item.mimetype });
      let mode = "download";
      let text = "";
      if (item.mimetype === "application/pdf" || item.filename.toLowerCase().endsWith(".pdf")) mode = "pdf";
      else if (item.mimetype.startsWith("image/")) mode = "image";
      else if (item.mimetype === "text/plain" || item.filename.toLowerCase().endsWith(".txt")) {
        mode = "text";
        text = await file.text();
      }
      setViewer({ file, url, mode, text, hash: item.sha256, evidenceId: item._id });
      onLog?.(`Evidence accessed: ${item.filename}`, "AUTHORIZED");
    } catch (error) {
      setMessage(error.response?.data?.message || "Evidence access was denied.");
      onLog?.(`Evidence access blocked: ${item.filename}`, "BLOCKED");
    }
  }

  function closeViewer() {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  }

  async function decide(request, status) {
    try {
      await API.patch(`/access-requests/${request._id}`, {
        status,
        role: user.role,
        adminId: user.id,
      });
      onLog?.(`${status === "APPROVED" ? "Approved" : "Rejected"} evidence access for ${request.officerId}`, status);
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || "Unable to update access request.");
    }
  }

  return (
    <div className="glass rounded-2xl border border-slate-800 p-5">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2"><Database size={17} className="text-cyan-400" /></div>
          <div><h3 className="text-sm font-semibold text-white">Evidence Storage</h3><p className="text-[10px] text-slate-500">MongoDB-backed evidence records and controlled access</p></div>
        </div>
        <span className="text-[10px] text-slate-500">{evidence.length} stored file{evidence.length === 1 ? "" : "s"}</span>
      </div>

      {message && <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-300">{message}</div>}

      {loading ? <p className="py-8 text-center text-xs text-slate-500">Loading evidence storage...</p> : evidence.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No evidence has been uploaded yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead><tr className="border-b border-slate-800">{["Evidence / File", "Case ID", "Uploaded by", "Date & time", "File details", "Integrity", "Access"].map((label) => <th key={label} className="px-3 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-600">{label}</th>)}</tr></thead>
            <tbody>
              {evidence.map((item) => {
                const request = requestForEvidence(item);
                const approved = isAdmin || request?.status === "APPROVED";
                return <tr key={item._id} className="border-b border-slate-800/60">
                  <td className="px-3 py-4"><div className="flex items-center gap-2"><FileText size={15} className="text-emerald-400" /><div><p className="max-w-[190px] truncate text-xs font-semibold text-slate-200">{item.filename}</p><p className="text-[9px] text-slate-600">{item.category}</p></div></div></td>
                  <td className="px-3 py-4 font-mono text-[10px] text-slate-400">{item.caseId}</td>
                  <td className="px-3 py-4"><p className="text-[10px] text-slate-300">{item.uploadedBy}</p><p className="text-[9px] text-slate-600">{item.uploadedByRole}</p></td>
                  <td className="px-3 py-4 text-[10px] text-slate-400">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-4 text-[10px] text-slate-400">{item.mimetype}<br />{(item.size / 1024).toFixed(1)} KB</td>
                  <td className="px-3 py-4">{item.integrityStatus === "VERIFIED" ? <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400"><Check size={12} /> Verified</span> : <span className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400"><AlertTriangle size={12} /> Tampered</span>}</td>
                  <td className="px-3 py-4">{item.integrityStatus === "TAMPERED" ? <span className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400"><ShieldAlert size={12} /> Blocked</span> : approved ? <button onClick={() => openEvidence(item)} className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-400"><Eye size={12} /> View</button> : request?.status === "PENDING" ? <span className="flex items-center gap-1.5 text-[10px] text-amber-400"><Clock3 size={12} /> Pending</span> : request?.status === "REJECTED" ? <button onClick={() => requestFor(item)} className="text-[10px] text-slate-400 underline">Request again</button> : <button onClick={() => requestFor(item)} className="flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-2 text-[10px] text-slate-300"><Lock size={12} /> Request access</button>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && <div className="mt-7 border-t border-slate-800 pt-5"><div className="mb-3 flex items-center gap-2"><ShieldLabel /><h4 className="text-xs font-semibold text-white">Admin Access Requests</h4></div>{requests.length === 0 ? <p className="text-[10px] text-slate-600">No access requests.</p> : <div className="space-y-2">{requests.map((request) => <div key={request._id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3 md:flex-row md:items-center"><div><p className="text-[10px] font-semibold text-slate-200">{request.officerId} requested {request.evidence?.filename}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(request.createdAt)} • Reason: {request.reason}</p></div><div className="flex items-center gap-2">{request.status === "PENDING" ? <><button onClick={() => decide(request, "APPROVED")} className="flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-2 text-[10px] font-bold text-slate-950"><Check size={12} /> Approve</button><button onClick={() => decide(request, "REJECTED")} className="flex items-center gap-1 rounded-md border border-red-500/30 px-2.5 py-2 text-[10px] text-red-400"><X size={12} /> Reject</button></> : <span className={`text-[10px] font-bold ${request.status === "APPROVED" ? "text-emerald-400" : "text-red-400"}`}>{request.status}</span>}</div></div>)}</div>}</div>}

      {isAdmin && <div className="mt-7 border-t border-slate-800 pt-5"><div className="mb-3 flex items-center gap-2"><Clock3 size={15} className="text-cyan-400" /><h4 className="text-xs font-semibold text-white">Access Activity</h4></div><div className="space-y-2">{auditEvents.filter((event) => event.action.includes("access")).slice(0, 8).map((event) => <div key={event._id} className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-[10px] md:flex-row md:justify-between"><span className="text-slate-300">{event.action} • {event.evidence?.filename || "Evidence"}</span><span className="text-slate-500">{event.officerId || event.adminId || "-"} • {formatDate(event.createdAt)} • {event.status}</span></div>)}</div></div>}

      {viewer && <EvidenceViewer file={viewer.file} url={viewer.url} mode={viewer.mode} hash={viewer.hash} evidenceId={viewer.evidenceId} officerId={user.id} role={user.role} clearance={user.clearance} text={viewer.text} canDownload={isAdmin} onClose={closeViewer} onLog={onLog} />}

      {reasonFor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={submitRequest} className="w-full max-w-md rounded-xl border border-slate-700 bg-[#101722] p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white">Request evidence access</h3><button type="button" onClick={() => setReasonFor(null)} className="text-slate-500"><X size={17} /></button></div><p className="mt-2 text-[10px] text-slate-500">Verify identity before requesting access.</p><p className="mt-4 text-xs text-slate-300">{reasonFor.filename}</p><input autoFocus required value={officerIdInput} onChange={(event) => setOfficerIdInput(event.target.value)} placeholder="Enter your Officer ID" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-white outline-none focus:border-emerald-500" /><textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why access is needed" maxLength={500} className="mt-3 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-white outline-none focus:border-emerald-500" /><button className="mt-4 w-full rounded-lg bg-emerald-500 py-2.5 text-xs font-bold text-slate-950">Send request</button></form></div>}
    </div>
  );
}

function ShieldLabel() { return <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-500/10 text-indigo-400">A</span>; }

export default EvidenceStorage;
