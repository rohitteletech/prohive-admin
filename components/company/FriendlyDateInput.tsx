"use client";

import { useRef } from "react";
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  }

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <div
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        className={[
          "relative overflow-hidden rounded-2xl border px-4 py-3 text-sm transition",
          disabled
            ? "border-zinc-200 bg-zinc-50 text-zinc-500"
            : "cursor-pointer border-zinc-200 bg-white text-zinc-900 focus-within:border-zinc-300 focus-within:shadow-sm focus:outline-none",
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
            ref={inputRef}
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            max={max}
            autoComplete="off"
            className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
            aria-label={label}
            tabIndex={-1}
          />
        ) : null}
      </div>
    </div>
  );
}
