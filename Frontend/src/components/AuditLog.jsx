import {
  Activity,
  Ban,
  CheckCircle2,
  Clock3,
  Database,
  History,
} from "lucide-react";

function AuditLog({ logs }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">

      <div className="flex items-center gap-3 border-b border-slate-800 p-4">

        <div className="rounded-lg bg-emerald-500/10 p-2">

          <History
            size={17}
            className="text-emerald-400"
          />

        </div>

        <div>

          <p className="text-xs font-semibold text-white">
            Immutable Audit Ledger
          </p>

          <p className="text-[10px] text-slate-500">
            Append-only security event stream
          </p>

        </div>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full min-w-[750px] text-left">

          <thead>

            <tr className="border-b border-slate-800">

              {[
                "Log ID",
                "Timestamp",
                "Role",
                "Action",
                "Status",
              ].map((item) => (
                <th
                  key={item}
                  className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-600"
                >
                  {item}
                </th>
              ))}

            </tr>

          </thead>

          <tbody>

            {logs.map((log) => (

              <tr
                key={log.id}
                className="border-b border-slate-800/60"
              >

                <td className="px-4 py-4 font-mono text-[10px] text-slate-400">
                  {log.id}
                </td>

                <td className="px-4 py-4">

                  <div className="flex items-center gap-2 text-[10px] text-slate-400">

                    <Clock3 size={12} />

                    {log.timestamp}

                  </div>

                </td>

                <td className="px-4 py-4">

                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/5 px-2 py-1 text-[9px] text-indigo-400">
                    {log.role}
                  </span>

                </td>

                <td className="px-4 py-4">

                  <div className="flex gap-2">

                    <Activity
                      size={13}
                      className={
                        log.status === "BLOCKED"
                          ? "text-red-400"
                          : "text-indigo-400"
                      }
                    />

                    <span className="text-[10px] text-slate-300">
                      {log.action}
                    </span>

                  </div>

                </td>

                <td className="px-4 py-4">

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${
                      log.status === "BLOCKED"
                        ? "border-red-500/20 bg-red-500/5 text-red-400"
                        : "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    }`}
                  >

                    {log.status === "BLOCKED" ? (
                      <Ban size={11} />
                    ) : (
                      <CheckCircle2 size={11} />
                    )}

                    {log.status}

                  </span>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500">

        <Database size={13} />

        {logs.length} security events recorded

        <span className="text-emerald-500">
          • Append-only mode
        </span>

      </div>

    </div>
  );
}

export default AuditLog;