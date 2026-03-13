"use client";

import { useMemo, useState } from "react";
import {
  Field,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  Select,
  TextInput,
} from "@/components/company/policy-ui";

type ShiftPolicyState = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  shiftName: string;
  shiftType: string;
  shiftStructure: "fixed" | "rotational";
  shiftStartTime: string;
  shiftEndTime: string;
  loginAccessRule: "any_time" | "shift_time_only";
  earlyInAllowed: string;
  gracePeriod: string;
  minimumWorkBeforePunchOut: string;
};

const initialState: ShiftPolicyState = {
  policyName: "Standard Shift Policy",
  policyCode: "SFT-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  shiftName: "General Shift",
  shiftType: "General",
  shiftStructure: "fixed",
  shiftStartTime: "09:00",
  shiftEndTime: "18:00",
  loginAccessRule: "any_time",
  earlyInAllowed: "15",
  gracePeriod: "10",
  minimumWorkBeforePunchOut: "60",
};

function formatShiftDuration(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return "-";

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  const diff = endTotal >= startTotal ? endTotal - startTotal : 24 * 60 - startTotal + endTotal;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function NewShiftPolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [showForm, setShowForm] = useState(false);
  const assignedWorkforceCount = 24;

  const shiftDuration = useMemo(
    () => formatShiftDuration(draft.shiftStartTime, draft.shiftEndTime),
    [draft.shiftStartTime, draft.shiftEndTime]
  );

  function update<K extends keyof ShiftPolicyState>(key: K, value: ShiftPolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function startNewPolicy() {
    setDraft(initialState);
    setShowForm(true);
    notify("New shift policy form opened.");
  }

  return (
    <PolicyPage
      badge="Shift Policy"
      title="Shift Policy"
      description="Maintain company shift policy records and create structured shift policies with effective governance dates and default applicability."
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}

      <PolicyRegisterSection
        description="Maintain approved shift policy records with effective dates, review checkpoints, ownership, and default company applicability."
        onCreate={startNewPolicy}
        onEdit={() => {
          setShowForm(true);
          notify("Current shift policy opened for editing.");
        }}
        onDelete={() => {
          if (assignedWorkforceCount > 0) {
            notify("This policy is currently assigned to employees. Reassign the workforce to another policy before deletion.");
            return;
          }
          notify("Shift policy can now be deleted.");
        }}
        row={{
          name: draft.policyName,
          assignedWorkforce: `${assignedWorkforceCount} Employees`,
          policyCode: draft.policyCode,
          effectiveFrom: draft.effectiveFrom,
          reviewDueOn: draft.nextReviewDate,
          status: draft.status,
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:00 AM",
          defaultPolicy: draft.defaultCompanyPolicy,
        }}
      />

      {showForm ? (
        <>
          <PolicySection
            title="Policy Details"
            description="Define the administrative identity, governance dates, and company-level applicability of this shift policy."
            tone="slate"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Policy Name">
                <TextInput value={draft.policyName} onChange={(e) => update("policyName", e.target.value)} />
              </Field>
              <Field label="Policy Code">
                <TextInput value={draft.policyCode} onChange={(e) => update("policyCode", e.target.value)} />
              </Field>
              <Field label="Effective From">
                <TextInput type="date" value={draft.effectiveFrom} onChange={(e) => update("effectiveFrom", e.target.value)} />
              </Field>
              <Field label="Next Review Date">
                <TextInput type="date" value={draft.nextReviewDate} onChange={(e) => update("nextReviewDate", e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => update("status", e.target.value as ShiftPolicyState["status"])}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </Select>
              </Field>
              <Field label="Default Company Policy">
                <Select
                  value={draft.defaultCompanyPolicy}
                  onChange={(e) => update("defaultCompanyPolicy", e.target.value as ShiftPolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Shift Definition"
            description="Define the operational structure, shift name, type, and standard working window for this policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Shift Name">
                <TextInput value={draft.shiftName} onChange={(e) => update("shiftName", e.target.value)} />
              </Field>
              <Field label="Shift Type">
                <TextInput value={draft.shiftType} onChange={(e) => update("shiftType", e.target.value)} />
              </Field>
              <Field label="Shift Structure">
                <Select
                  value={draft.shiftStructure}
                  onChange={(e) => update("shiftStructure", e.target.value as ShiftPolicyState["shiftStructure"])}
                >
                  <option value="fixed">Fixed Shift</option>
                  <option value="rotational">Rotational Shift</option>
                </Select>
              </Field>
              <Field label="Shift Duration">
                <TextInput value={shiftDuration} readOnly />
              </Field>
              <Field label="Shift Start Time">
                <TextInput type="time" value={draft.shiftStartTime} onChange={(e) => update("shiftStartTime", e.target.value)} />
              </Field>
              <Field label="Shift End Time">
                <TextInput type="time" value={draft.shiftEndTime} onChange={(e) => update("shiftEndTime", e.target.value)} />
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Punch Access Rules"
            description="Define punch access governance and threshold controls applicable to this shift policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Login Access Rule">
                <Select
                  value={draft.loginAccessRule}
                  onChange={(e) => update("loginAccessRule", e.target.value as ShiftPolicyState["loginAccessRule"])}
                >
                  <option value="any_time">Allow Login Any Time</option>
                  <option value="shift_time_only">Allow Login Only During Shift Time</option>
                </Select>
              </Field>
              <Field label="Early In Allowed (mins)">
                <TextInput value={draft.earlyInAllowed} onChange={(e) => update("earlyInAllowed", e.target.value)} />
              </Field>
              <Field label="Grace Period (mins)">
                <TextInput value={draft.gracePeriod} onChange={(e) => update("gracePeriod", e.target.value)} />
              </Field>
              <Field label="Minimum Work Before Punch Out (mins)">
                <TextInput value={draft.minimumWorkBeforePunchOut} onChange={(e) => update("minimumWorkBeforePunchOut", e.target.value)} />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => notify("Shift policy saved locally.")}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save Policy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  notify("Shift policy form closed.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </PolicySection>
        </>
      ) : null}
    </PolicyPage>
  );
}
