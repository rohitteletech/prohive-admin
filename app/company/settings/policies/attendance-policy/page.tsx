"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AsideCard,
  Field,
  InfoTile,
  PolicyActions,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  Select,
  SnapshotRow,
  TextArea,
  TextInput,
} from "@/components/company/policy-ui";

type Mode = "draft" | "published";
type AttendanceState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  presentMarkRule: "punch_in" | "punch_in_out";
  fullDayHours: string;
  halfDayHours: string;
  graceMinutes: string;
  earlyGoMinutes: string;
  extraHoursPolicy: "yes" | "no";
  latePunchPenalty: "enabled" | "disabled";
  halfDayFormula: "0.5" | "1.0";
  presentFormula: "full_only" | "full_plus_half";
  notes: string;
};

const initialState: AttendanceState = {
  policyName: "Standard Attendance Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  presentMarkRule: "punch_in_out",
  fullDayHours: "08:00",
  halfDayHours: "04:00",
  graceMinutes: "10",
  earlyGoMinutes: "20",
  extraHoursPolicy: "yes",
  latePunchPenalty: "enabled",
  halfDayFormula: "0.5",
  presentFormula: "full_plus_half",
  notes: "Present should be calculated from final daily status after shift, leave, and holiday context have been resolved.",
};

export default function NewAttendancePolicyPage() {
  const [mode, setMode] = useState<Mode>("draft");
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);

  function update<K extends keyof AttendanceState>(key: K, value: AttendanceState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  const formulaPreview = useMemo(() => {
    if (draft.presentFormula === "full_only") return "Present Days = Full Present only";
    return `Present Days = Full Present + (Half Day x ${draft.halfDayFormula})`;
  }, [draft.presentFormula, draft.halfDayFormula]);

  return (
    <PolicyPage
      badge="Attendance Policy"
      title="Attendance Policy"
      description="Create a new standalone page for present-day logic, full day and half day rules, late and early flags, and monthly attendance formulas."
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              setDraft(initialState);
              setMode("draft");
              notify("New attendance policy draft started.");
            }}
            className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100 xl:min-w-[150px]"
          >
            Create New Policy
          </button>
          <PolicyActions onDraft={() => { setMode("draft"); notify("Attendance policy draft saved locally."); }} onPublish={() => { setMode("published"); notify("Attendance policy marked ready for backend wiring."); }} />
        </>
      }
      aside={
        <>
          <AsideCard title="Policy Snapshot" description="Preview of the day-status logic this policy is defining.">
            <SnapshotRow label="Present Trigger" value={draft.presentMarkRule === "punch_in" ? "Present starts on Punch In" : "Present starts after Punch In and Punch Out"} />
            <SnapshotRow label="Full Day" value={`Worked hours at or above ${draft.fullDayHours}`} />
            <SnapshotRow label="Half Day" value={`Worked hours at or above ${draft.halfDayHours}`} />
            <SnapshotRow label="Present Formula" value={formulaPreview} />
          </AsideCard>
          <AsideCard title="Next Policies" description="Attendance policy should stay aligned with shift, leave, and holiday rules.">
            <Link href="/company/settings/policies/leave-policy" className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Open Leave Policy
            </Link>
          </AsideCard>
        </>
      }
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}
      <PolicyRegisterSection
        description="Maintain approved attendance policies with governance dates, default applicability, and administrative ownership."
        onCreate={() => {
          setDraft(initialState);
          setMode("draft");
          notify("New attendance policy draft started.");
        }}
        onEdit={() => notify("Current attendance policy opened for editing.")}
        row={{
          name: draft.policyName,
          policyCode: "ATT-001",
          effectiveFrom: draft.effectiveDate,
          reviewDueOn: "2027-03-13",
          status: mode === "published" ? "Active" : "Draft",
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:05 AM",
          defaultPolicy: "Yes",
        }}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} tone="sky" />
        <InfoTile label="Version" value={draft.version} />
        <InfoTile label="Effective Date" value={draft.effectiveDate} />
        <InfoTile label="Formula" value={draft.presentFormula === "full_only" ? "Full Only" : "Full + Half"} tone="emerald" />
      </div>

      <PolicySection title="Daily Status Rules" description="Define how the system should evaluate presence for each working day." tone="slate">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Policy Name"><TextInput value={draft.policyName} onChange={(e) => update("policyName", e.target.value)} /></Field>
          <Field label="Effective Date"><TextInput type="date" value={draft.effectiveDate} onChange={(e) => update("effectiveDate", e.target.value)} /></Field>
          <Field label="Present Trigger">
            <Select value={draft.presentMarkRule} onChange={(e) => update("presentMarkRule", e.target.value as AttendanceState["presentMarkRule"])}>
              <option value="punch_in">Punch In</option>
              <option value="punch_in_out">Punch In + Punch Out</option>
            </Select>
          </Field>
          <Field label="Full Day Working Hours"><TextInput value={draft.fullDayHours} onChange={(e) => update("fullDayHours", e.target.value)} /></Field>
          <Field label="Half Day Minimum Hours"><TextInput value={draft.halfDayHours} onChange={(e) => update("halfDayHours", e.target.value)} /></Field>
          <Field label="Grace Period (mins)"><TextInput value={draft.graceMinutes} onChange={(e) => update("graceMinutes", e.target.value)} /></Field>
          <Field label="Early Go Buffer (mins)"><TextInput value={draft.earlyGoMinutes} onChange={(e) => update("earlyGoMinutes", e.target.value)} /></Field>
          <Field label="Extra Hr Policy">
            <Select value={draft.extraHoursPolicy} onChange={(e) => update("extraHoursPolicy", e.target.value as AttendanceState["extraHoursPolicy"])}>
              <option value="yes">Enabled</option>
              <option value="no">Disabled</option>
            </Select>
          </Field>
        </div>
      </PolicySection>

      <PolicySection title="Monthly Formula" description="Define how day status rolls up into monthly present counts.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Present Days Calculation">
            <Select value={draft.presentFormula} onChange={(e) => update("presentFormula", e.target.value as AttendanceState["presentFormula"])}>
              <option value="full_plus_half">Full Present + Half Day Value</option>
              <option value="full_only">Only Full Present</option>
            </Select>
          </Field>
          <Field label="Half Day Value">
            <Select value={draft.halfDayFormula} onChange={(e) => update("halfDayFormula", e.target.value as AttendanceState["halfDayFormula"])}>
              <option value="0.5">0.5 Day</option>
              <option value="1.0">1.0 Day</option>
            </Select>
          </Field>
          <Field label="Late Punch Penalty">
            <Select value={draft.latePunchPenalty} onChange={(e) => update("latePunchPenalty", e.target.value as AttendanceState["latePunchPenalty"])}>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Policy Notes">
            <TextArea rows={5} value={draft.notes} onChange={(e) => update("notes", e.target.value)} />
          </Field>
        </div>
      </PolicySection>
    </PolicyPage>
  );
}
