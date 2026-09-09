import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Scale,
  UserCog,
  ChevronRight,
} from "lucide-react";
import API from "../services/api";

const DEMO_ROLES = [
  {
    role: "Investigating Officer",
    description: "Upload and analyze case evidence",
    clearance: "L3",
    icon: FileSearch,
  },
  {
    role: "Legal Officer",
    description: "Review approved evidence and findings",
    clearance: "L2",
    icon: Scale,
  },
  {
    role: "Administrator",
    description: "Approve requests and manage the system",
    clearance: "L4",
    icon: UserCog,
  },
];

function Login({ onLogin }) {
  const [activeRole, setActiveRole] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleRoleLogin(role) {
    setError("");
    setSuccess(false);
    setActiveRole(role);

    try {
      const response = await API.post("/auth/demo-login", { role });
      localStorage.setItem("token", response.data.token);
      setSuccess(true);
      onLogin(response.data.user);
    } catch (requestError) {
      const status = requestError.response?.status;
      setError(
        status === 404
          ? "Role quick-login is not enabled on this server."
          : requestError.response?.data?.message || "Unable to authenticate.",
      );
      setActiveRole(null);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080c14] px-4 py-8">

      {}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      <div className="relative w-full max-w-md">

        {}
        <div className="mb-8 text-center">

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 shadow-lg shadow-emerald-500/5">
            <ShieldCheck
              size={32}
              strokeWidth={1.8}
              className="text-emerald-400"
            />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white">
            SECURE CASE
          </h1>

          <p className="mt-2 text-xs text-slate-500">
            Digital Evidence Management System
          </p>

        </div>

        {}
        <div className="glass rounded-2xl border border-slate-800 p-6 shadow-2xl">

          {}
          <div className="mb-6">

            <div className="flex items-center justify-between">

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                Secure Authentication
              </p>

              <div className="flex items-center gap-1.5 text-[9px] text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Protected
              </div>

            </div>

            <h2 className="mt-2 text-xl font-bold text-white">
              Officer Login
            </h2>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Select your role to access the corresponding
              dashboard and its protected capabilities.
            </p>

          </div>

          {}
          <div className="space-y-3">

            {DEMO_ROLES.map(({ role, description, clearance, icon: RoleIcon }) => {
              const isLoading = activeRole === role;

              return (
                <button
                  key={role}
                  type="button"
                  disabled={activeRole !== null}
                  onClick={() => handleRoleLogin(role)}
                  aria-label={`Log in as ${role}`}
                  className="group flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-emerald-500/40 hover:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:disabled:opacity-50 aria-disabled:opacity-50"
                >

                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-emerald-400 transition group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10">
                    {isLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
                    ) : (
                      <RoleIcon size={18} strokeWidth={1.8} />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">

                    <span className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {role}
                      </span>

                      <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                        {clearance}
                      </span>
                    </span>

                    <span className="mt-0.5 block truncate text-[10px] leading-4 text-slate-500">
                      {description}
                    </span>

                  </span>

                  <ChevronRight
                    size={15}
                    className="shrink-0 text-slate-700 transition group-hover:text-emerald-400"
                  />

                </button>
              );
            })}

          </div>

          {}
          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[10px] leading-5 text-red-400"
            >

              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0"
              />

              <span>{error}</span>

            </div>
          )}

          {}
          {success && (
            <div
              role="status"
              className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[10px] text-emerald-400"
            >

              <CheckCircle2 size={14} />

              <span>
                Identity verified. Loading role dashboard...
              </span>

            </div>
          )}

          {}
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/50 p-4">

            <div className="flex items-start gap-3">

              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0 text-slate-600"
              />

              <div>

                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  Protected System
                </p>

                <p className="mt-2 text-[9px] leading-4 text-slate-600">
                  Access permissions are automatically determined
                  by the authenticated officer's role and clearance
                  level.
                </p>

              </div>

            </div>

          </div>

        </div>

        {}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] text-slate-700">
          <span>ROLE-BASED ACCESS</span>
          <span>•</span>
          <span>EVIDENCE INTEGRITY</span>
          <span>•</span>
          <span>AUDIT TRAIL</span>
        </div>

        <p className="mt-2 text-center text-[8px] text-slate-800">
          Authorized personnel only • Secure Case System
        </p>

      </div>
    </div>
  );
}

export default Login;
