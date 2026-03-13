"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PolicyMode = "draft" | "published";

type CorrectionPolicyState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  correctionWindowDays: string;
  allowMissingPunchCorrection: "yes" | "no";
  allowBackdatedRequests: "yes" | "no";
  managerApprovalRequired: "yes" | "no";
  hrApprovalRequired: "yes" | "no";
  maxRequestsPerMonth: string;
  reasonMandatory: "yes" | "no";
  attachmentRequired: "yes" | "no";
  regularizationAffectsAttendance: "yes" | "no";
  notes: string;
};

const initialState: CorrectionPolicyState = {
  policyName: "Standard Correction Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  correctionWindowDays: "7",
  allowMissingPunchCorrection: "yes",
  allowBackdatedRequests: "yes",
  managerApprovalRequired: "yes",
  hrApprovalRequired: "no",
  maxRequestsPerMonth: "3",
  reasonMandatory: "yes",
  attachmentRequired: "no",
  regularizationAffectsAttendance: "yes",
  notes:
    "Correction requests should be used for missing punches and genuine attendance mismatches. Approved regularization should update final daily attendance.",
};

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Field({
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

export default function CompanyCorrectionRegularizationPolicyPage() {
  const [mode, setMode] = useState<PolicyMode>("draft");
  const [draft, setDraft] = useState<CorrectionPolicyState>(initialState);
  const [toast, setToast] = useState<string | null>(null);

  function update<K extends keyof CorrectionPolicyState>(key: K, value: CorrectionPolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  const approvalFlow = useMemo(() => {
    if (draft.managerApprovalRequired === "yes" && draft.hrApprovalRequired === "yes") return "Manager + HR approval required";
    if (draft.managerApprovalRequired === "yes") return "Manager approval required";
    if (draft.hrApprovalRequired === "yes") return "HR approval required";
    return "No approval required";
  }, [draft.managerApprovalRequired, draft.hrApprovalRequired]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-6 pt-0 sm:px-3 lg:px-4">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.75fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                Policy Builder
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Correction / Regularization Policy</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Define how missing punches, late regularization, backdated requests, and approval workflow should behave.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("draft");
                  notify("Correction policy draft saved locally.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("published");
                  notify("Correction policy marked ready for backend wiring.");
                }}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Publish Layout
              </button>
            </div>
          </div>

          {toast ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{toast}</div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} />
            <InfoTile label="Version" value={draft.version} />
            <InfoTile label="Effective Date" value={draft.effectiveDate} />
            <InfoTile label="Window" value={`${draft.correctionWindowDays} days`} />
          </div>

          <div className="mt-8 space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-xl font-semibold text-slate-950">Core Regularization Rules</h2>
              <p className="mt-1 text-sm text-slate-600">Set correction request scope, request limits, and attendance impact.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Policy Name">
                  <input
                    value={draft.policyName}
                    onChange={(event) => update("policyName", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Effective Date">
                  <input
                    type="date"
                    value={draft.effectiveDate}
                    onChange={(event) => update("effectiveDate", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Correction Window (days)" hint="How many days after attendance date an employee can raise a correction.">
                  <input
                    value={draft.correctionWindowDays}
                    onChange={(event) => update("correctionWindowDays", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Maximum Requests Per Month">
                  <input
                    value={draft.maxRequestsPerMonth}
                    onChange={(event) => update("maxRequestsPerMonth", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Allow Missing Punch Correction">
                  <select
                    value={draft.allowMissingPunchCorrection}
                    onChange={(event) => update("allowMissingPunchCorrection", event.target.value as CorrectionPolicyState["allowMissingPunchCorrection"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="Allow Backdated Requests">
                  <select
                    value={draft.allowBackdatedRequests}
                    onChange={(event) => update("allowBackdatedRequests", event.target.value as CorrectionPolicyState["allowBackdatedRequests"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="Reason Mandatory">
                  <select
                    value={draft.reasonMandatory}
                    onChange={(event) => update("reasonMandatory", event.target.value as CorrectionPolicyState["reasonMandatory"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="Attachment Required">
                  <select
                    value={draft.attachmentRequired}
                    onChange={(event) => update("attachmentRequired", event.target.value as CorrectionPolicyState["attachmentRequired"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="text-xl font-semibold text-slate-950">Approval Workflow</h2>
              <p className="mt-1 text-sm text-slate-600">Define who reviews requests before attendance gets regularized.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Manager Approval Required">
                  <select
                    value={draft.managerApprovalRequired}
                    onChange={(event) => update("managerApprovalRequired", event.target.value as CorrectionPolicyState["managerApprovalRequired"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="HR Approval Required">
                  <select
                    value={draft.hrApprovalRequired}
                    onChange={(event) => update("hrApprovalRequired", event.target.value as CorrectionPolicyState["hrApprovalRequired"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="Approved Regularization Updates Attendance">
                  <select
                    value={draft.regularizationAffectsAttendance}
                    onChange={(event) => update("regularizationAffectsAttendance", event.target.value as CorrectionPolicyState["regularizationAffectsAttendance"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>

              <label className="mt-5 grid gap-2">
                <span className="text-sm font-semibold text-slate-800">Policy Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  rows={5}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none"
                />
              </label>
            </section>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Policy Snapshot</h2>
            <p className="mt-1 text-sm text-slate-600">Quick preview of how correction and regularization flow should work.</p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Request Window</div>
                <div className="mt-2 text-sm font-medium text-slate-800">Employees can request correction within {draft.correctionWindowDays} days</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Missing Punch</div>
                <div className="mt-2 text-sm font-medium text-slate-800">
                  {draft.allowMissingPunchCorrection === "yes" ? "Missing punch correction is allowed" : "Missing punch correction is blocked"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Approval Flow</div>
                <div className="mt-2 text-sm font-medium text-slate-800">{approvalFlow}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Attendance Impact</div>
                <div className="mt-2 text-sm font-medium text-slate-800">
                  {draft.regularizationAffectsAttendance === "yes"
                    ? "Approved regularization updates final attendance"
                    : "Approved regularization stays as audit-only action"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Operations Link</div>
            <div className="mt-3 text-2xl font-semibold leading-tight">Policy rules here, approval queue in Corrections.</div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Use the correction queue for approvals, and this page for defining the rules behind those approvals.
            </p>
            <Link
              href="/company/corrections"
              className="mt-4 inline-flex rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open Corrections Queue
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
