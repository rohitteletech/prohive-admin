"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  Field,
  PolicyFormModal,
  PolicyDisabledFieldValue,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  PolicySuccessOverlay,
  Select,
  TextInput,
} from "@/components/company/policy-ui";
import { formatDisplayDateTime } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type LeaveType = {
  id: string;
  name: string;
  code: string;
  paymentMode: "Paid" | "Unpaid";
  annualQuota: string;
  halfDayAllowed: "Yes" | "No";
  accrualRule: "Yearly Upfront" | "Monthly Accrual";
  carryForwardAllowed: "Yes" | "No";
  maximumCarryForwardDays: string;
  carryForwardExpiryDays: string;
};

type LeavePolicyState = {
  policyId: string;
  policyName: string;
  policyCode: string;
  createdAt?: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  leaveCycleType: "Calendar Year" | "Financial Year";
  approvalFlow: "manager" | "manager_hr" | "hr";
  noticePeriodDays: string;
  backdatedLeaveAllowed: "Yes" | "No";
  maximumBackdatedLeaveDays: string;
  ifEmployeePunchesOnApprovedLeave: "Allow Punch and Send for Approval" | "Keep Leave" | "Block Punch";
  sandwichLeave: "Enabled" | "Disabled";
};

const initialPolicyState: LeavePolicyState = {
  policyId: "",
  policyName: "Standard Leave Policy",
  policyCode: "LEV-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  leaveCycleType: "Calendar Year",
  approvalFlow: "manager_hr",
  noticePeriodDays: "1",
  backdatedLeaveAllowed: "No",
  maximumBackdatedLeaveDays: "5",
  ifEmployeePunchesOnApprovedLeave: "Allow Punch and Send for Approval",
  sandwichLeave: "Disabled",
};

function createNewPolicyDraft(): LeavePolicyState {
  return {
    ...initialPolicyState,
    policyName: "",
    policyCode: "",
    defaultCompanyPolicy: "No",
  };
}

const initialLeaveTypes: LeaveType[] = [
  {
    id: "casual",
    name: "Casual Leave",
    code: "CL",
    paymentMode: "Paid",
    annualQuota: "12",
    halfDayAllowed: "Yes",
    accrualRule: "Yearly Upfront",
    carryForwardAllowed: "No",
    maximumCarryForwardDays: "0",
    carryForwardExpiryDays: "0",
  },
  {
    id: "sick",
    name: "Sick Leave",
    code: "SL",
    paymentMode: "Paid",
    annualQuota: "12",
    halfDayAllowed: "Yes",
    accrualRule: "Yearly Upfront",
    carryForwardAllowed: "No",
    maximumCarryForwardDays: "0",
    carryForwardExpiryDays: "0",
  },
  {
    id: "earned",
    name: "Earned Leave",
    code: "EL",
    paymentMode: "Paid",
    annualQuota: "18",
    halfDayAllowed: "Yes",
    accrualRule: "Monthly Accrual",
    carryForwardAllowed: "Yes",
    maximumCarryForwardDays: "10",
    carryForwardExpiryDays: "90",
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
    accrualRule: "Yearly Upfront",
    carryForwardAllowed: "No",
    maximumCarryForwardDays: "0",
    carryForwardExpiryDays: "0",
  };
}

export default function LeavePolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialPolicyState);
  const [savedPolicies, setSavedPolicies] = useState<LeavePolicyState[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>(initialLeaveTypes);
  const [savedLeaveTypes, setSavedLeaveTypes] = useState<LeaveType[]>(initialLeaveTypes);
  const [savedLeaveTypesByPolicy, setSavedLeaveTypesByPolicy] = useState<Record<string, LeaveType[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    if (leaveTypes.length <= 1) {
      notify("At least one leave type is required in the policy.");
      return;
    }
    setLeaveTypes((current) => current.filter((leaveType) => leaveType.id !== id));
    notify("Leave type removed from draft.");
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 1800);
  }

  async function accessToken() {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    return sessionResult?.data.session?.access_token || "";
  }

  async function loadLeaveBridge() {
    const token = await accessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/company/policies/leave-bridge", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<LeavePolicyState> & {
      leaveTypes?: LeaveType[];
      error?: string;
    };
    if (!response.ok) {
      notify(result.error || "Unable to load leave policy.");
      setLoading(false);
      return;
    }

    const { leaveTypes: nextLeaveTypes, ...policy } = result;
    const nextPolicy = { ...initialPolicyState, ...policy };
    setDraft(nextPolicy);
    if (Array.isArray(nextLeaveTypes) && nextLeaveTypes.length > 0) {
      setLeaveTypes(nextLeaveTypes);
      setSavedLeaveTypes(nextLeaveTypes);
    }
    const policiesResponse = await fetch("/api/company/policies?policy_type=leave", {
      headers: { authorization: `Bearer ${token}` },
    });
    const assignmentsResponse = await fetch("/api/company/policy-assignments", {
      headers: { authorization: `Bearer ${token}` },
    });
    const policiesResult = (await policiesResponse.json().catch(() => ({}))) as {
      policies?: Array<{
        id: string;
        policyName: string;
        policyCode: string;
        effectiveFrom: string;
        nextReviewDate: string;
        status: string;
        isDefault: boolean;
        createdAt?: string;
        configJson?: Record<string, unknown>;
      }>;
    };
    const assignmentsResult = (await assignmentsResponse.json().catch(() => ({}))) as {
      assignments?: Array<{ policyId: string; isActive: boolean }>;
      workforceCounts?: { byPolicyType?: { leave?: Record<string, number> } };
    };
    const loadedPolicies =
      Array.isArray(policiesResult.policies) && policiesResult.policies.length > 0
        ? policiesResult.policies.map((policyRow) => {
          const config = (policyRow.configJson || {}) as Partial<LeavePolicyState> & { leaveTypes?: LeaveType[] };
            return {
              ...initialPolicyState,
              ...config,
              policyId: policyRow.id,
              createdAt: String(policyRow.createdAt || ""),
              policyName: String(config.policyName || policyRow.policyName || ""),
              policyCode: String(config.policyCode || policyRow.policyCode || ""),
              effectiveFrom: String(config.effectiveFrom || policyRow.effectiveFrom || initialPolicyState.effectiveFrom),
              nextReviewDate: String(config.nextReviewDate || policyRow.nextReviewDate || initialPolicyState.nextReviewDate),
              status: policyRow.status === "active" ? "Active" : policyRow.status === "archived" ? "Archived" : "Draft",
              defaultCompanyPolicy: policyRow.isDefault ? "Yes" : "No",
            } satisfies LeavePolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    const nextAssignedCounts = assignmentsResult.workforceCounts?.byPolicyType?.leave || {};
    setAssignedCounts(nextAssignedCounts);
    setSavedLeaveTypesByPolicy(
      Object.fromEntries(
        (Array.isArray(policiesResult.policies) ? policiesResult.policies : []).map((policyRow) => {
          const config = (policyRow.configJson || {}) as { leaveTypes?: LeaveType[] };
          return [policyRow.id, Array.isArray(config.leaveTypes) && config.leaveTypes.length > 0 ? config.leaveTypes : []];
        }),
      ),
    );
    setIsCreatingNew(false);
    setLoading(false);
  }

  const loadLeaveBridgeEffect = useEffectEvent(() => {
    void loadLeaveBridge();
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadLeaveBridgeEffect();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showForm) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showForm]);

  function openNewForm() {
    setDraft(createNewPolicyDraft());
    setLeaveTypes([createBlankLeaveType()]);
    setShowForm(true);
    setIsCreatingNew(true);
    notify("New leave policy form opened.");
  }

  async function deleteLeavePolicy(policyId: string) {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");
    if ((assignedCounts[policyId] || 0) > 0) {
      return notify("This policy is currently assigned to employees. Reassign the workforce to another policy before deletion.");
    }

    const response = await fetch(`/api/company/policies/${policyId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to delete leave policy.");
    }

    if (draft.policyId === policyId) {
      setShowForm(false);
      setIsCreatingNew(false);
    }
    notify("Leave policy deleted.");
    await loadLeaveBridge();
  }

  async function saveLeavePolicy(targetStatus: "Draft" | "Active") {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");

    const creating = !draft.policyId;
    setSaving(true);
    const response = await fetch("/api/company/policies/leave-bridge", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...draft,
        status: targetStatus,
        leaveTypes,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; policyId?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to save leave policy.");
    }
    const nextPolicy = {
      ...draft,
      status: targetStatus,
      policyId: result.policyId || draft.policyId,
    };
    setDraft(nextPolicy);
    setSavedPolicies((current) => {
      const next = current.filter((policy) => policy.policyId !== nextPolicy.policyId);
      return [nextPolicy, ...next];
    });
    setSavedLeaveTypes(leaveTypes.map((leaveType) => ({ ...leaveType })));
    setSavedLeaveTypesByPolicy((current) => ({
      ...current,
      [nextPolicy.policyId]: leaveTypes.map((leaveType) => ({ ...leaveType })),
    }));
    setIsCreatingNew(false);
    setShowForm(false);
    showSuccess(getLeavePolicySuccessMessage(targetStatus, creating, draft.status));
    await loadLeaveBridge();
  }

  function getLeavePolicySuccessMessage(targetStatus: "Draft" | "Active", creating: boolean, currentStatus: string) {
    if (creating) {
      return targetStatus === "Active" ? "Policy Enforced Successfully" : "Policy Saved as Draft";
    }
    if (targetStatus === "Active") {
      return currentStatus === "Draft" ? "Policy Updated And Enforced Successfully" : "Policy Updated Successfully";
    }
    return "Draft Updated Successfully";
  }

  function saveExistingLeavePolicy() {
    return saveLeavePolicy(draft.status === "Active" ? "Active" : "Draft");
  }

  return (
    <PolicyPage
      badge="Leave Policy"
      title="Leave Policy"
      description="Maintain company leave policy records and define leave types, approval rules, attendance override handling, and carry-forward governance."
    >
      <PolicySuccessOverlay message={successMessage} />
      {toast ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
          {toast}
        </div>
      ) : null}

      <PolicyRegisterSection
        description="Maintain approved leave policies with effective governance dates, ownership, and default company applicability."
        onCreate={openNewForm}
        onEdit={(rowId) => {
          const selected = savedPolicies.find((policy) => policy.policyId === rowId);
          if (!selected) return notify("Selected leave policy was not found.");
          setDraft(selected);
          setLeaveTypes((savedLeaveTypesByPolicy[rowId] || savedLeaveTypes).map((leaveType) => ({ ...leaveType })));
          setShowForm(true);
          setIsCreatingNew(false);
          notify("Current leave policy opened for editing.");
        }}
        onDelete={(rowId) => {
          void deleteLeavePolicy(rowId);
        }}
        emptyState={loading ? "Loading leave policies..." : "No leave policies available."}
        rows={savedPolicies.map((policy) => ({
          id: policy.policyId || `${policy.policyName}-${policy.policyCode}`,
          name: policy.policyName,
          assignedWorkforce: policy.status === "Active" ? String(assignedCounts[policy.policyId] || 0) : "0",
          policyCode: policy.policyCode,
          effectiveFrom: policy.effectiveFrom,
          reviewDueOn: policy.nextReviewDate,
          status: policy.status,
          createdBy: "Company Admin",
          createdOn: policy.createdAt ? formatDisplayDateTime(policy.createdAt) : "-",
          defaultPolicy: policy.defaultCompanyPolicy,
        }))}
      />

      {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading leave policy...</div> : null}

      {!loading && showForm ? (
        <PolicyFormModal
          open={showForm}
          title={isCreatingNew ? "Create New Policy" : "Edit Policy"}
          description={
            isCreatingNew
              ? "Enter the details below to create a new policy."
              : "Update the policy details below."
          }
          onClose={() => {
            setShowForm(false);
            notify("Leave policy form closed.");
          }}
        >
          {isCreatingNew ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              New leave policy draft. Add leave types and save to create a separate policy.
            </div>
          ) : null}
          <PolicySection
            title={isCreatingNew ? "New Policy Details" : "Policy Details"}
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
              <Field label="Default Company Policy">
                <Select
                  value={draft.defaultCompanyPolicy}
                  onChange={(e) => updatePolicy("defaultCompanyPolicy", e.target.value as LeavePolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Leave Cycle">
                <Select
                  value={draft.leaveCycleType}
                  onChange={(e) => updatePolicy("leaveCycleType", e.target.value as LeavePolicyState["leaveCycleType"])}
                >
                  <option value="Calendar Year">Calendar Year (Jan-Dec)</option>
                  <option value="Financial Year">Financial Year (Apr-Mar)</option>
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
                    <Field label="Half Day Leave Allowed">
                      <Select value={leaveType.halfDayAllowed} onChange={(e) => updateLeaveType(leaveType.id, "halfDayAllowed", e.target.value)}>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </Select>
                    </Field>
                    <Field label="Accrual Rule">
                      <Select value={leaveType.accrualRule} onChange={(e) => updateLeaveType(leaveType.id, "accrualRule", e.target.value)}>
                        <option value="Yearly Upfront">Yearly Upfront</option>
                        <option value="Monthly Accrual">Monthly Accrual</option>
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
                    <Field label="Maximum Carry Forward Days">
                      {leaveType.carryForwardAllowed !== "Yes" ? (
                        <PolicyDisabledFieldValue />
                      ) : (
                        <TextInput
                          value={leaveType.maximumCarryForwardDays}
                          onChange={(e) => updateLeaveType(leaveType.id, "maximumCarryForwardDays", e.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Carry Forward Expiry (Days)">
                      {leaveType.carryForwardAllowed !== "Yes" ? (
                        <PolicyDisabledFieldValue />
                      ) : (
                        <TextInput
                          value={leaveType.carryForwardExpiryDays}
                          onChange={(e) => updateLeaveType(leaveType.id, "carryForwardExpiryDays", e.target.value)}
                        />
                      )}
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
              <Field label="Notice Period for Leave Application (Days)">
                <TextInput value={draft.noticePeriodDays} onChange={(e) => updatePolicy("noticePeriodDays", e.target.value)} />
              </Field>
              <Field
                label={
                  draft.backdatedLeaveAllowed === "Yes"
                    ? (
                        <span className="inline-flex items-center gap-2">
                          <span>Backdated Leave Allowed</span>
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            Allowed for {draft.maximumBackdatedLeaveDays || "0"} days
                          </span>
                        </span>
                      )
                    : "Backdated Leave Allowed"
                }
              >
                <Select
                  value={draft.backdatedLeaveAllowed}
                  onChange={(e) => updatePolicy("backdatedLeaveAllowed", e.target.value as LeavePolicyState["backdatedLeaveAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Maximum Backdated Leave Days">
                {draft.backdatedLeaveAllowed !== "Yes" ? (
                  <PolicyDisabledFieldValue />
                ) : (
                  <TextInput
                    value={draft.maximumBackdatedLeaveDays}
                    onChange={(e) => updatePolicy("maximumBackdatedLeaveDays", e.target.value)}
                  />
                )}
              </Field>
              <Field label="If Employee Punches On Approved Leave">
                <Select
                  value={draft.ifEmployeePunchesOnApprovedLeave}
                  onChange={(e) =>
                    updatePolicy(
                      "ifEmployeePunchesOnApprovedLeave",
                      e.target.value as LeavePolicyState["ifEmployeePunchesOnApprovedLeave"],
                    )
                  }
                >
                  <option value="Allow Punch and Send for Approval">Allow Punch and Send for Approval</option>
                  <option value="Keep Leave">Keep Leave</option>
                  <option value="Block Punch">Block Punch</option>
                </Select>
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    <span>Sandwich Leave</span>
                    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                      Feature under scope review
                    </span>
                  </span>
                }
              >
                <PolicyDisabledFieldValue text={draft.sandwichLeave} />
              </Field>
            </div>
          </PolicySection>

          <div className="flex flex-wrap gap-2">
            {isCreatingNew ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveLeavePolicy("Active")}
                  disabled={saving}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {saving ? "Processing..." : "Enforce Policy"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveLeavePolicy("Draft")}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {saving ? "Processing..." : "Save as Draft"}
                </button>
              </>
            ) : draft.status === "Draft" ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveLeavePolicy("Active")}
                  disabled={saving}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {saving ? "Processing..." : "Enforce Policy"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveExistingLeavePolicy()}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {saving ? "Processing..." : "Save"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void saveExistingLeavePolicy()}
                disabled={saving}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "Processing..." : "Save"}
              </button>
            )}
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
        </PolicyFormModal>
      ) : null}
    </PolicyPage>
  );
}
