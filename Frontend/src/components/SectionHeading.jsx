import React from "react";

function SectionHeading({
  number,
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="mb-4 flex items-start gap-3">

      <div className="flex items-center gap-2">

        <span className="font-mono text-[10px] font-bold text-emerald-500">
          {number}
        </span>

        <div className="hidden h-px w-5 bg-slate-800 sm:block" />

      </div>

      <div>

        <div className="flex items-center gap-2">

          <Icon
            size={15}
            className="text-slate-400"
          />

          <h2 className="text-sm font-bold text-white">
            {title}
          </h2>

        </div>

        <p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-600">
          {description}
        </p>

      </div>

    </div>
  );
}

export default SectionHeading;