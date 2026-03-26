"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  Field,
  PolicyFormModal,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  PolicySuccessOverlay,
  Select,
  TextInput,
} from "@/components/company/policy-ui";
import { formatDisplayDateTime } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ShiftPolicyState = {
  policyId: string;
  policyName: string;
  policyCode: string;
  createdAt?: string;
  createdBy?: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  shiftName: string;
  shiftType: string;
  shiftStructure: "fixed";
  shiftStartTime: string;
  shiftEndTime: string;
  halfDayAvailable: "Yes" | "No";
  halfDayHours: string;
  punchAccessRule: "any_time" | "shift_time_only";
  earlyPunchAllowed: string;
  gracePeriod: string;
  minimumWorkBeforePunchOut: string;
  legacyShiftId: string;
};

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getDefaultPolicyDates() {
  const effectiveFrom = new Date();
  const nextReviewDate = new Date(effectiveFrom);
  nextReviewDate.setFullYear(nextReviewDate.getFullYear() + 1);

  return {
    effectiveFrom: formatDateInput(effectiveFrom),
    nextReviewDate: formatDateInput(nextReviewDate),
  };
}

function createShiftPolicyCode() {
  return `SFT-${Date.now().toString().slice(-6)}`;
}

const initialState: ShiftPolicyState = {
  policyId: "",
  policyName: "Standard Shift Policy",
  policyCode: createShiftPolicyCode(),
  ...getDefaultPolicyDates(),
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  shiftName: "General Shift",
  shiftType: "General",
  shiftStructure: "fixed",
  shiftStartTime: "09:00",
  shiftEndTime: "18:00",
  halfDayAvailable: "Yes",
  halfDayHours: "04:00",
  punchAccessRule: "any_time",
  earlyPunchAllowed: "15",
  gracePeriod: "10",
  minimumWorkBeforePunchOut: "60",
  legacyShiftId: "",
};

function createNewPolicyDraft(): ShiftPolicyState {
  return {
    ...initialState,
    policyName: "",
    policyCode: createShiftPolicyCode(),
    defaultCompanyPolicy: "No",
  };
}

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

function formatHalfDayHours(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return "04:00";

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  const diff = endTotal >= startTotal ? endTotal - startTotal : 24 * 60 - startTotal + endTotal;
  const half = Math.floor(diff / 2);
  const hours = Math.floor(half / 60);
  const minutes = half % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function NewShiftPolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [savedPolicies, setSavedPolicies] = useState<ShiftPolicyState[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const shiftDuration = useMemo(
    () => formatShiftDuration(draft.shiftStartTime, draft.shiftEndTime),
    [draft.shiftStartTime, draft.shiftEndTime]
  );
  const halfDayHours = useMemo(
    () => formatHalfDayHours(draft.shiftStartTime, draft.shiftEndTime),
    [draft.shiftStartTime, draft.shiftEndTime]
  );

  function update<K extends keyof ShiftPolicyState>(key: K, value: ShiftPolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
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

  async function loadShiftBridge() {
    const token = await accessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/company/policies/shift-bridge", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<ShiftPolicyState> & {
      error?: string;
      loginAccessRule?: ShiftPolicyState["punchAccessRule"];
      earlyInAllowed?: string;
    };
    if (!response.ok) {
      notify(result.error || "Unable to load shift policy.");
      setLoading(false);
      return;
    }

    const nextPolicy = {
      ...initialState,
      ...result,
      punchAccessRule: String(result.punchAccessRule || result.loginAccessRule || initialState.punchAccessRule) as ShiftPolicyState["punchAccessRule"],
      earlyPunchAllowed: String(result.earlyPunchAllowed || result.earlyInAllowed || initialState.earlyPunchAllowed),
    };
    setDraft(nextPolicy);
    const policiesResponse = await fetch("/api/company/policies?policy_type=shift", {
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
        createdAt?: string;
        createdBy?: string;
        effectiveFrom: string;
        nextReviewDate: string;
        status: string;
        isDefault: boolean;
        configJson?: Record<string, unknown>;
      }>;
    };
    const assignmentsResult = (await assignmentsResponse.json().catch(() => ({}))) as {
      assignments?: Array<{ policyId: string; isActive: boolean }>;
      workforceCounts?: { byPolicyType?: { shift?: Record<string, number> } };
    };
    const loadedPolicies =
      Array.isArray(policiesResult.policies) && policiesResult.policies.length > 0
        ? policiesResult.policies.map((policy) => {
            const config = (policy.configJson || {}) as Partial<ShiftPolicyState> & {
              loginAccessRule?: ShiftPolicyState["punchAccessRule"];
              earlyInAllowed?: string;
            };
            return {
              ...initialState,
              ...config,
              policyId: policy.id,
              createdAt: String(policy.createdAt || ""),
              createdBy: String(policy.createdBy || ""),
              policyName: String(config.policyName || policy.policyName || ""),
              policyCode: String(config.policyCode || policy.policyCode || ""),
              effectiveFrom: String(config.effectiveFrom || policy.effectiveFrom || initialState.effectiveFrom),
              nextReviewDate: String(config.nextReviewDate || policy.nextReviewDate || initialState.nextReviewDate),
              punchAccessRule: String(config.punchAccessRule || config.loginAccessRule || initialState.punchAccessRule) as ShiftPolicyState["punchAccessRule"],
              earlyPunchAllowed: String(config.earlyPunchAllowed || config.earlyInAllowed || initialState.earlyPunchAllowed),
              status:
                policy.status === "active" ? "Active" : policy.status === "archived" ? "Archived" : "Draft",
              defaultCompanyPolicy: policy.isDefault ? "Yes" : "No",
            } satisfies ShiftPolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    const nextAssignedCounts = assignmentsResult.workforceCounts?.byPolicyType?.shift || {};
    setAssignedCounts(nextAssignedCounts);
    setIsCreatingNew(false);
    setLoading(false);
  }

  const loadShiftBridgeEffect = useEffectEvent(() => {
    void loadShiftBridge();
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadShiftBridgeEffect();
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

  function startNewPolicy() {
    setDraft(createNewPolicyDraft());
    setShowForm(true);
    setIsCreatingNew(true);
    notify("New shift policy form opened.");
  }

  async function deleteShiftPolicy(policyId: string) {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");
    if ((assignedCounts[policyId] || 0) > 0) {
      return notify("This policy is currently assigned to employees. Reassign the workforce to another policy before deletion.");
    }

    const response = await fetch(`/api/company/policies/${policyId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to delete shift policy.");
    }

    if (draft.policyId === policyId) {
      setShowForm(false);
      setIsCreatingNew(false);
    }
    notify("Shift policy deleted.");
    await loadShiftBridge();
  }

  async function saveShiftPolicy(targetStatus: "Draft" | "Active") {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");

    const creating = !draft.policyId;
    setSaving(true);
    const response = await fetch("/api/company/policies/shift-bridge", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...draft,
        status: targetStatus,
        halfDayHours: draft.halfDayAvailable === "No" ? "00:00" : halfDayHours,
        earlyPunchAllowed: draft.punchAccessRule === "any_time" ? "0" : draft.earlyPunchAllowed,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; legacyShiftId?: string; policyId?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to save shift policy.");
    }
    const nextPolicy = {
      ...draft,
      status: targetStatus,
      policyId: result.policyId || draft.policyId,
      legacyShiftId: result.legacyShiftId || draft.legacyShiftId,
    };
    setDraft(nextPolicy);
    setSavedPolicies((current) => {
      const next = current.filter((policy) => policy.policyId !== nextPolicy.policyId);
      return [nextPolicy, ...next];
    });
    setIsCreatingNew(false);
    setShowForm(false);
    showSuccess(getShiftPolicySuccessMessage(targetStatus, creating, draft.status));
    await loadShiftBridge();
  }

  function getShiftPolicySuccessMessage(targetStatus: "Draft" | "Active", creating: boolean, currentStatus: string) {
    if (creating) {
      return targetStatus === "Active" ? "Policy Enforced Successfully" : "Policy Saved as Draft";
    }
    if (targetStatus === "Active") {
      return currentStatus === "Draft" ? "Policy Updated And Enforced Successfully" : "Policy Updated Successfully";
    }
    return "Draft Updated Successfully";
  }

  function saveExistingShiftPolicy() {
    return saveShiftPolicy(draft.status === "Active" ? "Active" : "Draft");
  }

  return (
    <PolicyPage
      badge="Shift Policy"
      title="Shift Policy"
      description="Maintain company shift policy records and create structured shift policies with effective governance dates and default applicability."
    >
      <PolicySuccessOverlay message={successMessage} />
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}

      <PolicyRegisterSection
        description="Maintain approved shift policy records with effective dates, review checkpoints, ownership, and default company applicability."
        onCreate={startNewPolicy}
        onEdit={(rowId) => {
          const selected = savedPolicies.find((policy) => policy.policyId === rowId);
          if (!selected) return notify("Selected shift policy was not found.");
          setDraft(selected);
          setShowForm(true);
          setIsCreatingNew(false);
          notify("Current shift policy opened for editing.");
        }}
        onDelete={(rowId) => {
          void deleteShiftPolicy(rowId);
        }}
        emptyState={loading ? "Loading shift policies..." : "No shift policies available."}
        rows={savedPolicies.map((policy) => ({
          id: policy.policyId || `${policy.policyName}-${policy.policyCode}`,
          name: policy.policyName || "-",
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

      {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading shift policy...</div> : null}

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
            notify("Shift policy form closed.");
          }}
        >
          {isCreatingNew ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              New shift policy draft. Fill the form and save to create a separate policy.
            </div>
          ) : null}
          <PolicySection
            title={isCreatingNew ? "New Policy Details" : "Policy Details"}
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
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    <span>Shift Structure</span>
                    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      Fixed only
                    </span>
                  </span>
                }
              >
                <TextInput value="Fixed Shift" readOnly disabled />
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
              <Field label="Half Day Available For This Shift">
                <Select
                  value={draft.halfDayAvailable}
                  onChange={(e) => update("halfDayAvailable", e.target.value as ShiftPolicyState["halfDayAvailable"])}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </Select>
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    <span>Half Day Hours</span>
                    {draft.halfDayAvailable === "No" ? (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Not applicable for this shift
                      </span>
                    ) : (
                      <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        Auto-calculated from shift duration
                      </span>
                    )}
                  </span>
                }
              >
                <TextInput
                  value={draft.halfDayAvailable === "No" ? "00:00" : halfDayHours}
                  readOnly
                  disabled
                />
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Punch Access Rules"
            description="Define punch access governance and threshold controls applicable to this shift policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Punch Access Rule">
                <Select
                  value={draft.punchAccessRule}
                  onChange={(e) => update("punchAccessRule", e.target.value as ShiftPolicyState["punchAccessRule"])}
                >
                  <option value="any_time">Allow Punch Any Time</option>
                  <option value="shift_time_only">Allow Punch Only During Shift Time</option>
                </Select>
              </Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-2">
                    <span>Early Punch Allowed (mins)</span>
                    {draft.punchAccessRule === "any_time" ? (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Not applicable for this punch rule
                      </span>
                    ) : (
                      <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        Applied before shift start for punch-in
                      </span>
                    )}
                  </span>
                }
              >
                <TextInput
                  value={draft.punchAccessRule === "any_time" ? "0" : draft.earlyPunchAllowed}
                  onChange={(e) => update("earlyPunchAllowed", e.target.value)}
                  disabled={draft.punchAccessRule === "any_time"}
                />
              </Field>
              <Field label="Grace Period (mins)">
                <TextInput value={draft.gracePeriod} onChange={(e) => update("gracePeriod", e.target.value)} />
              </Field>
              <Field label="Minimum Work Before Punch Out (mins)">
                <TextInput value={draft.minimumWorkBeforePunchOut} onChange={(e) => update("minimumWorkBeforePunchOut", e.target.value)} />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {isCreatingNew ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveShiftPolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveShiftPolicy("Draft")}
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
                    onClick={() => void saveShiftPolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveExistingShiftPolicy()}
                    disabled={saving}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {saving ? "Processing..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveExistingShiftPolicy()}
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
                  notify("Shift policy form closed.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </PolicySection>
        </PolicyFormModal>
      ) : null}
    </PolicyPage>
  );
}
