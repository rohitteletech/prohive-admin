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

type LeaveType = {
  id: string;
  name: string;
  code: string;
  paymentMode: "Paid" | "Unpaid";
  annualQuota: string;
  halfDayAllowed: "Yes" | "No";
  minimumDays: string;
  maximumDays: string;
  accrualRule: "Yearly Upfront" | "Monthly Accrual" | "Quarterly Accrual" | "Manual Credit Only";
  carryForwardAllowed: "Yes" | "No";
};

type LeavePolicyState = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  approvalFlow: "manager" | "manager_hr" | "hr";
  noticePeriodDays: string;
  backdatedLeaveAllowed: "Yes" | "No";
  leaveOverridesAttendance: "Yes" | "No";
  sandwichLeave: "Enabled" | "Disabled";
  carryForwardEnabled: "Yes" | "No";
  maximumCarryForwardDays: string;
  carryForwardExpiryDays: string;
};

const initialPolicyState: LeavePolicyState = {
  policyName: "Standard Leave Policy",
  policyCode: "LEV-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  approvalFlow: "manager_hr",
  noticePeriodDays: "1",
  backdatedLeaveAllowed: "No",
  leaveOverridesAttendance: "Yes",
  sandwichLeave: "Disabled",
  carryForwardEnabled: "Yes",
  maximumCarryForwardDays: "10",
  carryForwardExpiryDays: "90",
};

const initialLeaveTypes: LeaveType[] = [
  {
    id: "casual",
    name: "Casual Leave",
    code: "CL",
    paymentMode: "Paid",
    annualQuota: "12",
    halfDayAllowed: "Yes",
    minimumDays: "0.5",
    maximumDays: "6",
    accrualRule: "Yearly Upfront",
    carryForwardAllowed: "No",
  },
  {
    id: "sick",
    name: "Sick Leave",
    code: "SL",
    paymentMode: "Paid",
    annualQuota: "12",
    halfDayAllowed: "Yes",
    minimumDays: "0.5",
    maximumDays: "12",
    accrualRule: "Yearly Upfront",
    carryForwardAllowed: "No",
  },
  {
    id: "earned",
    name: "Earned Leave",
    code: "EL",
    paymentMode: "Paid",
    annualQuota: "18",
    halfDayAllowed: "Yes",
    minimumDays: "1",
    maximumDays: "30",
    accrualRule: "Monthly Accrual",
    carryForwardAllowed: "Yes",
  },
  {
    id: "comp",
    name: "Comp Leave",
    code: "COMP",
    paymentMode: "Paid",
    annualQuota: "0",
    halfDayAllowed: "No",
    minimumDays: "1",
    maximumDays: "5",
    accrualRule: "Manual Credit Only",
    carryForwardAllowed: "No",
  },
];

function createBlankLeaveType(): LeaveType {
  return {
    id: `leave-${Date.now()}`,
    name: "",
    code: "",
    paymentMode: "Paid",
    annualQuota: "",
    halfDayAllowed: "No",
    minimumDays: "1",
    maximumDays: "",
    accrualRule: "Yearly Upfront",
    carryForwardAllowed: "No",
  };
}

export default function LeavePolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialPolicyState);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>(initialLeaveTypes);
  const [showForm, setShowForm] = useState(false);

  function updatePolicy<K extends keyof LeavePolicyState>(key: K, value: LeavePolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateLeaveType(id: string, key: keyof LeaveType, value: string) {
    setLeaveTypes((current) =>
      current.map((leaveType) => (leaveType.id === id ? { ...leaveType, [key]: value } : leaveType)),
    );
  }

  function addLeaveType() {
    setLeaveTypes((current) => [...current, createBlankLeaveType()]);
    notify("New leave type row added.");
  }

  function removeLeaveType(id: string) {
    setLeaveTypes((current) => current.filter((leaveType) => leaveType.id !== id));
    notify("Leave type removed from draft.");
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function openNewForm() {
    setDraft(initialPolicyState);
    setLeaveTypes(initialLeaveTypes);
    setShowForm(true);
    notify("New leave policy form opened.");
  }

  return (
    <PolicyPage
      badge="Leave Policy"
      title="Leave Policy"
      description="Maintain company leave policy records and define leave types, approval rules, attendance override handling, and carry-forward governance."
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
                <TextInput value={draft.policyName} onChange={(e) => updatePolicy("policyName", e.target.value)} />
              </Field>
              <Field label="Policy Code">
                <TextInput value={draft.policyCode} onChange={(e) => updatePolicy("policyCode", e.target.value)} />
              </Field>
              <Field label="Effective From">
                <TextInput type="date" value={draft.effectiveFrom} onChange={(e) => updatePolicy("effectiveFrom", e.target.value)} />
              </Field>
              <Field label="Next Review Date">
                <TextInput type="date" value={draft.nextReviewDate} onChange={(e) => updatePolicy("nextReviewDate", e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={draft.status} onChange={(e) => updatePolicy("status", e.target.value as LeavePolicyState["status"])}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </Select>
              </Field>
              <Field label="Default Company Policy">
                <Select
                  value={draft.defaultCompanyPolicy}
                  onChange={(e) => updatePolicy("defaultCompanyPolicy", e.target.value as LeavePolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Leave Type Register"
            description="Define each leave type under this policy, including quota, payment mode, accrual rule, and day-level usage conditions."
          >
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={addLeaveType}
                className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
              >
                Add Leave Type
              </button>
            </div>

            <div className="space-y-4">
              {leaveTypes.map((leaveType, index) => (
                <div key={leaveType.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Leave Type {index + 1}</div>
                      <div className="text-xs text-slate-500">Configure leave entitlement, accrual, and usage controls.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLeaveType(leaveType.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Leave Type Name">
                      <TextInput value={leaveType.name} onChange={(e) => updateLeaveType(leaveType.id, "name", e.target.value)} />
                    </Field>
                    <Field label="Leave Code">
                      <TextInput value={leaveType.code} onChange={(e) => updateLeaveType(leaveType.id, "code", e.target.value)} />
                    </Field>
                    <Field label="Paid / Unpaid">
                      <Select value={leaveType.paymentMode} onChange={(e) => updateLeaveType(leaveType.id, "paymentMode", e.target.value)}>
                        <option value="Paid">Paid</option>
                        <option value="Unpaid">Unpaid</option>
                      </Select>
                    </Field>
                    <Field label="Annual Quota">
                      <TextInput value={leaveType.annualQuota} onChange={(e) => updateLeaveType(leaveType.id, "annualQuota", e.target.value)} />
                    </Field>
                    <Field label="Half Day Allowed">
                      <Select value={leaveType.halfDayAllowed} onChange={(e) => updateLeaveType(leaveType.id, "halfDayAllowed", e.target.value)}>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </Select>
                    </Field>
                    <Field label="Minimum Days">
                      <TextInput value={leaveType.minimumDays} onChange={(e) => updateLeaveType(leaveType.id, "minimumDays", e.target.value)} />
                    </Field>
                    <Field label="Maximum Days">
                      <TextInput value={leaveType.maximumDays} onChange={(e) => updateLeaveType(leaveType.id, "maximumDays", e.target.value)} />
                    </Field>
                    <Field label="Accrual Rule">
                      <Select value={leaveType.accrualRule} onChange={(e) => updateLeaveType(leaveType.id, "accrualRule", e.target.value)}>
                        <option value="Yearly Upfront">Yearly Upfront</option>
                        <option value="Monthly Accrual">Monthly Accrual</option>
                        <option value="Quarterly Accrual">Quarterly Accrual</option>
                        <option value="Manual Credit Only">Manual Credit Only</option>
                      </Select>
                    </Field>
                    <Field label="Carry Forward Allowed">
                      <Select
                        value={leaveType.carryForwardAllowed}
                        onChange={(e) => updateLeaveType(leaveType.id, "carryForwardAllowed", e.target.value)}
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </Select>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </PolicySection>

          <PolicySection
            title="Approval & Override Rules"
            description="Define the approval workflow and how approved leave should interact with attendance evaluation."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Approval Flow">
                <Select value={draft.approvalFlow} onChange={(e) => updatePolicy("approvalFlow", e.target.value as LeavePolicyState["approvalFlow"])}>
                  <option value="manager">Manager Approval</option>
                  <option value="manager_hr">Manager + HR Approval</option>
                  <option value="hr">HR Approval</option>
                </Select>
              </Field>
              <Field label="Notice Period (Days)">
                <TextInput value={draft.noticePeriodDays} onChange={(e) => updatePolicy("noticePeriodDays", e.target.value)} />
              </Field>
              <Field label="Backdated Leave Allowed">
                <Select
                  value={draft.backdatedLeaveAllowed}
                  onChange={(e) => updatePolicy("backdatedLeaveAllowed", e.target.value as LeavePolicyState["backdatedLeaveAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Leave Overrides Attendance">
                <Select
                  value={draft.leaveOverridesAttendance}
                  onChange={(e) => updatePolicy("leaveOverridesAttendance", e.target.value as LeavePolicyState["leaveOverridesAttendance"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Sandwich Leave">
                <Select value={draft.sandwichLeave} onChange={(e) => updatePolicy("sandwichLeave", e.target.value as LeavePolicyState["sandwichLeave"])}>
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
                  onChange={(e) => updatePolicy("carryForwardEnabled", e.target.value as LeavePolicyState["carryForwardEnabled"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Maximum Carry Forward Days">
                <TextInput value={draft.maximumCarryForwardDays} onChange={(e) => updatePolicy("maximumCarryForwardDays", e.target.value)} />
              </Field>
              <Field label="Carry Forward Expiry (Days)">
                <TextInput value={draft.carryForwardExpiryDays} onChange={(e) => updatePolicy("carryForwardExpiryDays", e.target.value)} />
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
