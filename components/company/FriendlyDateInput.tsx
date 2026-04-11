"use client";

import { formatDisplayDate } from "@/lib/dateTime";

type FriendlyDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
};

export default function FriendlyDateInput({
  label,
  value,
  onChange,
  max,
  disabled = false,
  placeholder = "Select",
}: FriendlyDateInputProps) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <div
        className={[
          "relative overflow-hidden rounded-2xl border px-4 py-3 text-sm transition",
          disabled
            ? "border-zinc-200 bg-zinc-50 text-zinc-500"
            : "border-zinc-200 bg-white text-zinc-900 focus-within:border-zinc-300 focus-within:shadow-sm",
        ].join(" ")}
      >
        <div className="pointer-events-none flex items-center justify-between gap-3">
          <span className={value ? "text-zinc-900" : "text-zinc-500"}>
            {value ? formatDisplayDate(value) : placeholder}
          </span>
          <span className="text-zinc-400" aria-hidden="true">
            [ ]
          </span>
        </div>
        {!disabled ? (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={max}
            autoComplete="off"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        ) : null}
      </div>
    </div>
  );
}
