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
    <div className="mx-auto max-w-6xl px-3 pb-6 pt-0 sm:px-4 lg:px-5">
      <div className={hasAside ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start" : "grid gap-4"}>
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                {badge}
              </span>
              <h1 className="mt-3 text-[2rem] font-bold tracking-tight text-slate-950">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[220px] xl:justify-end">{actions}</div> : null}
          </div>
          <div className="mt-6 space-y-5">{children}</div>
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
    <section className={`rounded-[22px] border border-slate-200 ${tone === "slate" ? "bg-slate-50" : "bg-white"} p-4 sm:p-5`}>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ${props.className || ""}`.trim()} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ${props.className || ""}`.trim()} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 outline-none ${props.className || ""}`.trim()} />;
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
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
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
    <Link href={href} className="block rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 sm:p-5">
      <div className="text-lg font-semibold text-slate-950">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
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
}) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
        >
          Create New Policy
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-[11px] uppercase tracking-[0.14em] text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Policy Name</th>
              <th className="px-4 py-3 font-semibold">Assigned Workforce</th>
              <th className="px-4 py-3 font-semibold">Policy Code</th>
              <th className="px-4 py-3 font-semibold">Effective From</th>
              <th className="px-4 py-3 font-semibold">Next Review Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created By</th>
              <th className="px-4 py-3 font-semibold">Created On</th>
              <th className="px-4 py-3 font-semibold">Default Company Policy</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white text-slate-800">
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-4 py-3 font-semibold">{row.name}</td>
                <td className="px-4 py-3">{row.assignedWorkforce || "0 Employees"}</td>
                <td className="px-4 py-3">{row.policyCode || "-"}</td>
                <td className="px-4 py-3">{row.effectiveFrom}</td>
                <td className="px-4 py-3">{row.reviewDueOn}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">{row.createdBy}</td>
                <td className="px-4 py-3">{row.createdOn}</td>
                <td className="px-4 py-3">{row.defaultPolicy}</td>
                <td className="px-4 py-3 text-right">
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
            ))}
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
