import { useEffect, useState } from "react";
import { getPermissions } from "../utils/permission.js";

import {
  ShieldCheck,
  Shield,
  Fingerprint,
  Sparkles,
  Eye,
  History,
  LockKeyhole,
  LogOut,
  Activity,
  FolderOpen,
  FileText,
  Search,
  Link2,
  BarChart3,
  Menu,
  X,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Database,
} from "lucide-react";

import StateCard from "../components/StateCard";
import SectionHeading from "../components/SectionHeading";
import EvidenceIngestion from "../components/EvidenceIngestion";
import PIIRedaction from "../components/PIIRedaction";
import EvidenceVault from "../components/EvidenceVault";
import EvidenceStorage from "../components/EvidenceStorage";
import AuditLog from "../components/AuditLog";
import { calculateSHA256 } from "../utils/crypto.js";
import API from "../services/api.js";



const INITIAL_LOGS = [
  {
    id: "LOG-0003",
    timestamp: "24 Aug 2026 • 18:32:14",
    role: "Administrator",
    action: "System integrity verification completed",
    status: "VERIFIED",
  },
  {
    id: "LOG-0002",
    timestamp: "24 Aug 2026 • 18:27:41",
    role: "Legal Officer",
    action: " document access recorded",
    status: "VERIFIED",
  },
  {
    id: "LOG-0001",
    timestamp: "24 Aug 2026 • 18:21:09",
    role: "Investigating Officer",
    action: "Evidence record initialized",
    status: "VERIFIED",
  },
];


function formatTime() {
  return new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getTokenExpiry(token) {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;

    const base64Payload = encodedPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64Payload));
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
    return Math.min(payload.exp, payload.iat + 30 * 60) * 1000;
  } catch {
    return null;
  }
}

function formatRemainingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function Dashboard({ user, onLogout }) {

  
  const permissions = getPermissions(user.role);

  function hasAccess(section) {
  const accessMap = {
    overview: permissions.dashboard,
    cases: permissions.cases.view,
    evidence: permissions.evidence.view,
    analysis: permissions.analysis.view,
    custody: permissions.custody.view,
    redaction: permissions.pii.view,
    reports: permissions.reports.view,
    audit: permissions.audit.view,
  };

  return accessMap[section] ?? false;
}

  const [selectedFile, setSelectedFile] = useState(null);
  const [hash, setHash] = useState("");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(null);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [evidenceRefreshKey, setEvidenceRefreshKey] = useState(0);
  const [sessionRemaining, setSessionRemaining] = useState(0);

  useEffect(() => {
    const expiry = getTokenExpiry(localStorage.getItem("token") || "");

    if (!expiry) return undefined;

    const updateSessionTimer = () => {
      const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
      setSessionRemaining(remaining);

      if (remaining === 0) {
        window.dispatchEvent(new Event("secure-case-session-expired"));
      }
    };

    updateSessionTimer();
    const timer = window.setInterval(updateSessionTimer, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function addLog(action, status = "VERIFIED") {
    setLogs((previous) => [
      {
        id: `LOG-${String(previous.length + 1).padStart(4, "0")}`,
        timestamp: formatTime(),
        role: user.role,
        action,
        status,
      },
      ...previous,
    ]);
  }

  function handleEvidenceReady({ file, hash, serverData }) {
    setSelectedFile(file);
    setHash(hash);
    setSelectedEvidenceId(serverData?.id || null);
    setEvidenceRefreshKey((value) => value + 1);

    addLog(
      `Evidence ingested: ${file.name} • SHA-256 verified`
    );
  }

  async function clearEvidence() {
    if (selectedFile) {
      if (!selectedEvidenceId) {
        addLog(`Evidence removed from active workspace: ${selectedFile.name}`);
      } else {
        try {
          await API.delete(`/evidence/${selectedEvidenceId}`, {
            params: { officerId: user.id, role: user.role },
          });
          addLog(`Evidence removed from storage: ${selectedFile.name}`, "AUTHORIZED");
          setEvidenceRefreshKey((value) => value + 1);
        } catch (error) {
          addLog(`Evidence removal blocked: ${selectedFile.name}`, "BLOCKED");
          return false;
        }
      }
    }

    setSelectedFile(null);
    setHash("");
    setSelectedEvidenceId(null);
    return true;
  }

  async function viewDocument() {
    if (!selectedFile || !hash) return;

    const previewWindow = window.open("about:blank", "_blank");

    if (!previewWindow) return;

    const currentHash = await calculateSHA256(selectedFile);

    if (currentHash !== hash) {
      previewWindow.close();
      addLog(`Evidence integrity mismatch blocked: ${selectedFile.name}`, "BLOCKED");
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    previewWindow.location.href = url;
    addLog(`Authorized document viewed • SHA-256 verification passed: ${selectedFile.name}`, "AUTHORIZED");
  }
function navigate(section) {
  if (!hasAccess(section)) {
    addLog(
      `Unauthorized module access blocked: ${section}`,
      "BLOCKED"
    );
    return;
  }

  setActiveSection(section);
  setSidebarOpen(false);
}

  const navigation = [
    {
      id: "overview",
      label: "Overview",
      icon: Activity,
       allowed: permissions.dashboard,
    },
    {
      id: "cases",
      label: "Cases",
      icon: FolderOpen,
      allowed: permissions.cases.view,
    },
    {
      id: "evidence",
      label: "Evidence Vault",
      icon: Fingerprint,
      allowed: permissions.evidence.view,
    },
    {
      id: "analysis",
      label: "Evidence Analysis",
      icon: Search,
      allowed: permissions.analysis.view,
    },
    {
      id: "custody",
      label: "Chain of Custody",
      icon: Link2,
      allowed: permissions.custody.view,
    },
    {
      id: "redaction",
      label: "PII Redaction",
      icon: Sparkles,
      allowed: permissions.pii.view,
    },
    {
      id: "reports",
      label: "Reports",
      icon: BarChart3,
      allowed: permissions.reports.view,
    },
    {
      id: "audit",
      label: "Audit Logs",
      icon: History,
      allowed: permissions.audit.view,
    },
  ];

  function renderOverview() {
    return (
      <>
        <section className="mb-7">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <span>COMMAND CONSOLE</span>
                <span>/</span>
                <span className="text-emerald-400">
                  OVERVIEW
                </span>
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                Digital Evidence Command Center
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Centralized control center for secure evidence
                ingestion, analysis, integrity verification,
                PII protection and forensic auditing.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-600">
                  Clearance
                </p>

                <p className="mt-1 text-xs font-semibold text-indigo-400">
                  {user.clearance}
                </p>
              </div>

              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2">
                <p className="text-[9px] uppercase tracking-widest text-slate-600">
                  Session
                </p>

                <p className="mt-1 text-xs font-semibold text-emerald-400">
                  VERIFIED
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StateCard
            icon={Shield}
            label="Integrity Engine"
            value="ACTIVE"
            sub="SHA-256"
            iconClass="text-emerald-400"
          />

          <StateCard
            icon={Activity}
            label="Security Events"
            value={logs.length}
            sub="Audit ledger"
            iconClass="text-indigo-400"
          />

          <StateCard
            icon={Fingerprint}
            label="Evidence"
            value={hash ? "LOCKED" : "READY"}
            sub="SHA-256 Digest"
            iconClass="text-cyan-400"
          />

          <StateCard
            icon={LockKeyhole}
            label="Security Level"
            value={user.clearance}
            sub={user.role}
            iconClass="text-amber-400"
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="glass rounded-2xl border border-slate-800 p-5 lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Investigation Overview
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Current secure case environment
                </p>
              </div>

              <CheckCircle2
                size={20}
                className="text-emerald-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <OverviewMetric
                label="Active Cases"
                value="08"
                icon={FolderOpen}
              />

              <OverviewMetric
                label="Evidence Items"
                value="42"
                icon={Database}
              />

              <OverviewMetric
                label="Verified"
                value="39"
                icon={CheckCircle2}
              />

              <OverviewMetric
                label="Pending"
                value="03"
                icon={Clock3}
              />
            </div>
          </div>

          <div className="glass rounded-2xl border border-slate-800 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <ShieldCheck
                  size={22}
                  className="text-emerald-400"
                />
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">
                  System Status
                </h3>

                <p className="text-xs text-emerald-400">
                  All systems operational
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <StatusRow
                label="Integrity Engine"
                status="ONLINE"
              />

              <StatusRow
                label="Evidence Vault"
                status="SECURED"
              />

              <StatusRow
                label="Audit Ledger"
                status="ACTIVE"
              />

              <StatusRow
                label="Access Control"
                status="ENFORCED"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 glass rounded-2xl border border-slate-800 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">
                Recent Security Activity
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Latest events recorded by the audit ledger
              </p>
            </div>

            <button
              onClick={() => navigate("audit")}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              View all
              <ChevronRight size={14} />
            </button>
          </div>

          <AuditLog logs={logs.slice(0, 3)} />
        </div>
      </>
    );
  }

  function renderCases() {
    const cases = [
      {
        id: "CASE-2026-001",
        title: "Digital Fraud Investigation",
        officer: "Investigating Officer",
        evidence: 18,
        status: "INVESTIGATION",
      },
      {
        id: "CASE-2026-002",
        title: "Document Forgery Analysis",
        officer: "Legal Officer",
        evidence: 11,
        status: "UNDER REVIEW",
      },
      {
        id: "CASE-2026-003",
        title: "Cyber Incident Evidence",
        officer: "Administrator",
        evidence: 13,
        status: "VERIFIED",
      },
    ];

    return (
      <>
        <PageHeader
          eyebrow="CASE MANAGEMENT"
          title="Investigation Cases"
          description="Manage active investigations, assigned officers and associated digital evidence."
        />

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StateCard
            icon={FolderOpen}
            label="Total Cases"
            value="08"
            sub="Registered"
            iconClass="text-indigo-400"
          />

          <StateCard
            icon={Activity}
            label="Active"
            value="05"
            sub="Investigation"
            iconClass="text-emerald-400"
          />

          <StateCard
            icon={Clock3}
            label="Pending"
            value="02"
            sub="Review required"
            iconClass="text-amber-400"
          />

          <StateCard
            icon={CheckCircle2}
            label="Closed"
            value="01"
            sub="Verified"
            iconClass="text-cyan-400"
          />
        </div>

        <div className="space-y-3">
          {cases.map((item) => (
            <div
              key={item.id}
              className="glass rounded-xl border border-slate-800 p-5 transition hover:border-slate-700"
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-emerald-400">
                    {item.id}
                  </p>

                  <h3 className="mt-1 text-base font-bold text-white">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-xs text-slate-500">
                    Assigned: {item.officer}
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-slate-600">
                      Evidence
                    </p>

                    <p className="mt-1 text-sm font-bold text-slate-200">
                      {item.evidence} items
                    </p>
                  </div>

                  <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-400">
                    {item.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderEvidence() {
    return (
      <>
        <PageHeader
          eyebrow="EVIDENCE MANAGEMENT"
          title="Evidence Vault"
          description="Securely ingest, fingerprint and manage digital evidence inside the investigation workflow."
        />

        {permissions.evidence.upload ? (
          <section className="mb-6">
            <SectionHeading
              number="01"
              icon={Fingerprint}
              title="Evidence Ingestion & Cryptographic Locking"
              description="Every evidence file receives a SHA-256 fingerprint before entering the secure workflow."
            />

            <EvidenceIngestion
              user={user}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              hash={hash}
              setHash={setHash}
              onEvidenceReady={handleEvidenceReady}
              onClear={clearEvidence}
              onView={viewDocument}
              canUpload
            />
          </section>
        ) : (
          <section className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Evidence upload restricted</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Your Legal Officer role can review stored evidence and request access, but cannot upload new files.
                </p>
              </div>
            </div>
          </section>
        )}

        <section>
          <SectionHeading
            number="02"
            icon={Database}
            title="Evidence Storage"
            description="Browse stored evidence and request administrator approval before accessing previous files."
          />

          <EvidenceStorage user={user} refreshKey={evidenceRefreshKey} onLog={addLog} />
        </section>

        <section>
          <SectionHeading
            number="03"
            icon={Eye}
            title="Evidence Vault & Access Control"
            description="Evidence access requires identity verification and cryptographic integrity validation."
          />

          <EvidenceVault
            user={user}
            selectedFile={selectedFile}
            hash={hash}
            evidenceId={selectedEvidenceId}
            onLog={addLog}
          />
        </section>
      </>
    );
  }

  function renderAnalysis() {
    return (
      <>
        <PageHeader
          eyebrow="FORENSIC ANALYSIS"
          title="Evidence Analysis"
          description="Analyze evidence metadata, integrity fingerprints and suspicious indicators."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <AnalysisCard
            icon={Fingerprint}
            title="Cryptographic Verification"
            value={hash ? "VERIFIED" : "WAITING"}
            description={
              hash
                ? "Evidence fingerprint successfully generated."
                : "Upload evidence to generate a SHA-256 fingerprint."
            }
          />

          <AnalysisCard
            icon={FileText}
            title="Metadata Analysis"
            value={selectedFile ? "AVAILABLE" : "READY"}
            description={
              selectedFile
                ? `Metadata available for ${selectedFile.name}`
                : "Evidence metadata will appear here."
            }
          />

          <AnalysisCard
            icon={Search}
            title="Threat Indicators"
            value="LOW"
            description="No critical indicators detected in the prototype analysis."
          />

          <AnalysisCard
            icon={ShieldCheck}
            title="Integrity Status"
            value={hash ? "LOCKED" : "UNLOCKED"}
            description="Integrity state is linked to the cryptographic evidence fingerprint."
          />
        </div>

        <div className="mt-6 glass rounded-2xl border border-slate-800 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle
              size={20}
              className="text-amber-400"
            />

            <div>
              <h3 className="text-sm font-bold text-white">
                Prototype Analysis Engine
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                AI-assisted forensic analysis can be connected here in the production implementation.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderCustody() {
    return (
      <>
        <PageHeader
          eyebrow="FORENSIC GOVERNANCE"
          title="Chain of Custody"
          description="Track every interaction with evidence from ingestion to final review."
        />

        <div className="glass rounded-2xl border border-slate-800 p-6">
          <div className="space-y-0">
            <CustodyEvent
              number="01"
              title="Evidence Initialized"
              description="Evidence record created and assigned to investigation."
              role="Investigating Officer"
              time="24 Aug 2026 • 18:21:09"
            />

            <CustodyEvent
              number="02"
              title="SHA-256 Fingerprint Generated"
              description="Cryptographic integrity fingerprint generated."
              role="Integrity Engine"
              time="24 Aug 2026 • 18:21:13"
            />

            <CustodyEvent
              number="03"
              title="Evidence Accessed"
              description="Authorized evidence access recorded."
              role="Legal Officer"
              time="24 Aug 2026 • 18:27:41"
            />

            <CustodyEvent
              number="04"
              title="Integrity Verification"
              description="Evidence integrity successfully verified."
              role="Administrator"
              time="24 Aug 2026 • 18:32:14"
              last
            />
          </div>
        </div>
      </>
    );
  }

  function renderRedaction() {
    return (
      <>
        <PageHeader
          eyebrow="PRIVACY PROTECTION"
          title="PII Redaction"
          description="Detect and protect sensitive personally identifiable information before legal review."
        />

        <PIIRedaction
          verified={true}
          onLog={addLog}
        />
      </>
    );
  }

  function renderReports() {
    return (
      <>
        <PageHeader
          eyebrow="REPORTING"
          title="Investigation Reports"
          description="Generate structured reports from verified evidence and audit activity."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <ReportCard
            icon={FileText}
            title="Case Report"
            description="Investigation summary, officers and current case status."
          />

          <ReportCard
            icon={Fingerprint}
            title="Evidence Report"
            description="Evidence metadata, SHA-256 fingerprints and integrity state."
          />

          <ReportCard
            icon={History}
            title="Audit Report"
            description="Complete chain of security-sensitive system activity."
          />
        </div>

        <div className="mt-6 glass rounded-2xl border border-slate-800 p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h3 className="text-sm font-bold text-white">
                Secure Report Generation
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Reports can be digitally signed and exported for authorized legal review.
              </p>
            </div>

            <button
              onClick={() =>
                addLog("Investigation report generation requested")
              }
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Generate Report
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderAudit() {
    return (
      <>
        <PageHeader
          eyebrow="SECURITY MONITORING"
          title="Audit Logs"
          description="Tamper-evident records of security-sensitive actions across the platform."
        />

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StateCard
            icon={History}
            label="Total Events"
            value={logs.length}
            sub="Recorded"
            iconClass="text-indigo-400"
          />

          <StateCard
            icon={CheckCircle2}
            label="Verified"
            value={logs.filter((x) => x.status === "VERIFIED").length}
            sub="Successful"
            iconClass="text-emerald-400"
          />

          <StateCard
            icon={ShieldCheck}
            label="Ledger"
            value="ACTIVE"
            sub="Tamper evident"
            iconClass="text-cyan-400"
          />
        </div>

        <AuditLog logs={logs} />
      </>
    );
  }

  function renderContent() {
    switch (activeSection) {
      case "cases":
        return renderCases();

      case "evidence":
        return renderEvidence();

      case "analysis":
        return renderAnalysis();

      case "custody":
        return renderCustody();

      case "redaction":
        return renderRedaction();

      case "reports":
        return renderReports();

      case "audit":
        return renderAudit();

      default:
        return renderOverview();
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />

      {}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-slate-800 bg-[#0b0f19] transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
              <ShieldCheck
                size={20}
                className="text-emerald-400"
              />

              <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-emerald-400" />
            </div>

            <div>
              <h1 className="text-xs font-bold text-white">
                SECURE CASE
              </h1>

              <p className="text-[8px] text-slate-500">
                
              </p>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-500 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-800 px-4 py-4">
          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
            <p className="text-[9px] uppercase tracking-widest text-slate-600">
              Authorized User
            </p>

            <p className="mt-1 truncate text-xs font-semibold text-white">
              {user.name}
            </p>

            <p className="mt-1 text-[9px] text-emerald-400">
              {user.role}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-widest text-slate-600">
            Command Console
          </p>

        <div className="space-y-1">
  {navigation
    .filter((item) => item.allowed)
    .map((item) => {
      const Icon = item.icon;
      const active = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${
                    active
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border border-transparent text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <Icon size={16} />

                  <span>{item.label}</span>

                  {active && (
                    <ChevronRight
                      size={14}
                      className="ml-auto"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-800 p-3">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-red-500/5 hover:text-red-400"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {}
      <div className="relative lg:ml-64">
        {}
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg border border-slate-800 p-2 text-slate-400 lg:hidden"
              >
                <Menu size={18} />
              </button>

              <div>
                <p className="text-[9px] uppercase tracking-widest text-slate-600">
                  Current Module
                </p>

                <p className="text-sm font-bold text-white">
                  {navigation.find(
                    (x) => x.id === activeSection
                  )?.label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                aria-live="polite"
                className={`rounded-lg border px-2 py-1.5 text-right sm:px-3 ${
                  sessionRemaining <= 60
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-emerald-500/20 bg-emerald-500/5"
                }`}
              >
                <p className="text-[9px] uppercase tracking-widest text-slate-500">
                  Session expires in
                </p>
                <p className={`text-xs font-semibold ${sessionRemaining <= 60 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatRemainingTime(sessionRemaining)}
                </p>
              </div>

              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold text-white">
                  {user.name}
                </p>

                <p className="text-[9px] text-emerald-400">
                  {user.role} • {user.clearance}
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
                <LockKeyhole
                  size={16}
                  className="text-emerald-400"
                />
              </div>

              <button
                onClick={onLogout}
                className="hidden rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-red-500/30 hover:text-red-400 sm:flex sm:items-center sm:gap-2"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </div>
        </header>

        {}
        <main className="relative mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">
          {renderContent()}

          <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-slate-800/70 py-5 text-[10px] text-slate-600 md:flex-row">
            <div className="flex items-center gap-2">
              <ShieldCheck size={13} />
              SECURE CASE 
            </div>

            <div>
              SHA-256 • ROLE BASED ACCESS • AUDIT LOG • PII PROTECTION
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}



function PageHeader({
  eyebrow,
  title,
  description,
}) {
  return (
    <section className="mb-7">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <span>COMMAND CONSOLE</span>
        <span>/</span>
        <span className="text-emerald-400">
          {eyebrow}
        </span>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
        {title}
      </h2>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        {description}
      </p>
    </section>
  );
}

function OverviewMetric({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <Icon
        size={18}
        className="text-emerald-400"
      />

      <p className="mt-3 text-xl font-bold text-white">
        {value}
      </p>

      <p className="mt-1 text-[10px] text-slate-500">
        {label}
      </p>
    </div>
  );
}

function StatusRow({ label, status }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
      <span className="text-xs text-slate-400">
        {label}
      </span>

      <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {status}
      </span>
    </div>
  );
}

function AnalysisCard({
  icon: Icon,
  title,
  value,
  description,
}) {
  return (
    <div className="glass rounded-2xl border border-slate-800 p-6">
      <div className="flex items-start justify-between">
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <Icon
            size={20}
            className="text-emerald-400"
          />
        </div>

        <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[9px] font-bold text-emerald-400">
          {value}
        </span>
      </div>

      <h3 className="mt-5 text-sm font-bold text-white">
        {title}
      </h3>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function CustodyEvent({
  number,
  title,
  description,
  role,
  time,
  last,
}) {
  return (
    <div className="relative flex gap-4">
      {!last && (
        <div className="absolute left-[15px] top-8 h-full w-px bg-slate-800" />
      )}

      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[9px] font-bold text-emerald-400">
        {number}
      </div>

      <div className="pb-8">
        <h3 className="text-sm font-bold text-white">
          {title}
        </h3>

        <p className="mt-1 text-xs text-slate-500">
          {description}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] text-slate-400">
            {role}
          </span>

          <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] text-slate-500">
            {time}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReportCard({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="glass rounded-2xl border border-slate-800 p-6 transition hover:border-emerald-500/20">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
        <Icon
          size={20}
          className="text-indigo-400"
        />
      </div>

      <h3 className="mt-5 text-sm font-bold text-white">
        {title}
      </h3>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>

      <button className="mt-5 flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300">
        Open report
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

export default Dashboard;