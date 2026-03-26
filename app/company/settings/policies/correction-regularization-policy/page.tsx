"use client";

import { useEffect, useEffectEvent, useState } from "react";
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
import {
  correctionPolicyBridgeStateFromStoredConfig,
  CORRECTION_POLICY_LIMITS,
  createDefaultCorrectionPolicyConfig,
  normalizeCorrectionPolicyConfig,
  type CorrectionPolicyBridgeState,
  type CorrectionPolicyStoredStatus,
} from "@/lib/correctionPolicyDefaults";
import { formatDisplayDateTime } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CorrectionPolicyState = CorrectionPolicyBridgeState & {
  policyId: string;
  createdOn?: string;
};

function createCorrectionPolicyState(params?: {
  defaultCompanyPolicy?: "Yes" | "No";
  storedStatus?: CorrectionPolicyStoredStatus;
  blankIdentity?: boolean;
}) {
  const config = correctionPolicyBridgeStateFromStoredConfig(
    createDefaultCorrectionPolicyConfig({
      defaultCompanyPolicy: params?.defaultCompanyPolicy || "Yes",
      status: params?.storedStatus || "draft",
    }),
  );

  return {
    policyId: "",
    ...config,
    ...(params?.blankIdentity ? { policyName: "", policyCode: "" } : {}),
  } satisfies CorrectionPolicyState;
}

const initialState = createCorrectionPolicyState({ storedStatus: "draft" });

function createNewPolicyDraft(): CorrectionPolicyState {
  return createCorrectionPolicyState({
    defaultCompanyPolicy: "No",
    storedStatus: "draft",
    blankIdentity: true,
  });
}

export default function CorrectionRegularizationPolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [savedPolicies, setSavedPolicies] = useState<CorrectionPolicyState[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [activeAssignmentPolicyIds, setActiveAssignmentPolicyIds] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const correctionSettingsDisabled = draft.attendanceCorrectionEnabled === "No";
  const backdatedSettingsDisabled = correctionSettingsDisabled || draft.backdatedCorrectionAllowed === "No";
  const approvalFlowDisabled = correctionSettingsDisabled || draft.approvalRequired === "No";
  const defaultPolicyHelperText =
    "Default Company Policy applies only when the policy is enforced as active. Draft saves keep this as No until activation.";

  function update<K extends keyof CorrectionPolicyState>(key: K, value: CorrectionPolicyState[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };

      if (key === "backdatedCorrectionAllowed") {
        if (value === "No") {
          next.maximumBackdatedDays = "0";
        } else if (current.maximumBackdatedDays === "0") {
          next.maximumBackdatedDays = current.correctionRequestWindow || initialState.correctionRequestWindow;
        }
      }

      if (key === "correctionRequestWindow") {
        const nextWindow = Number(value);
        const currentBackdatedDays = Number(current.maximumBackdatedDays);
        if (
          current.backdatedCorrectionAllowed === "Yes" &&
          Number.isFinite(nextWindow) &&
          Number.isFinite(currentBackdatedDays) &&
          currentBackdatedDays > nextWindow
        ) {
          next.maximumBackdatedDays = String(Math.max(0, Math.trunc(nextWindow)));
        }
      }

      if (key === "maximumBackdatedDays") {
        const nextBackdatedDays = Number(value);
        const currentWindow = Number(current.correctionRequestWindow);
        if (
          current.backdatedCorrectionAllowed === "Yes" &&
          Number.isFinite(nextBackdatedDays) &&
          Number.isFinite(currentWindow) &&
          nextBackdatedDays > currentWindow
        ) {
          next.maximumBackdatedDays = String(Math.max(0, Math.trunc(currentWindow)));
        }
      }

      return next;
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

  async function loadCorrectionBridge() {
    const token = await accessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/company/policies/correction-bridge", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<CorrectionPolicyState> & { error?: string };
    if (!response.ok) {
      notify(result.error || "Unable to load correction policy.");
      setLoading(false);
      return;
    }

    const nextPolicy = { ...initialState, ...result };
    setDraft(nextPolicy);
    const policiesResponse = await fetch("/api/company/policies?policy_type=correction", {
      headers: { authorization: `Bearer ${token}` },
    });
    const assignmentsResponse = await fetch("/api/company/policy-assignments", {
      headers: { authorization: `Bearer ${token}` },
    });
    const policiesResult = (await policiesResponse.json().catch(() => ({}))) as {
      policies?: Array<{ id: string; policyName: string; policyCode: string; effectiveFrom: string; nextReviewDate: string; status: string; isDefault: boolean; createdAt?: string; configJson?: Record<string, unknown> }>;
    };
    const assignmentsResult = (await assignmentsResponse.json().catch(() => ({}))) as {
      assignments?: Array<{ policyId: string; isActive: boolean }>;
      workforceCounts?: { byPolicyType?: { correction?: Record<string, number> } };
    };
    const loadedPolicies =
      Array.isArray(policiesResult.policies) && policiesResult.policies.length > 0
        ? policiesResult.policies.map((policy) => {
            const normalizedConfig = correctionPolicyBridgeStateFromStoredConfig(
              normalizeCorrectionPolicyConfig((policy.configJson || {}) as Record<string, unknown>, {
                policyName: String(policy.policyName || ""),
                policyCode: String(policy.policyCode || ""),
                effectiveFrom: String(policy.effectiveFrom || initialState.effectiveFrom),
                nextReviewDate: String(policy.nextReviewDate || initialState.nextReviewDate),
                status: policy.status === "active" ? "active" : policy.status === "archived" ? "archived" : "draft",
                defaultCompanyPolicy: policy.isDefault ? "Yes" : "No",
              }),
            );
            return {
              ...initialState,
              ...normalizedConfig,
              policyId: policy.id,
              status: policy.status === "active" ? "Active" : policy.status === "archived" ? "Archived" : "Draft",
              defaultCompanyPolicy: policy.isDefault ? "Yes" : "No",
              createdOn: policy.createdAt ? formatDisplayDateTime(policy.createdAt) : "-",
            } satisfies CorrectionPolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    const nextAssignedCounts = assignmentsResult.workforceCounts?.byPolicyType?.correction || {};
    setAssignedCounts(nextAssignedCounts);
    setActiveAssignmentPolicyIds(
      (assignmentsResult.assignments || []).reduce<Record<string, boolean>>((acc, assignment) => {
        if (assignment.isActive && assignment.policyId) acc[assignment.policyId] = true;
        return acc;
      }, {}),
    );
    setIsCreatingNew(false);
    setLoading(false);
  }

  const loadCorrectionBridgeEffect = useEffectEvent(() => {
    void loadCorrectionBridge();
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadCorrectionBridgeEffect();
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
    setShowForm(true);
    setIsCreatingNew(true);
    notify("New correction policy form opened.");
  }

  async function deleteCorrectionPolicy(policyId: string) {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");
    if ((assignedCounts[policyId] || 0) > 0 || activeAssignmentPolicyIds[policyId]) {
      return notify("This policy is currently assigned to employees. Reassign the workforce to another policy before deletion.");
    }

    const response = await fetch(`/api/company/policies/${policyId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to delete correction policy.");
    }

    if (draft.policyId === policyId) {
      setShowForm(false);
      setIsCreatingNew(false);
    }
    notify("Correction policy deleted.");
    await loadCorrectionBridge();
  }

  async function saveCorrectionPolicy(targetStatus: "Draft" | "Active") {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");

    const creating = !draft.policyId;
    const defaultCompanyPolicy = targetStatus === "Active" ? draft.defaultCompanyPolicy : "No";
    setSaving(true);
    const response = await fetch("/api/company/policies/correction-bridge", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...draft,
        defaultCompanyPolicy,
        status: targetStatus,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; policyId?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to save correction policy.");
    }
    const nextPolicy = {
      ...draft,
      defaultCompanyPolicy,
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
    showSuccess(getCorrectionPolicySuccessMessage(targetStatus, creating, draft.status));
    await loadCorrectionBridge();
  }

  function getCorrectionPolicySuccessMessage(targetStatus: "Draft" | "Active", creating: boolean, currentStatus: string) {
    if (creating) {
      return targetStatus === "Active" ? "Policy Enforced Successfully" : "Policy Saved as Draft";
    }
    if (targetStatus === "Active") {
      return currentStatus === "Draft" ? "Policy Updated And Enforced Successfully" : "Policy Updated Successfully";
    }
    return "Draft Updated Successfully";
  }

  function saveExistingCorrectionPolicy() {
    return saveCorrectionPolicy(draft.status === "Active" ? "Active" : "Draft");
  }

  return (
    <PolicyPage
      badge="Correction / Regularization Policy"
      title="Correction / Regularization Policy"
      description="Maintain company correction and regularization policy records and define request eligibility, approval workflow, and request limit governance."
    >
      <PolicySuccessOverlay message={successMessage} />
      {toast ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
          {toast}
        </div>
      ) : null}

      <PolicyRegisterSection
        description="Maintain approved correction and regularization policies with effective governance dates, ownership, and default company applicability."
        onCreate={openNewForm}
        onEdit={(rowId) => {
          const selected = savedPolicies.find((policy) => policy.policyId === rowId);
          if (!selected) return notify("Selected correction policy was not found.");
          setDraft(selected);
          setShowForm(true);
          setIsCreatingNew(false);
          notify("Current correction policy opened for editing.");
        }}
        onDelete={(rowId) => {
          void deleteCorrectionPolicy(rowId);
        }}
        emptyState={loading ? "Loading correction policies..." : "No correction policies available."}
        rows={savedPolicies.map((policy) => ({
          id: policy.policyId || `${policy.policyName}-${policy.policyCode}`,
          name: policy.policyName,
          assignedWorkforce: String(assignedCounts[policy.policyId] || 0),
          policyCode: policy.policyCode,
          effectiveFrom: policy.effectiveFrom,
          reviewDueOn: policy.nextReviewDate,
          status: policy.status,
          createdBy: "Company Admin",
          createdOn: policy.createdOn || "",
          defaultPolicy: policy.defaultCompanyPolicy,
        }))}
      />

      {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading correction policy...</div> : null}

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
            notify("Correction policy form closed.");
          }}
        >
          {isCreatingNew ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              New correction policy draft. Fill the form and save to create a separate policy.
            </div>
          ) : null}
          <PolicySection
            title={isCreatingNew ? "New Policy Details" : "Policy Details"}
            description="Define the administrative identity, governance dates, and company-level applicability of this correction policy."
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
                  onChange={(e) => update("defaultCompanyPolicy", e.target.value as CorrectionPolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
                <p className="mt-2 text-xs text-slate-500">{defaultPolicyHelperText}</p>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Correction Request Rules"
            description="Define which attendance scenarios are eligible for correction or regularization under this policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Attendance Correction Enabled">
                <Select
                  value={draft.attendanceCorrectionEnabled}
                  onChange={(e) => update("attendanceCorrectionEnabled", e.target.value as CorrectionPolicyState["attendanceCorrectionEnabled"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              {!correctionSettingsDisabled ? (
                <>
                  <Field label="Missing Punch Correction Allowed">
                    <Select
                      value={draft.missingPunchCorrectionAllowed}
                      onChange={(e) => update("missingPunchCorrectionAllowed", e.target.value as CorrectionPolicyState["missingPunchCorrectionAllowed"])}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </Select>
                  </Field>
                  <Field label="Late Punch Regularization Allowed">
                    <Select
                      value={draft.latePunchRegularizationAllowed}
                      onChange={(e) => update("latePunchRegularizationAllowed", e.target.value as CorrectionPolicyState["latePunchRegularizationAllowed"])}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </Select>
                  </Field>
                  <Field label="Early Go Regularization Allowed">
                    <Select
                      value={draft.earlyGoRegularizationAllowed}
                      onChange={(e) => update("earlyGoRegularizationAllowed", e.target.value as CorrectionPolicyState["earlyGoRegularizationAllowed"])}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </Select>
                  </Field>
                </>
              ) : null}
            </div>
            {correctionSettingsDisabled ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Attendance correction is disabled. All request eligibility, limits, approval, and reason settings stay hidden until you enable it again.
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                When enabled, the request window, approval flow, and reason rules below control employee correction requests.
              </p>
            )}
          </PolicySection>

          {!correctionSettingsDisabled ? (
          <PolicySection
            title="Request Window & Limits"
            description="Define the submission window, backdated request permission, and monthly correction request thresholds."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Correction Request Window (Days)">
                <TextInput
                  type="number"
                  min={CORRECTION_POLICY_LIMITS.correctionRequestWindow.min}
                  max={CORRECTION_POLICY_LIMITS.correctionRequestWindow.max}
                  step="1"
                  inputMode="numeric"
                  value={draft.correctionRequestWindow}
                  onChange={(e) => update("correctionRequestWindow", e.target.value)}
                  disabled={correctionSettingsDisabled}
                />
              </Field>
              <Field label="Backdated Correction Allowed">
                <Select
                  value={draft.backdatedCorrectionAllowed}
                  onChange={(e) => update("backdatedCorrectionAllowed", e.target.value as CorrectionPolicyState["backdatedCorrectionAllowed"])}
                  disabled={correctionSettingsDisabled}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Maximum Backdated Days">
                <TextInput
                  type="number"
                  min={CORRECTION_POLICY_LIMITS.maximumBackdatedDays.min}
                  max={CORRECTION_POLICY_LIMITS.maximumBackdatedDays.max}
                  step="1"
                  inputMode="numeric"
                  value={draft.maximumBackdatedDays}
                  onChange={(e) => update("maximumBackdatedDays", e.target.value)}
                  disabled={backdatedSettingsDisabled}
                />
              </Field>
              <Field label="Maximum Requests Per Month">
                <TextInput
                  type="number"
                  min={CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.min}
                  max={CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.max}
                  step="1"
                  inputMode="numeric"
                  value={draft.maximumRequestsPerMonth}
                  onChange={(e) => update("maximumRequestsPerMonth", e.target.value)}
                  disabled={correctionSettingsDisabled}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {draft.backdatedCorrectionAllowed === "Yes"
                ? "Employees can raise backdated corrections only within the configured maximum days."
                : "Backdated correction is disabled, so maximum backdated days is inactive."}
            </p>
          </PolicySection>
          ) : null}

          {!correctionSettingsDisabled ? (
          <PolicySection
            title="Approval Rules"
            description="Define whether correction requests require approval and which authority should review them."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Approval Required">
                <Select
                  value={draft.approvalRequired}
                  onChange={(e) => update("approvalRequired", e.target.value as CorrectionPolicyState["approvalRequired"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Approval Flow">
                <Select
                  value={draft.approvalFlow}
                  onChange={(e) => update("approvalFlow", e.target.value as CorrectionPolicyState["approvalFlow"])}
                  disabled={approvalFlowDisabled}
                >
                  <option value="Manager Approval">Manager Approval</option>
                  <option value="HR Approval">HR Approval</option>
                  <option value="Manager + HR Approval">Manager + HR Approval</option>
                </Select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {draft.approvalRequired === "Yes"
                ? "Requests will follow the selected approval workflow."
                : "Requests will auto-approve when approval is not required."}
            </p>
          </PolicySection>
          ) : null}

          {!correctionSettingsDisabled ? (
          <PolicySection
            title="Reason Rules"
            description="Define the minimum justification requirement expected when employees raise correction or regularization requests."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Reason Mandatory">
                <Select
                  value={draft.reasonMandatory}
                  onChange={(e) => update("reasonMandatory", e.target.value as CorrectionPolicyState["reasonMandatory"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Reason validation is enforced when employees submit eligible correction requests.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {isCreatingNew ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveCorrectionPolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCorrectionPolicy("Draft")}
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
                    onClick={() => void saveCorrectionPolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveExistingCorrectionPolicy()}
                    disabled={saving}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {saving ? "Processing..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveExistingCorrectionPolicy()}
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
                  notify("Correction policy form closed.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </PolicySection>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2">
              {isCreatingNew ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveCorrectionPolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCorrectionPolicy("Draft")}
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
                    onClick={() => void saveCorrectionPolicy("Active")}
                    disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Processing..." : "Enforce Policy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveExistingCorrectionPolicy()}
                    disabled={saving}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {saving ? "Processing..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void saveExistingCorrectionPolicy()}
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
                  notify("Correction policy form closed.");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          )}
        </PolicyFormModal>
      ) : null}
    </PolicyPage>
  );
}
