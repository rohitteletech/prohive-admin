"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AssignmentLevel, labelAssignmentLevel, labelPolicyType, PolicyType } from "@/lib/companyPolicies";
import { Field, PolicyPage, PolicySection, Select, TextInput } from "@/components/company/policy-ui";

type PolicyOption = {
  id: string;
  policyType: PolicyType;
  policyName: string;
  policyCode: string;
  status: string;
};

type AssignmentRow = {
  id: string;
  policyType: PolicyType;
  policyTypeLabel: string;
  policyId: string;
  policyName: string;
  policyCode: string;
  assignmentLevel: AssignmentLevel;
  assignmentLevelLabel: string;
  targetId: string;
  targetLabel: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  statusLabel: string;
};

type TargetOption = { id: string; label: string };

type Payload = {
  policies: PolicyOption[];
  assignments: AssignmentRow[];
  targets: {
    company: TargetOption[];
    departments: TargetOption[];
    employees: TargetOption[];
  };
};

const initialForm = {
  policyType: "shift" as PolicyType,
  policyId: "",
  assignmentLevel: "company" as AssignmentLevel,
  targetId: "",
  effectiveFrom: "2026-03-13",
  effectiveTo: "",
};

export default function PolicyAssignmentsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload>({
    policies: [],
    assignments: [],
    targets: { company: [], departments: [], employees: [] },
  });
  const [form, setForm] = useState(initialForm);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function accessToken() {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    return sessionResult?.data.session?.access_token || "";
  }

  async function loadData() {
    const token = await accessToken();
    if (!token) {
      notify("Company session not found. Please login again.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/company/policy-assignments", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Payload & { error?: string };
    if (!response.ok) {
      notify(result.error || "Unable to load policy assignments.");
      setLoading(false);
      return;
    }

    setPayload(result);
    setForm((current) => {
      const nextPolicy = result.policies.find((policy) => policy.policyType === current.policyType) || result.policies[0];
      return {
        ...current,
        policyType: nextPolicy?.policyType || current.policyType,
        policyId: nextPolicy?.id || "",
        targetId: current.assignmentLevel === "company" ? result.targets.company[0]?.id || "" : current.targetId,
      };
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredPolicies = useMemo(
    () => payload.policies.filter((policy) => policy.policyType === form.policyType && policy.status !== "archived"),
    [payload.policies, form.policyType],
  );

  const targetOptions = useMemo(() => {
    if (form.assignmentLevel === "company") return payload.targets.company;
    if (form.assignmentLevel === "department") return payload.targets.departments;
    return payload.targets.employees;
  }, [payload.targets, form.assignmentLevel]);

  useEffect(() => {
    const nextPolicy = filteredPolicies[0];
    setForm((current) => ({
      ...current,
      policyId: filteredPolicies.some((policy) => policy.id === current.policyId) ? current.policyId : nextPolicy?.id || "",
    }));
  }, [filteredPolicies]);

  useEffect(() => {
    const nextTarget = targetOptions[0];
    setForm((current) => ({
      ...current,
      targetId: targetOptions.some((target) => target.id === current.targetId) ? current.targetId : nextTarget?.id || "",
    }));
  }, [targetOptions]);

  async function saveAssignment() {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");
    if (!form.policyId) return notify("Select a policy to assign.");
    if (!form.targetId && form.assignmentLevel !== "company") return notify("Select an assignment target.");
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
      return notify("Effective To date cannot be earlier than Effective From date.");
    }
    if (form.assignmentLevel !== "company" && targetOptions.length === 0) {
      return notify(`No ${form.assignmentLevel} targets are available for assignment.`);
    }

    setSaving(true);
    const response = await fetch("/api/company/policy-assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(form),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);

    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to save policy assignment.");
    }

    notify("Policy assignment saved.");
    await loadData();
  }

  async function deactivateAssignment(id: string) {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");

    const response = await fetch(`/api/company/policy-assignments/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive: false }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to deactivate assignment.");
    }
    notify("Assignment deactivated.");
    await loadData();
  }

  return (
    <PolicyPage
      badge="Policy Assignments"
      title="Policy Assignments"
      description="Assign company policy definitions to company-wide scope, departments, or individual employees with effective dates and override priority."
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}

      <PolicySection
        title="Assignment Form"
        description="Select a policy type, choose the applicable policy, and assign it to company, department, or employee scope with an effective period."
        tone="slate"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Policy Type">
            <Select
              value={form.policyType}
              onChange={(e) => setForm((current) => ({ ...current, policyType: e.target.value as PolicyType }))}
            >
              <option value="shift">Shift Policy</option>
              <option value="attendance">Attendance Policy</option>
              <option value="leave">Leave Policy</option>
              <option value="holiday_weekoff">Holiday / Weekly Off Policy</option>
              <option value="correction">Correction / Regularization Policy</option>
            </Select>
          </Field>

          <Field label="Select Policy">
            <Select value={form.policyId} onChange={(e) => setForm((current) => ({ ...current, policyId: e.target.value }))}>
              {filteredPolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.policyName} ({policy.policyCode})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assignment Level">
            <Select
              value={form.assignmentLevel}
              onChange={(e) => setForm((current) => ({ ...current, assignmentLevel: e.target.value as AssignmentLevel }))}
            >
              <option value="company">{labelAssignmentLevel("company")}</option>
              <option value="department">{labelAssignmentLevel("department")}</option>
              <option value="employee">{labelAssignmentLevel("employee")}</option>
            </Select>
          </Field>

          <Field label="Select Target">
            <Select
              value={form.targetId}
              onChange={(e) => setForm((current) => ({ ...current, targetId: e.target.value }))}
              disabled={form.assignmentLevel === "company" || targetOptions.length === 0}
            >
              {targetOptions.length === 0 ? <option value="">No targets available</option> : null}
              {targetOptions.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Effective From">
            <TextInput
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => setForm((current) => ({ ...current, effectiveFrom: e.target.value }))}
            />
          </Field>

          <Field label="Effective To">
            <TextInput
              type="date"
              value={form.effectiveTo}
              onChange={(e) => setForm((current) => ({ ...current, effectiveTo: e.target.value }))}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveAssignment()}
            disabled={saving || loading}
            className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {saving ? "Saving..." : "Save Assignment"}
          </button>
        </div>
      </PolicySection>

      <PolicySection
        title="Assignment Register"
        description="Review active and inactive policy assignments across company, department, and employee levels."
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-[0.14em] text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Policy Type</th>
                <th className="px-4 py-3 font-semibold">Policy Name</th>
                <th className="px-4 py-3 font-semibold">Assignment Level</th>
                <th className="px-4 py-3 font-semibold">Target</th>
                <th className="px-4 py-3 font-semibold">Effective From</th>
                <th className="px-4 py-3 font-semibold">Effective To</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white text-slate-800">
              {payload.assignments.map((assignment) => (
                <tr key={assignment.id} className="border-t border-slate-200">
                  <td className="px-4 py-3">{assignment.policyTypeLabel}</td>
                  <td className="px-4 py-3 font-medium">{assignment.policyName}</td>
                  <td className="px-4 py-3">{assignment.assignmentLevelLabel}</td>
                  <td className="px-4 py-3">
                    {assignment.targetLabel}
                  </td>
                  <td className="px-4 py-3">{assignment.effectiveFrom}</td>
                  <td className="px-4 py-3">{assignment.effectiveTo || "-"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                      {assignment.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {assignment.isActive ? (
                      <button
                        type="button"
                        onClick={() => void deactivateAssignment(assignment.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">No actions</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && payload.assignments.length === 0 ? (
                <tr className="border-t border-slate-200">
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No assignments created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PolicySection>
    </PolicyPage>
  );
}
