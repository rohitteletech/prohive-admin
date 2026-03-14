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

type CorrectionPolicyState = {
  policyId: string;
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  attendanceCorrectionEnabled: "Yes" | "No";
  missingPunchCorrectionAllowed: "Yes" | "No";
  latePunchRegularizationAllowed: "Yes" | "No";
  earlyGoRegularizationAllowed: "Yes" | "No";
  correctionRequestWindow: string;
  backdatedCorrectionAllowed: "Yes" | "No";
  maximumBackdatedDays: string;
  approvalRequired: "Yes" | "No";
  approvalFlow: "Manager Approval" | "HR Approval" | "Manager + HR Approval";
  maximumRequestsPerMonth: string;
  reasonMandatory: "Yes" | "No";
};

const initialState: CorrectionPolicyState = {
  policyId: "",
  policyName: "Standard Correction Policy",
  policyCode: "COR-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  attendanceCorrectionEnabled: "Yes",
  missingPunchCorrectionAllowed: "Yes",
  latePunchRegularizationAllowed: "Yes",
  earlyGoRegularizationAllowed: "Yes",
  correctionRequestWindow: "7",
  backdatedCorrectionAllowed: "Yes",
  maximumBackdatedDays: "7",
  approvalRequired: "Yes",
  approvalFlow: "Manager + HR Approval",
  maximumRequestsPerMonth: "3",
  reasonMandatory: "Yes",
};

function createNewPolicyDraft(): CorrectionPolicyState {
  return {
    ...initialState,
    policyName: "",
    policyCode: "",
    defaultCompanyPolicy: "No",
  };
}

export default function CorrectionRegularizationPolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [savedPolicies, setSavedPolicies] = useState<CorrectionPolicyState[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function update<K extends keyof CorrectionPolicyState>(key: K, value: CorrectionPolicyState[K]) {
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
      policies?: Array<{ id: string; policyName: string; policyCode: string; effectiveFrom: string; nextReviewDate: string; status: string; isDefault: boolean; configJson?: Record<string, unknown> }>;
    };
    const assignmentsResult = (await assignmentsResponse.json().catch(() => ({}))) as {
      assignments?: Array<{ policyId: string; isActive: boolean }>;
    };
    const loadedPolicies =
      Array.isArray(policiesResult.policies) && policiesResult.policies.length > 0
        ? policiesResult.policies.map((policy) => {
            const config = (policy.configJson || {}) as Partial<CorrectionPolicyState>;
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
            } satisfies CorrectionPolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    const nextAssignedCounts = (assignmentsResult.assignments || []).reduce<Record<string, number>>((counts, assignment) => {
      if (!assignment.isActive || !assignment.policyId) return counts;
      counts[assignment.policyId] = (counts[assignment.policyId] || 0) + 1;
      return counts;
    }, {});
    setAssignedCounts(nextAssignedCounts);
    setIsCreatingNew(false);
    setLoading(false);
  }

  useEffect(() => {
    void loadCorrectionBridge();
  }, []);

  function openNewForm() {
    setDraft(createNewPolicyDraft());
    setShowForm(true);
    setIsCreatingNew(true);
    notify("New correction policy form opened.");
  }

  async function deleteCorrectionPolicy(policyId: string) {
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
    setSaving(true);
    const response = await fetch("/api/company/policies/correction-bridge", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...draft,
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
    showSuccess(
      targetStatus === "Active"
        ? (creating ? "Policy Enforced Successfully" : "Policy Updated And Enforced Successfully")
        : (creating ? "Policy Saved as Draft" : "Draft Updated Successfully"),
    );
    await loadCorrectionBridge();
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
          assignedWorkforce: policy.status === "Active" ? String(assignedCounts[policy.policyId] || 0) : "0",
          policyCode: policy.policyCode,
          effectiveFrom: policy.effectiveFrom,
          reviewDueOn: policy.nextReviewDate,
          status: policy.status,
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:20 AM",
          defaultPolicy: policy.defaultCompanyPolicy,
        }))}
      />

      {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading correction policy...</div> : null}

      {!loading && showForm ? (
        <>
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
            </div>
          </PolicySection>

          <PolicySection
            title="Request Window & Limits"
            description="Define the submission window, backdated request permission, and monthly correction request thresholds."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Correction Request Window (Days)">
                <TextInput value={draft.correctionRequestWindow} onChange={(e) => update("correctionRequestWindow", e.target.value)} />
              </Field>
              <Field label="Backdated Correction Allowed">
                <Select
                  value={draft.backdatedCorrectionAllowed}
                  onChange={(e) => update("backdatedCorrectionAllowed", e.target.value as CorrectionPolicyState["backdatedCorrectionAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Maximum Backdated Days">
                <TextInput value={draft.maximumBackdatedDays} onChange={(e) => update("maximumBackdatedDays", e.target.value)} />
              </Field>
              <Field label="Maximum Requests Per Month">
                <TextInput value={draft.maximumRequestsPerMonth} onChange={(e) => update("maximumRequestsPerMonth", e.target.value)} />
              </Field>
            </div>
          </PolicySection>

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
                  disabled={draft.approvalRequired === "No"}
                >
                  <option value="Manager Approval">Manager Approval</option>
                  <option value="HR Approval">HR Approval</option>
                  <option value="Manager + HR Approval">Manager + HR Approval</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Reason Rules"
            description="Define the minimum justification requirement expected when employees raise correction or regularization requests."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Reason Mandatory">
                <Select value={draft.reasonMandatory} onChange={(e) => update("reasonMandatory", e.target.value as CorrectionPolicyState["reasonMandatory"])}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
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
        </>
      ) : null}
    </PolicyPage>
  );
}
