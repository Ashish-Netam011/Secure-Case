import { useState } from "react";
import {
  Sparkles,
  ScanSearch,
  RefreshCw,
  Shield,
  Ban,
} from "lucide-react";

import { redactPII } from "../utils/pii";

function PIIRedaction({
  verified,
  onLog,
}) {
  const [text, setText] = useState(
    "Investigating Officer Sharma interviewed suspect Rohit Varma at location. Contact: +91 98765 43210. Aadhaar: 4321 8765 9812. Email: rohit.v@example.com"
  );

  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);

  async function runRedaction() {
    if (!verified) {
      alert(
        "Officer verification required before running PII engine."
      );

      return;
    }

    setRunning(true);
    setResult("");

    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );

    const output = redactPII(text);

    setResult(output.text);
    setCount(output.found.length);

    onLog?.(
      `PII Redaction Engine executed • ${output.found.length} sensitive fields protected`
    );

    setRunning(false);
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">

      {}

      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center">

        <div className="flex items-center gap-3">

          <div className="rounded-lg bg-indigo-500/10 p-2">
            <ScanSearch
              size={17}
              className="text-indigo-400"
            />
          </div>

          <div>

            <p className="text-xs font-semibold text-white">
              Privacy Analysis Workspace
            </p>

            <p className="text-[10px] text-slate-500">
              PII pattern recognition engine
            </p>

          </div>

        </div>

        <button
          onClick={runRedaction}
          disabled={running}
          className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
        >

          {running ? (
            <>
              <RefreshCw
                size={14}
                className="animate-spin"
              />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Run PII Redaction
            </>
          )}

        </button>

      </div>

      {}

      <div className="grid lg:grid-cols-2">

        {}

        <div className="border-b border-slate-800 lg:border-b-0 lg:border-r">

          <div className="border-b border-slate-800 px-4 py-3">

            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Raw Investigation Record
            </span>

          </div>

          <textarea
            value={text}
            onChange={(e) =>
              setText(e.target.value)
            }
            className="min-h-[300px] w-full resize-none bg-slate-950/30 p-5 font-mono text-xs leading-7 text-slate-300 outline-none"
          />

        </div>

        {}

        <div>

          <div className="border-b border-slate-800 px-4 py-3">

            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Redacted Output
            </span>

          </div>

          <div className="min-h-[300px] bg-slate-950/20 p-5">

            {running ? (

              <div className="flex min-h-[260px] flex-col items-center justify-center">

                <RefreshCw
                  size={28}
                  className="mb-4 animate-spin text-indigo-400"
                />

                <p className="text-xs text-indigo-300">
                  Scanning sensitive information...
                </p>

              </div>

            ) : result ? (

              <div className="font-mono text-xs leading-8 text-slate-300">

                <RedactedText text={result} />

              </div>

            ) : (

              <div className="flex min-h-[260px] flex-col items-center justify-center text-center">

                <Shield
                  size={27}
                  className="mb-3 text-slate-700"
                />

                <p className="text-xs text-slate-500">
                  Protected output will appear here
                </p>

              </div>

            )}

          </div>

        </div>

      </div>

      {}

      <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-3">

        <div className="flex flex-wrap items-center gap-2">

          <span className="text-[10px] text-slate-500">
            Detection patterns:
          </span>

          <Tag text="PHONE" />
          <Tag text="AADHAAR" />
          <Tag text="EMAIL" />

          {count > 0 && (
            <span className="ml-auto text-[10px] text-emerald-400">
              {count} sensitive value(s) protected
            </span>
          )}

        </div>

      </div>

    </div>
  );
}

function Tag({ text }) {
  return (
    <span className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1 text-[9px] font-bold text-red-400">
      {text}
    </span>
  );
}

function RedactedText({ text }) {
  const parts = text.split(
    /(\[REDACTED_PHONE\]|\[REDACTED_AADHAAR\]|\[REDACTED_EMAIL\])/g
  );

  return (
    <>
      {parts.map((part, index) => {

        if (!part.startsWith("[REDACTED_")) {
          return (
            <span key={index}>
              {part}
            </span>
          );
        }

        return (
          <span
            key={index}
            className="mx-1 inline-flex rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400"
          >
            <Ban
              size={10}
              className="mr-1.5"
            />

            {part}

          </span>
        );
      })}
    </>
  );
}

export default PIIRedaction;