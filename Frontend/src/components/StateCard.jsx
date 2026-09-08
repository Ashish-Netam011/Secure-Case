import React from "react";

function StateCard({
  icon: Icon,
  label,
  value,
  sub,
  iconClass,
}) {
  return (
    <div className="glass rounded-xl p-4 transition hover:border-slate-700">

      <div className="flex items-start justify-between gap-3">

        <div>

          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
            {label}
          </p>

          <p className="mt-2 text-lg font-bold text-white">
            {value}
          </p>

          <p className="mt-0.5 text-[9px] text-slate-600">
            {sub}
          </p>

        </div>

        <Icon
          size={18}
          className={iconClass}
        />

      </div>

    </div>
  );
}

export default StateCard;