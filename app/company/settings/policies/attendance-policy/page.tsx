"use client";

import { useCallback, useEffect, useState } from "react";
import { createAttendancePolicyGovernanceDates, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR, DEFAULT_ATTENDANCE_POLICY_CODE, DEFAULT_ATTENDANCE_POLICY_NAME } from "@/lib/attendancePolicyDefaults";
import { formatDisplayDateTime } from "@/lib/dateTime";
import {
  Field,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  PolicySuccessOverlay,
  PolicyToast,
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
  createdBy?: string;
  createdAt?: string;
};

function createInitialAttendancePolicyState(): AttendancePolicyState {
  const { effectiveFrom, nextReviewDate } = createAttendancePolicyGovernanceDates();
  return {
    policyId: "",
    policyName: DEFAULT_ATTENDANCE_POLICY_NAME,
    policyCode: DEFAULT_ATTENDANCE_POLICY_CODE,
    effectiveFrom,
    nextReviewDate,
    status: "Draft",
    defaultCompanyPolicy: "Yes",
    presentTrigger: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.presentTrigger,
    singlePunchHandling: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.singlePunchHandling,
    extraHoursCountingRule: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.extraHoursCountingRule,
    latePunchRule: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.latePunchRule,
    earlyGoRule: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.earlyGoRule,
    presentDaysFormula: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.presentDaysFormula,
    halfDayValue: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.halfDayValue,
    latePunchUpToMinutes: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.latePunchUpToMinutes,
    repeatLateDaysInMonth: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.repeatLateDaysInMonth,
    penaltyForRepeatLate: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForRepeatLate,
    latePunchAboveMinutes: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.latePunchAboveMinutes,
    penaltyForLateAboveLimit: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForLateAboveLimit,
    earlyGoUpToMinutes: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.earlyGoUpToMinutes,
    repeatEarlyGoDaysInMonth: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.repeatEarlyGoDaysInMonth,
    penaltyForRepeatEarlyGo: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForRepeatEarlyGo,
    earlyGoAboveMinutes: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.earlyGoAboveMinutes,
    penaltyForEarlyGoAboveLimit: DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForEarlyGoAboveLimit,
  };
}

function createNewPolicyDraft(): AttendancePolicyState {
  return {
    ...createInitialAttendancePolicyState(),
    policyName: "",
    policyCode: "",
    defaultCompanyPolicy: "No",
  };
}

function normalizePenaltySelection(value: unknown): "0.5" | "0" {
  return String(value || "").trim() === "0" ? "0" : "0.5";
}

function isWholeNumberInRange(value: string, min: number, max: number) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return false;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

function validateAttendancePolicyDraft(draft: AttendancePolicyState) {
  const policyName = draft.policyName.trim();
  const policyCode = draft.policyCode.trim();
  const effectiveFrom = draft.effectiveFrom.trim();
  const nextReviewDate = draft.nextReviewDate.trim();

  if (!policyName) return "Policy Name is required.";
  if (!policyCode) return "Policy Code is required.";
  if (!effectiveFrom) return "Effective From date is required.";
  if (!nextReviewDate) return "Next Review Date is required.";
  if (nextReviewDate < effectiveFrom) return "Next Review Date cannot be earlier than Effective From date.";

  if (draft.latePunchRule === "enforce_penalty") {
    if (!draft.latePunchUpToMinutes.trim()) return "Late Arrival Up To (mins) is required when late punch penalty is enabled.";
    if (!isWholeNumberInRange(draft.latePunchUpToMinutes, 0, 180)) return "Late Arrival Up To (mins) must be between 0 and 180.";
    if (!draft.repeatLateDaysInMonth.trim()) return "Repeat Late Count In Month is required when late punch penalty is enabled.";
    if (!isWholeNumberInRange(draft.repeatLateDaysInMonth, 1, 31)) return "Repeat Late Count In Month must be between 1 and 31.";
  }

  if (draft.earlyGoRule === "enforce_penalty") {
    if (!draft.earlyGoUpToMinutes.trim()) return "Early Go Up To (mins) is required when early go penalty is enabled.";
    if (!isWholeNumberInRange(draft.earlyGoUpToMinutes, 0, 180)) return "Early Go Up To (mins) must be between 0 and 180.";
    if (!draft.repeatEarlyGoDaysInMonth.trim()) return "Repeat Early Go Count In Month is required when early go penalty is enabled.";
    if (!isWholeNumberInRange(draft.repeatEarlyGoDaysInMonth, 1, 31)) return "Repeat Early Go Count In Month must be between 1 and 31.";
  }

  return null;
}

export default function NewAttendancePolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<AttendancePolicyState>(() => createInitialAttendancePolicyState());
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

  function clampNumericText(value: string, max: number) {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return String(Math.min(Number(digits), max));
  }

  function updateMinutesField(
    key: "latePunchUpToMinutes" | "latePunchAboveMinutes" | "earlyGoUpToMinutes" | "earlyGoAboveMinutes",
    value: string
  ) {
    update(key, clampNumericText(value, 180) as AttendancePolicyState[typeof key]);
  }

  function updateCountField(key: "repeatLateDaysInMonth" | "repeatEarlyGoDaysInMonth", value: string) {
    update(key, clampNumericText(value, 31) as AttendancePolicyState[typeof key]);
  }

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  function showSuccess(message: string) {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 1800);
  }

  const accessToken = useCallback(async () => {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    return sessionResult?.data.session?.access_token || "";
  }, []);

  const loadAttendanceBridge = useCallback(async () => {
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

    const baseState = createInitialAttendancePolicyState();
    const nextPolicy = {
      ...baseState,
      ...result,
      penaltyForRepeatLate: normalizePenaltySelection(result.penaltyForRepeatLate),
      penaltyForLateAboveLimit: normalizePenaltySelection(result.penaltyForLateAboveLimit),
      penaltyForRepeatEarlyGo: normalizePenaltySelection(result.penaltyForRepeatEarlyGo),
      penaltyForEarlyGoAboveLimit: normalizePenaltySelection(result.penaltyForEarlyGoAboveLimit),
      latePunchAboveMinutes: String(result.latePunchUpToMinutes || result.latePunchAboveMinutes || baseState.latePunchUpToMinutes),
      earlyGoAboveMinutes: String(result.earlyGoUpToMinutes || result.earlyGoAboveMinutes || baseState.earlyGoUpToMinutes),
    };
    setDraft(nextPolicy);
    const policiesResponse = await fetch("/api/company/policies?policy_type=attendance", {
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
        createdBy?: string;
        createdAt?: string;
        configJson?: Record<string, unknown>;
      }>;
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
              ...baseState,
              ...config,
              policyId: policy.id,
              policyName: String(config.policyName || policy.policyName || ""),
              policyCode: String(config.policyCode || policy.policyCode || ""),
              effectiveFrom: String(config.effectiveFrom || policy.effectiveFrom || baseState.effectiveFrom),
              nextReviewDate: String(config.nextReviewDate || policy.nextReviewDate || baseState.nextReviewDate),
              status: policy.status === "active" ? "Active" : policy.status === "archived" ? "Archived" : "Draft",
              defaultCompanyPolicy: policy.status === "active" && policy.isDefault ? "Yes" : "No",
              latePunchAboveMinutes: String(config.latePunchUpToMinutes || config.latePunchAboveMinutes || baseState.latePunchUpToMinutes),
              earlyGoAboveMinutes: String(config.earlyGoUpToMinutes || config.earlyGoAboveMinutes || baseState.earlyGoUpToMinutes),
              createdBy: String(policy.createdBy || ""),
              createdAt: String(policy.createdAt || ""),
            } satisfies AttendancePolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    const nextAssignedCounts = assignmentsResult.workforceCounts?.byPolicyType?.attendance || {};
    setAssignedCounts(nextAssignedCounts);
    setIsCreatingNew(false);
    setLoading(false);
  }, [accessToken, notify]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAttendanceBridge();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAttendanceBridge]);

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

    const validationError = validateAttendancePolicyDraft(draft);
    if (validationError) return notify(validationError);

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
        policyName: draft.policyName.trim(),
        policyCode: draft.policyCode.trim(),
        effectiveFrom: draft.effectiveFrom.trim(),
        nextReviewDate: draft.nextReviewDate.trim(),
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
      defaultCompanyPolicy: targetStatus === "Active" ? draft.defaultCompanyPolicy : "No",
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
      <PolicyToast message={toast} />

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
          createdBy: policy.createdBy || "Company Admin",
          createdOn: policy.createdAt ? formatDisplayDateTime(policy.createdAt) : "-",
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
                  onChange={(e) => updateMinutesField("latePunchUpToMinutes", e.target.value)}
                  inputMode="numeric"
                  disabled={draft.latePunchRule === "flag_only"}
                />
              </Field>
              <Field label="Repeat Late Count In Month">
                <TextInput
                  value={draft.repeatLateDaysInMonth}
                  onChange={(e) => updateCountField("repeatLateDaysInMonth", e.target.value)}
                  inputMode="numeric"
                  disabled={draft.latePunchRule === "flag_only"}
                />
              </Field>
              <Field label="Attendance Value After Repeat Late">
                <Select
                  value={draft.penaltyForRepeatLate}
                  onChange={(e) => update("penaltyForRepeatLate", e.target.value as AttendancePolicyState["penaltyForRepeatLate"])}
                  disabled={draft.latePunchRule === "flag_only"}
                >
                  <option value="0.5">0.5</option>
                  <option value="0">0</option>
                </Select>
              </Field>
              <Field label="Late Arrival Above (mins)">
                <TextInput
                  value={draft.latePunchAboveMinutes}
                  disabled
                />
              </Field>
              <Field label="Attendance Value After Late Above Limit">
                <Select
                  value={draft.penaltyForLateAboveLimit}
                  onChange={(e) => update("penaltyForLateAboveLimit", e.target.value as AttendancePolicyState["penaltyForLateAboveLimit"])}
                  disabled={draft.latePunchRule === "flag_only"}
                >
                  <option value="0.5">0.5</option>
                  <option value="0">0</option>
                </Select>
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
                  onChange={(e) => updateMinutesField("earlyGoUpToMinutes", e.target.value)}
                  inputMode="numeric"
                  disabled={draft.earlyGoRule === "flag_only"}
                />
              </Field>
              <Field label="Repeat Early Go Count In Month">
                <TextInput
                  value={draft.repeatEarlyGoDaysInMonth}
                  onChange={(e) => updateCountField("repeatEarlyGoDaysInMonth", e.target.value)}
                  inputMode="numeric"
                  disabled={draft.earlyGoRule === "flag_only"}
                />
              </Field>
              <Field label="Attendance Value After Repeat Early Go">
                <Select
                  value={draft.penaltyForRepeatEarlyGo}
                  onChange={(e) => update("penaltyForRepeatEarlyGo", e.target.value as AttendancePolicyState["penaltyForRepeatEarlyGo"])}
                  disabled={draft.earlyGoRule === "flag_only"}
                >
                  <option value="0.5">0.5</option>
                  <option value="0">0</option>
                </Select>
              </Field>
              <Field label="Early Go Above (mins)">
                <TextInput
                  value={draft.earlyGoAboveMinutes}
                  disabled
                />
              </Field>
              <Field label="Attendance Value After Early Go Above Limit">
                <Select
                  value={draft.penaltyForEarlyGoAboveLimit}
                  onChange={(e) => update("penaltyForEarlyGoAboveLimit", e.target.value as AttendancePolicyState["penaltyForEarlyGoAboveLimit"])}
                  disabled={draft.earlyGoRule === "flag_only"}
                >
                  <option value="0.5">0.5</option>
                  <option value="0">0</option>
                </Select>
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
