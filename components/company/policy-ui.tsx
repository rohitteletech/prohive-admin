"use client";

import Link from "next/link";

export function PolicyPage({
  badge,
  title,
  description,
  actions,
  children,
  aside,
}: {
  badge: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const hasAside = Boolean(aside);
  return (
    <div className="w-full px-0 pb-5 pt-0 lg:pb-6">
      <div className={hasAside ? "grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start" : "grid gap-4 lg:gap-5"}>
        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                {badge}
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-[2rem]">{title}</h1>
              <p className="mt-2 text-sm leading-7 text-zinc-600">{description}</p>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[220px] xl:justify-end">{actions}</div> : null}
          </div>
          <div className="mt-6 space-y-4">{children}</div>
        </section>
        {hasAside ? <aside className="space-y-4 xl:sticky xl:top-24">{aside}</aside> : null}
      </div>
    </div>
  );
}

export function PolicySection({
  title,
  description,
  tone = "white",
  children,
}: {
  title: string;
  description: string;
  tone?: "white" | "slate";
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-300 ${tone === "slate" ? "bg-slate-50" : "bg-white"} p-4 shadow-sm sm:p-5`}>
      <h2 className="text-[15px] font-semibold text-slate-900 sm:text-base">{title}</h2>
      <p className="mt-1 text-[13px] leading-6 text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[13px] font-semibold text-slate-800">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none ${props.className || ""}`.trim()} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none ${props.className || ""}`.trim()} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-[14px] leading-6 text-slate-700 outline-none ${props.className || ""}`.trim()} />;
}

export function InfoTile({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "sky" | "emerald" }) {
  const toneClass =
    tone === "sky"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-2xl border p-3.5 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-base font-semibold">{value}</div>
    </div>
  );
}

export function AsideCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-[15px] font-semibold text-slate-900 sm:text-base">{title}</h2>
      {description ? <p className="mt-1 text-[13px] leading-6 text-slate-600">{description}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

export function PolicyActions({ onDraft, onPublish }: { onDraft: () => void; onPublish: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onDraft}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 xl:min-w-[150px]"
      >
        Save Draft
      </button>
      <button
        type="button"
        onClick={onPublish}
        className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 xl:min-w-[150px]"
      >
        Publish Layout
      </button>
    </>
  );
}

export function PolicyLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block rounded-2xl border border-slate-300 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 sm:p-5">
      <div className="text-[15px] font-semibold text-slate-900 sm:text-base">{title}</div>
      <p className="mt-2 text-[13px] leading-6 text-slate-600">{description}</p>
      <div className="mt-4 text-sm font-semibold text-sky-700">Open Policy</div>
    </Link>
  );
}

export function PolicyRegisterSection({
  title = "Policy Register",
  description,
  onCreate,
  onEdit,
  onDelete,
  rows,
  emptyState = "No policies available.",
}: {
  title?: string;
  description: string;
  onCreate: () => void;
  onEdit: (rowId: string) => void;
  onDelete?: (rowId: string) => void;
  rows: Array<{
    id: string;
    name: string;
    assignedWorkforce?: string;
    policyCode?: string;
    effectiveFrom: string;
    reviewDueOn: string;
    status: string;
    createdBy: string;
    createdOn: string;
    defaultPolicy: string;
  }>;
  emptyState?: string;
}) {
  function renderCreatedOn(value: string) {
    const parts = value.trim().split(/\s+/);
    if (parts.length < 2) return value;

    const date = parts[0];
    const time = parts.slice(1).join(" ");

    return (
      <span className="inline-flex flex-col leading-5">
        <span>{date}</span>
        <span>{time}</span>
      </span>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 sm:text-base">{title}</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-slate-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
        >
          Create New Policy
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-600 sm:text-[11px]">
            <tr>
              <th className="px-3 py-3 font-semibold">Policy Name</th>
              <th className="px-3 py-3 font-semibold">Assigned Workforce</th>
              <th className="px-3 py-3 font-semibold">Policy Code</th>
              <th className="px-3 py-3 font-semibold">Effective From</th>
              <th className="px-3 py-3 font-semibold">Next Review Date</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Created By</th>
              <th className="px-3 py-3 font-semibold">Created On</th>
              <th className="px-3 py-3 font-semibold">Default Company Policy</th>
              <th className="px-3 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white text-slate-800">
            {rows.length === 0 ? (
              <tr className="border-t border-slate-200">
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                  {emptyState}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-200">
                  <td className="px-3 py-3 font-semibold break-words">{row.name}</td>
                  <td className="px-3 py-3">{row.assignedWorkforce || "0"}</td>
                  <td className="px-3 py-3 break-words">{row.policyCode || "-"}</td>
                  <td className="px-3 py-3 break-words">{row.effectiveFrom}</td>
                  <td className="px-3 py-3 break-words">{row.reviewDueOn}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 break-words">{row.createdBy}</td>
                  <td className="px-3 py-3">{renderCreatedOn(row.createdOn)}</td>
                  <td className="px-3 py-3 break-words">{row.defaultPolicy}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(row.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {onDelete ? (
                        <button
                          type="button"
                          onClick={() => onDelete(row.id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PolicySuccessOverlay({
  message,
}: {
  message: string | null;
}) {
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4">
      <div className="w-full max-w-sm rounded-[24px] border border-emerald-200 bg-white p-6 text-center shadow-2xl">
        <div className="text-lg font-semibold text-slate-950">{message}</div>
      </div>
    </div>
  );
}

export function PolicyFormModal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/35 px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-[28px] border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close policy form"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold text-slate-600 hover:bg-slate-50"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}

export function PolicyToast({
  message,
}: {
  message: string | null;
}) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex justify-center px-4 sm:top-24">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900 shadow-lg shadow-sky-100/80"
      >
        {message}
      </div>
    </div>
  );
}

export function PolicyMessageDialog({
  message,
  tone = "sky",
  onClose,
  closeLabel = "OK",
}: {
  message: string | null;
  tone?: "sky" | "emerald";
  onClose: () => void;
  closeLabel?: string;
}) {
  if (!message) return null;

  const shellClass = tone === "emerald" ? "border-emerald-200" : "border-sky-200";
  const accentClass = tone === "emerald" ? "bg-emerald-500" : "bg-sky-500";
  const buttonClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
      : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        className={`w-full max-w-lg rounded-[28px] border ${shellClass} bg-white p-6 text-center shadow-2xl sm:p-7`}
      >
        <div className={`mx-auto h-1.5 w-16 rounded-full ${accentClass}`} />
        <div className="mt-5 text-lg font-semibold leading-8 text-slate-950 sm:text-xl">{message}</div>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${buttonClass}`}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
