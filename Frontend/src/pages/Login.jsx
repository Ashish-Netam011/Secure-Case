import { useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  Eye,
  EyeOff,
  AlertTriangle,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import API from "../services/api";

function Login({ onLogin }) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess(false);

    if (!pin) {
      setError("Security PIN is required.");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setError("Security PIN must contain exactly six digits.");
      return;
    }

    setLoading(true);
    try {
      const response = await API.post("/auth/login", { pin });
      localStorage.setItem("token", response.data.token);
      setSuccess(true);
      onLogin(response.data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to authenticate.");
    } finally {
      setLoading(false);
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
              Verify your identity to access protected
              case records and digital evidence.
            </p>

          </div>

          {}
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >

            {}
            <div>

              <label
                htmlFor="security-pin"
                className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500"
              >
                Security PIN
              </label>

              <div className="relative">

                <LockKeyhole
                  size={15}
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                />

                <input
                  id="security-pin"
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6);

                    setPin(value);
                    setError("");
                    setSuccess(false);
                  }}
                  placeholder="Enter Security PIN"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={6}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-3 pl-10 pr-10 text-xs tracking-widest text-white placeholder:tracking-normal placeholder:text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                />

                <button
                  type="button"
                  aria-label={
                    showPin
                      ? "Hide security PIN"
                      : "Show security PIN"
                  }
                  onClick={() => setShowPin((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-slate-300"
                >
                  {showPin ? (
                    <EyeOff size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>

              </div>

              <p className="mt-2 text-[9px] text-slate-700">
                Authorized personnel only
              </p>

            </div>

            {}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[10px] leading-5 text-red-400"
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
                className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[10px] text-emerald-400"
              >

                <CheckCircle2 size={14} />

                <span>
                  Identity verified. Checking access permissions...
                </span>

              </div>
            )}

            {}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >

              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />

                  {success
                    ? "Authorizing Access..."
                    : "Verifying Identity..."}
                </>
              ) : (
                <>
                  <LogIn size={15} />
                  Secure Login
                </>
              )}

            </button>

          </form>

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