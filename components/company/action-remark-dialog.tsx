"use client";

type ActionRemarkDialogProps = {
  open: boolean;
  title: string;
  description: string;
  value: string;
  confirmLabel: string;
  cancelLabel?: string;
  saving?: boolean;
  required?: boolean;
  minLength?: number;
  error?: string | null;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ActionRemarkDialog({
  open,
  title,
  description,
  value,
  confirmLabel,
  cancelLabel = "Cancel",
  saving = false,
  required = false,
  minLength = 0,
  error,
  onChange,
  onConfirm,
  onCancel,
}: ActionRemarkDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">
            Remark {required ? "*" : "(optional)"}
          </span>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={5}
            autoFocus
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
            placeholder={required ? "Write required action remark" : "Write remark for audit trail"}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{required ? `Minimum ${minLength} characters required.` : "Remark is saved with the action if provided."}</span>
            <span>{value.trim().length} chars</span>
          </div>
        </label>

        {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {saving ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
