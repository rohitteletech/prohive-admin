"use client";

import { useState } from "react";
import { useEffect } from "react";
import {
  Field,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  PolicySuccessOverlay,
  Select,
  TextInput,
} from "@/components/company/policy-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AttendancePolicyState = {
  policyId: string;
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  presentTrigger: "punch_in" | "punch_in_out";
  singlePunchHandling: "present" | "absent";
  extraHoursCountingRule: "count" | "ignore";
  latePunchRule: "flag_only" | "enforce_penalty";
  earlyGoRule: "flag_only" | "enforce_penalty";
  presentDaysFormula: "full_plus_half" | "full_only";
  halfDayValue: "0.5" | "1.0";
  latePunchUpToMinutes: string;
  repeatLateDaysInMonth: string;
  penaltyForRepeatLate: string;
  latePunchAboveMinutes: string;
  penaltyForLateAboveLimit: string;
  earlyGoUpToMinutes: string;
  repeatEarlyGoDaysInMonth: string;
  penaltyForRepeatEarlyGo: string;
  earlyGoAboveMinutes: string;
  penaltyForEarlyGoAboveLimit: string;
};

const initialState: AttendancePolicyState = {
  policyId: "",
  policyName: "Standard Attendance Policy",
  policyCode: "ATT-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  presentTrigger: "punch_in_out",
  singlePunchHandling: "absent",
  extraHoursCountingRule: "count",
  latePunchRule: "enforce_penalty",
  earlyGoRule: "flag_only",
  presentDaysFormula: "full_plus_half",
  halfDayValue: "0.5",
  latePunchUpToMinutes: "60",
  repeatLateDaysInMonth: "3",
  penaltyForRepeatLate: "1",
  latePunchAboveMinutes: "60",
  penaltyForLateAboveLimit: "0.5",
  earlyGoUpToMinutes: "30",
  repeatEarlyGoDaysInMonth: "3",
  penaltyForRepeatEarlyGo: "1",
  earlyGoAboveMinutes: "60",
  penaltyForEarlyGoAboveLimit: "0.5",
};

function createNewPolicyDraft(): AttendancePolicyState {
  return {
    ...initialState,
    policyName: "",
    policyCode: "",
    defaultCompanyPolicy: "No",
  };
}

export default function NewAttendancePolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [savedPolicies, setSavedPolicies] = useState<AttendancePolicyState[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function update<K extends keyof AttendancePolicyState>(key: K, value: AttendancePolicyState[K]) {
    setDraft((current) => {
      if (key === "latePunchUpToMinutes") {
        return {
          ...current,
          latePunchUpToMinutes: value as AttendancePolicyState["latePunchUpToMinutes"],
          latePunchAboveMinutes: value as AttendancePolicyState["latePunchAboveMinutes"],
        };
      }

      if (key === "earlyGoUpToMinutes") {
        return {
          ...current,
          earlyGoUpToMinutes: value as AttendancePolicyState["earlyGoUpToMinutes"],
          earlyGoAboveMinutes: value as AttendancePolicyState["earlyGoAboveMinutes"],
        };
      }

      return { ...current, [key]: value };
    });
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

  async function loadAttendanceBridge() {
    const token = await accessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/company/policies/attendance-bridge", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<AttendancePolicyState> & { error?: string };
    if (!response.ok) {
      notify(result.error || "Unable to load attendance policy.");
      setLoading(false);
      return;
    }

    const nextPolicy = {
      ...initialState,
      ...result,
      latePunchAboveMinutes: String(result.latePunchUpToMinutes || result.latePunchAboveMinutes || initialState.latePunchUpToMinutes),
      earlyGoAboveMinutes: String(result.earlyGoUpToMinutes || result.earlyGoAboveMinutes || initialState.earlyGoUpToMinutes),
    };
    setDraft(nextPolicy);
    const policiesResponse = await fetch("/api/company/policies?policy_type=attendance", {
      headers: { authorization: `Bearer ${token}` },
    });
    const assignmentsResponse = await fetch("/api/company/policy-assignments", {
      headers: { authorization: `Bearer ${token}` },
    });
    const policiesResult = (await policiesResponse.json().catch(() => ({}))) as {
      policies?: Array<{ id: string; policyName: string; policyCode: string; effectiveFrom: string; nextReviewDate: string; status: string; isDefault: boolean; configJson?: Record<string, unknown> }>;
    };
    const assignmentsResult = (await assignmentsResponse.json().catch(() => ({}))) as {
      assignments?: Array<{ policyId: string; isActive: boolean }>;
      workforceCounts?: { byPolicyType?: { attendance?: Record<string, number> } };
    };
    const loadedPolicies =
      Array.isArray(policiesResult.policies) && policiesResult.policies.length > 0
        ? policiesResult.policies.map((policy) => {
            const config = (policy.configJson || {}) as Partial<AttendancePolicyState>;
            return {
              ...initialState,
              ...config,
              policyId: policy.id,
              policyName: String(config.policyName || policy.policyName || ""),
              policyCode: String(config.policyCode || policy.policyCode || ""),
              effectiveFrom: String(config.effectiveFrom || policy.effectiveFrom || initialState.effectiveFrom),
              nextReviewDate: String(config.nextReviewDate || policy.nextReviewDate || initialState.nextReviewDate),
              status: policy.status === "active" ? "Active" : policy.status === "archived" ? "Archived" : "Draft",
              defaultCompanyPolicy: policy.isDefault ? "Yes" : "No",
            } satisfies AttendancePolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    const nextAssignedCounts = assignmentsResult.workforceCounts?.byPolicyType?.attendance || {};
    setAssignedCounts(nextAssignedCounts);
    setIsCreatingNew(false);
    setLoading(false);
  }

  useEffect(() => {
    void loadAttendanceBridge();
  }, []);

  function openNewForm() {
    setDraft(createNewPolicyDraft());
    setShowForm(true);
    setIsCreatingNew(true);
    notify("New attendance policy form opened.");
  }

  async function deleteAttendancePolicy(policyId: string) {
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
      return notify(result.error || "Unable to delete attendance policy.");
    }

    if (draft.policyId === policyId) {
      setShowForm(false);
      setIsCreatingNew(false);
    }
    notify("Attendance policy deleted.");
    await loadAttendanceBridge();
  }

  async function saveAttendancePolicy(targetStatus: "Draft" | "Active") {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");

    const creating = !draft.policyId;
    setSaving(true);
    const response = await fetch("/api/company/policies/attendance-bridge", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...draft,
        status: targetStatus,
        latePunchPenaltyEnabled: draft.latePunchRule === "enforce_penalty" ? "Yes" : "No",
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; policyId?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to save attendance policy.");
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
    setIsCreatingNew(false);
    setShowForm(false);
    showSuccess(getAttendancePolicySuccessMessage(targetStatus, creating, draft.status));
    await loadAttendanceBridge();
  }

  function getAttendancePolicySuccessMessage(targetStatus: "Draft" | "Active", creating: boolean, currentStatus: string) {
    if (creating) {
      return targetStatus === "Active" ? "Policy Enforced Successfully" : "Policy Saved as Draft";
    }
    if (targetStatus === "Active") {
      return currentStatus === "Draft" ? "Policy Updated And Enforced Successfully" : "Policy Updated Successfully";
    }
    return "Draft Updated Successfully";
  }

  function saveExistingAttendancePolicy() {
    return saveAttendancePolicy(draft.status === "Active" ? "Active" : "Draft");
  }

  return (
    <PolicyPage
      badge="Attendance Policy"
      title="Attendance Policy"
      description="Maintain company attendance policy records and create structured attendance policies for daily status, monthly formula, and penalty governance."
    >
      <PolicySuccessOverlay message={successMessage} />
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}

      <PolicyRegisterSection
        description="Maintain approved attendance policies with effective governance dates, administrative ownership, and default company applicability."
        onCreate={openNewForm}
        onEdit={(rowId) => {
          const selected = savedPolicies.find((policy) => policy.policyId === rowId);
          if (!selected) return notify("Selected attendance policy was not found.");
          setDraft(selected);
          setShowForm(true);
          setIsCreatingNew(false);
          notify("Current attendance policy opened for editing.");
        }}
        onDelete={(rowId) => {
          void deleteAttendancePolicy(rowId);
        }}
        emptyState={loading ? "Loading attendance policies..." : "No attendance policies available."}
        rows={savedPolicies.map((policy) => ({
          id: policy.policyId || `${policy.policyName}-${policy.policyCode}`,
          name: policy.policyName,
          assignedWorkforce: policy.status === "Active" ? String(assignedCounts[policy.policyId] || 0) : "0",
          policyCode: policy.policyCode,
          effectiveFrom: policy.effectiveFrom,
          reviewDueOn: policy.nextReviewDate,
          status: policy.status,
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:05 AM",
          defaultPolicy: policy.defaultCompanyPolicy,
        }))}
      />

      {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading attendance policy...</div> : null}

      {!loading && showForm ? (
        <>
          {isCreatingNew ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              New attendance policy draft. Fill the form and save to create a separate policy.
            </div>
          ) : null}
          <PolicySection
            title={isCreatingNew ? "New Policy Details" : "Policy Details"}
            description="Define the administrative identity, governance dates, and company-level applicability of this attendance policy."
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
              <Field label="Default Company Policy">
                <Select
                  value={draft.defaultCompanyPolicy}
                  onChange={(e) => update("defaultCompanyPolicy", e.target.value as AttendancePolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Attendance Status Rules"
            description="Define how daily attendance status should be evaluated based on punches and worked hours."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Present Trigger">
                <Select
                  value={draft.presentTrigger}
                  onChange={(e) => update("presentTrigger", e.target.value as AttendancePolicyState["presentTrigger"])}
                >
                  <option value="punch_in">Punch In</option>
                  <option value="punch_in_out">Punch In + Punch Out</option>
                </Select>
              </Field>
              <Field label="Missed Punch Out Case">
                <Select
                  value={draft.singlePunchHandling}
                  onChange={(e) => update("singlePunchHandling", e.target.value as AttendancePolicyState["singlePunchHandling"])}
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                </Select>
              </Field>
              <Field label="Extra Hours Counting Rule">
                <Select
                  value={draft.extraHoursCountingRule}
                  onChange={(e) => update("extraHoursCountingRule", e.target.value as AttendancePolicyState["extraHoursCountingRule"])}
                >
                  <option value="count">Count</option>
                  <option value="ignore">Ignore</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Monthly Calculation Rules"
            description="Define how daily attendance status should roll up into monthly present-day calculations."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Present Days Formula">
                <Select
                  value={draft.presentDaysFormula}
                  onChange={(e) => update("presentDaysFormula", e.target.value as AttendancePolicyState["presentDaysFormula"])}
                >
                  <option value="full_plus_half">Full Present + Half Day Value</option>
                  <option value="full_only">Only Full Present</option>
                </Select>
              </Field>
              <Field label="Half Day Value">
                <Select value={draft.halfDayValue} onChange={(e) => update("halfDayValue", e.target.value as AttendancePolicyState["halfDayValue"])}>
                  <option value="0.5">0.5 Day</option>
                  <option value="1.0">1.0 Day</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Penalty Rules"
            description="Define the late-punch penalty structure and monthly deduction thresholds applicable to this attendance policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Late Punch Action">
                <Select value={draft.latePunchRule} onChange={(e) => update("latePunchRule", e.target.value as AttendancePolicyState["latePunchRule"])}>
                  <option value="flag_only">No Action / Flag Only</option>
                  <option value="enforce_penalty">Enforce Penalty</option>
                </Select>
              </Field>
            </div>
            <div className={`grid gap-4 md:grid-cols-2 ${draft.latePunchRule === "flag_only" ? "opacity-60" : ""}`}>
              <Field label="Late Arrival Up To (mins)">
                <TextInput
                  value={draft.latePunchUpToMinutes}
                  onChange={(e) => update("latePunchUpToMinutes", e.target.value)}
                  disabled={draft.latePunchRule === "flag_only"}
                />
              </Field>
              <Field label="Repeat Late Count In Month">
                <TextInput
                  value={draft.repeatLateDaysInMonth}
                  onChange={(e) => update("repeatLateDaysInMonth", e.target.value)}
                  disabled={draft.latePunchRule === "flag_only"}
                />
              </Field>
              <Field label="Attendance Value After Repeat Late">
                <TextInput
                  value={draft.penaltyForRepeatLate}
                  onChange={(e) => update("penaltyForRepeatLate", e.target.value)}
                  disabled={draft.latePunchRule === "flag_only"}
                />
              </Field>
              <Field label="Late Arrival Above (mins)">
                <TextInput
                  value={draft.latePunchAboveMinutes}
                  disabled
                />
              </Field>
              <Field label="Attendance Value After Late Above Limit">
                <TextInput
                  value={draft.penaltyForLateAboveLimit}
                  onChange={(e) => update("penaltyForLateAboveLimit", e.target.value)}
                  disabled={draft.latePunchRule === "flag_only"}
                />
              </Field>
            </div>

            <div className="mt-5 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-2">
              <Field label="Early Go Action">
                <Select value={draft.earlyGoRule} onChange={(e) => update("earlyGoRule", e.target.value as AttendancePolicyState["earlyGoRule"])}>
                  <option value="flag_only">No Action / Flag Only</option>
                  <option value="enforce_penalty">Enforce Penalty</option>
                </Select>
              </Field>
            </div>

            <div className={`mt-4 grid gap-4 border-t border-slate-200 pt-5 md:grid-cols-2 ${draft.earlyGoRule === "flag_only" ? "opacity-60" : ""}`}>
              <Field label="Early Go Up To (mins)">
                <TextInput
                  value={draft.earlyGoUpToMinutes}
                  onChange={(e) => update("earlyGoUpToMinutes", e.target.value)}
                  disabled={draft.earlyGoRule === "flag_only"}
                />
              </Field>
              <Field label="Repeat Early Go Count In Month">
                <TextInput
                  value={draft.repeatEarlyGoDaysInMonth}
                  onChange={(e) => update("repeatEarlyGoDaysInMonth", e.target.value)}
                  disabled={draft.earlyGoRule === "flag_only"}
                />
              </Field>
              <Field label="Attendance Value After Repeat Early Go">
                <TextInput
                  value={draft.penaltyForRepeatEarlyGo}
                  onChange={(e) => update("penaltyForRepeatEarlyGo", e.target.value)}
                  disabled={draft.earlyGoRule === "flag_only"}
                />
              </Field>
              <Field label="Early Go Above (mins)">
                <TextInput
                  value={draft.earlyGoAboveMinutes}
                  disabled
                />
              </Field>
              <Field label="Attendance Value After Early Go Above Limit">
                <TextInput
                  value={draft.penaltyForEarlyGoAboveLimit}
                  onChange={(e) => update("penaltyForEarlyGoAboveLimit", e.target.value)}
                  disabled={draft.earlyGoRule === "flag_only"}
                />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {isCreatingNew ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveAttendancePolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveAttendancePolicy("Draft")}
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
                    onClick={() => void saveAttendancePolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveExistingAttendancePolicy()}
                    disabled={saving}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {saving ? "Processing..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveExistingAttendancePolicy()}
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
                  notify("Attendance policy form closed.");
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
