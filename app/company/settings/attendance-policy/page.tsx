"use client";

import { useMemo, useState } from "react";

type PolicyMode = "draft" | "published";

type AttendanceRuleState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  fullDayHours: string;
  halfDayHours: string;
  graceMinutes: string;
  earlyInMinutes: string;
  earlyGoMinutes: string;
  minWorkOutMinutes: string;
  latePunchPenalty: "enabled" | "disabled";
  earlyGoPenalty: "enabled" | "disabled";
  holidayPunch: "yes" | "no";
  weeklyOffPunch: "yes" | "no";
  presentFormula: "full_only" | "full_plus_half";
  halfDayFormula: "0.5" | "1.0";
  notes: string;
};

const initialState: AttendanceRuleState = {
  policyName: "Standard Attendance Policy",
  version: "v1.0",
  effectiveDate: "2026-03-12",
  fullDayHours: "08:00",
  halfDayHours: "04:00",
  graceMinutes: "10",
  earlyInMinutes: "15",
  earlyGoMinutes: "20",
  minWorkOutMinutes: "60",
  latePunchPenalty: "enabled",
  earlyGoPenalty: "enabled",
  holidayPunch: "yes",
  weeklyOffPunch: "yes",
  presentFormula: "full_plus_half",
  halfDayFormula: "0.5",
  notes:
    "Present Days should be calculated as Full Present + (Half Day x 0.5). Late Punch and Early Go should be tracked separately from final daily status.",
};

function InfoTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "sky" | "emerald";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
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

export default function CompanyAttendancePolicyPage() {
  const [mode, setMode] = useState<PolicyMode>("draft");
  const [draft, setDraft] = useState<AttendanceRuleState>(initialState);
  const [toast, setToast] = useState<string | null>(null);

  function update<K extends keyof AttendanceRuleState>(key: K, value: AttendanceRuleState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  const presentFormulaPreview = useMemo(() => {
    if (draft.presentFormula === "full_only") return "Present Days = Full Present only";
    return `Present Days = Full Present + (Half Day x ${draft.halfDayFormula})`;
  }, [draft.presentFormula, draft.halfDayFormula]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-6 pt-0 sm:px-3 lg:px-4">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.75fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                Policy Builder
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Attendance Policy</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Create a clear attendance policy for present days, half days, late punch, early go, holidays, and weekly offs.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("draft");
                  notify("Policy draft saved locally.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("published");
                  notify("Policy marked ready for backend wiring.");
                }}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Publish Layout
              </button>
            </div>
          </div>

          {toast ? (
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} tone="sky" />
            <InfoTile label="Version" value={draft.version} />
            <InfoTile label="Effective Date" value={draft.effectiveDate} />
            <InfoTile label="Formula" value={draft.presentFormula === "full_only" ? "Full Only" : "Full + Half"} tone="emerald" />
          </div>

          <div className="mt-8 space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Core Attendance Rules</h2>
                  <p className="mt-1 text-sm text-slate-600">Define how full present, half day, and work-time checks should behave.</p>
                </div>
              </div>

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

                <Field label="Full Day Working Hours" hint="Example: 08:00 means 8 hours for full present">
                  <input
                    value={draft.fullDayHours}
                    onChange={(event) => update("fullDayHours", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Half Day Minimum Hours" hint="Example: 04:00 means 4 hours minimum for half day">
                  <input
                    value={draft.halfDayHours}
                    onChange={(event) => update("halfDayHours", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Grace Period Allowed (mins)">
                  <input
                    value={draft.graceMinutes}
                    onChange={(event) => update("graceMinutes", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Minimum Work Before Punch Out (mins)">
                  <input
                    value={draft.minWorkOutMinutes}
                    onChange={(event) => update("minWorkOutMinutes", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="text-xl font-semibold text-slate-950">Punch Access and Exception Rules</h2>
              <p className="mt-1 text-sm text-slate-600">Handle early in, early go, holidays, weekly offs, and special punch conditions.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Early In Allowed (mins)">
                  <input
                    value={draft.earlyInMinutes}
                    onChange={(event) => update("earlyInMinutes", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Early Go Buffer (mins)">
                  <input
                    value={draft.earlyGoMinutes}
                    onChange={(event) => update("earlyGoMinutes", event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </Field>

                <Field label="Allow Punch On Holiday">
                  <select
                    value={draft.holidayPunch}
                    onChange={(event) => update("holidayPunch", event.target.value as AttendanceRuleState["holidayPunch"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="Allow Punch On Weekly Off">
                  <select
                    value={draft.weeklyOffPunch}
                    onChange={(event) => update("weeklyOffPunch", event.target.value as AttendanceRuleState["weeklyOffPunch"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>

                <Field label="Late Punch Penalty">
                  <select
                    value={draft.latePunchPenalty}
                    onChange={(event) => update("latePunchPenalty", event.target.value as AttendanceRuleState["latePunchPenalty"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </Field>

                <Field label="Early Go Penalty">
                  <select
                    value={draft.earlyGoPenalty}
                    onChange={(event) => update("earlyGoPenalty", event.target.value as AttendanceRuleState["earlyGoPenalty"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-xl font-semibold text-slate-950">Present Day Formula</h2>
              <p className="mt-1 text-sm text-slate-600">Decide how monthly present days should be counted in the dashboard and reports.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Present Days Calculation">
                  <select
                    value={draft.presentFormula}
                    onChange={(event) => update("presentFormula", event.target.value as AttendanceRuleState["presentFormula"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="full_plus_half">Full Present + Half Day Value</option>
                    <option value="full_only">Only Full Present Days</option>
                  </select>
                </Field>

                <Field label="Half Day Value In Present Count">
                  <select
                    value={draft.halfDayFormula}
                    onChange={(event) => update("halfDayFormula", event.target.value as AttendanceRuleState["halfDayFormula"])}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="0.5">0.5 Day</option>
                    <option value="1.0">1 Full Day</option>
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
            <p className="mt-1 text-sm text-slate-600">Quick preview of the attendance logic this page is setting up.</p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Full Present</div>
                <div className="mt-2 text-sm font-medium text-slate-800">Working hours at or above {draft.fullDayHours}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Half Day</div>
                <div className="mt-2 text-sm font-medium text-slate-800">Working hours at or above {draft.halfDayHours} but below full day hours</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Late Punch</div>
                <div className="mt-2 text-sm font-medium text-slate-800">Punch in after grace period of {draft.graceMinutes} mins</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Early Go</div>
                <div className="mt-2 text-sm font-medium text-slate-800">Punch out earlier than allowed buffer of {draft.earlyGoMinutes} mins</div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Present Day Formula</div>
            <div className="mt-3 text-2xl font-semibold leading-tight">{presentFormulaPreview}</div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This is only the UI draft. Backend calculation and mobile summary wiring can be connected after policy approval.
            </p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Checklist Before Backend</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Define daily final status values: Present, Half Day, Absent, Paid Leave, Unpaid Leave.</li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Decide whether Early Go only flags the day or changes final attendance status.</li>
              <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">Lock the monthly formula for dashboard cards before API wiring.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
