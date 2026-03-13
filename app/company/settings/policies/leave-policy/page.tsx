"use client";

import { useState } from "react";
import {
  Field,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  Select,
  TextInput,
} from "@/components/company/policy-ui";

type LeavePolicyState = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  casualLeaveDays: string;
  sickLeaveDays: string;
  earnedLeaveDays: string;
  compLeaveEnabled: "Yes" | "No";
  compLeaveValidityDays: string;
  halfDayLeaveAllowed: "Yes" | "No";
  minimumLeaveDays: string;
  maximumLeaveDays: string;
  approvalFlow: "manager" | "manager_hr" | "hr";
  noticePeriodDays: string;
  backdatedLeaveAllowed: "Yes" | "No";
  leaveOverridesAttendance: "Yes" | "No";
  sandwichLeave: "Enabled" | "Disabled";
  carryForwardEnabled: "Yes" | "No";
  maximumCarryForwardDays: string;
  carryForwardExpiryDays: string;
};

const initialState: LeavePolicyState = {
  policyName: "Standard Leave Policy",
  policyCode: "LEV-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  casualLeaveDays: "12",
  sickLeaveDays: "12",
  earnedLeaveDays: "18",
  compLeaveEnabled: "Yes",
  compLeaveValidityDays: "60",
  halfDayLeaveAllowed: "Yes",
  minimumLeaveDays: "0.5",
  maximumLeaveDays: "30",
  approvalFlow: "manager_hr",
  noticePeriodDays: "1",
  backdatedLeaveAllowed: "No",
  leaveOverridesAttendance: "Yes",
  sandwichLeave: "Disabled",
  carryForwardEnabled: "Yes",
  maximumCarryForwardDays: "10",
  carryForwardExpiryDays: "90",
};

export default function LeavePolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [showForm, setShowForm] = useState(false);

  function update<K extends keyof LeavePolicyState>(key: K, value: LeavePolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function openNewForm() {
    setDraft(initialState);
    setShowForm(true);
    notify("New leave policy form opened.");
  }

  return (
    <PolicyPage
      badge="Leave Policy"
      title="Leave Policy"
      description="Maintain company leave policy records and define entitlements, approval rules, attendance override handling, and carry-forward governance."
    >
      {toast ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
          {toast}
        </div>
      ) : null}

      <PolicyRegisterSection
        description="Maintain approved leave policies with effective governance dates, ownership, and default company applicability."
        onCreate={openNewForm}
        onEdit={() => {
          setShowForm(true);
          notify("Current leave policy opened for editing.");
        }}
        row={{
          name: draft.policyName,
          assignedWorkforce: "24 Employees",
          policyCode: draft.policyCode,
          effectiveFrom: draft.effectiveFrom,
          reviewDueOn: draft.nextReviewDate,
          status: draft.status,
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:10 AM",
          defaultPolicy: draft.defaultCompanyPolicy,
        }}
      />

      {showForm ? (
        <>
          <PolicySection
            title="Policy Details"
            description="Define the administrative identity, governance dates, and company-level applicability of this leave policy."
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
                <Select value={draft.status} onChange={(e) => update("status", e.target.value as LeavePolicyState["status"])}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </Select>
              </Field>
              <Field label="Default Company Policy">
                <Select
                  value={draft.defaultCompanyPolicy}
                  onChange={(e) => update("defaultCompanyPolicy", e.target.value as LeavePolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Leave Entitlements"
            description="Define the annual leave allocation, comp leave availability, and day-level entitlement rules under this policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Casual Leave Days">
                <TextInput value={draft.casualLeaveDays} onChange={(e) => update("casualLeaveDays", e.target.value)} />
              </Field>
              <Field label="Sick Leave Days">
                <TextInput value={draft.sickLeaveDays} onChange={(e) => update("sickLeaveDays", e.target.value)} />
              </Field>
              <Field label="Earned Leave Days">
                <TextInput value={draft.earnedLeaveDays} onChange={(e) => update("earnedLeaveDays", e.target.value)} />
              </Field>
              <Field label="Comp Leave Enabled">
                <Select value={draft.compLeaveEnabled} onChange={(e) => update("compLeaveEnabled", e.target.value as LeavePolicyState["compLeaveEnabled"])}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Comp Leave Validity (Days)">
                <TextInput value={draft.compLeaveValidityDays} onChange={(e) => update("compLeaveValidityDays", e.target.value)} />
              </Field>
              <Field label="Half Day Leave Allowed">
                <Select
                  value={draft.halfDayLeaveAllowed}
                  onChange={(e) => update("halfDayLeaveAllowed", e.target.value as LeavePolicyState["halfDayLeaveAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Minimum Leave Days">
                <TextInput value={draft.minimumLeaveDays} onChange={(e) => update("minimumLeaveDays", e.target.value)} />
              </Field>
              <Field label="Maximum Leave Days">
                <TextInput value={draft.maximumLeaveDays} onChange={(e) => update("maximumLeaveDays", e.target.value)} />
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Approval & Override Rules"
            description="Define the approval workflow and how approved leave should interact with attendance evaluation."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Approval Flow">
                <Select value={draft.approvalFlow} onChange={(e) => update("approvalFlow", e.target.value as LeavePolicyState["approvalFlow"])}>
                  <option value="manager">Manager Approval</option>
                  <option value="manager_hr">Manager + HR Approval</option>
                  <option value="hr">HR Approval</option>
                </Select>
              </Field>
              <Field label="Notice Period (Days)">
                <TextInput value={draft.noticePeriodDays} onChange={(e) => update("noticePeriodDays", e.target.value)} />
              </Field>
              <Field label="Backdated Leave Allowed">
                <Select
                  value={draft.backdatedLeaveAllowed}
                  onChange={(e) => update("backdatedLeaveAllowed", e.target.value as LeavePolicyState["backdatedLeaveAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Leave Overrides Attendance">
                <Select
                  value={draft.leaveOverridesAttendance}
                  onChange={(e) => update("leaveOverridesAttendance", e.target.value as LeavePolicyState["leaveOverridesAttendance"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Sandwich Leave">
                <Select value={draft.sandwichLeave} onChange={(e) => update("sandwichLeave", e.target.value as LeavePolicyState["sandwichLeave"])}>
                  <option value="Enabled">Enabled</option>
                  <option value="Disabled">Disabled</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Carry Forward Rules"
            description="Define whether unused leave can move into the next period and how long the carried balance should remain valid."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Carry Forward Enabled">
                <Select
                  value={draft.carryForwardEnabled}
                  onChange={(e) => update("carryForwardEnabled", e.target.value as LeavePolicyState["carryForwardEnabled"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Maximum Carry Forward Days">
                <TextInput value={draft.maximumCarryForwardDays} onChange={(e) => update("maximumCarryForwardDays", e.target.value)} />
              </Field>
              <Field label="Carry Forward Expiry (Days)">
                <TextInput value={draft.carryForwardExpiryDays} onChange={(e) => update("carryForwardExpiryDays", e.target.value)} />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => notify("Leave policy saved locally.")}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save Policy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  notify("Leave policy form closed.");
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
