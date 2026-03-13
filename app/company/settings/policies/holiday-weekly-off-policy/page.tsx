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

type HolidayPolicyState = {
  policyId: string;
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy: "Yes" | "No";
  holidaySource: "Company" | "Government" | "Mixed";
  weeklyOffPattern: "Sunday Only" | "Saturday + Sunday" | "Alternate Saturday + Sunday" | "Custom";
  customWeeklyOffPattern: string;
  holidayPunchAllowed: "Yes" | "No";
  weeklyOffPunchAllowed: "Yes" | "No";
  holidayWorkedStatus: "Holiday Worked" | "Present" | "OT Only";
  weeklyOffWorkedStatus: "Weekly Off Worked" | "Present" | "OT Only";
  compOffEnabled: "Yes" | "No";
  compOffValidityDays: string;
};

const initialState: HolidayPolicyState = {
  policyId: "",
  policyName: "Standard Holiday Policy",
  policyCode: "HOL-001",
  effectiveFrom: "2026-03-13",
  nextReviewDate: "2027-03-13",
  status: "Draft",
  defaultCompanyPolicy: "Yes",
  holidaySource: "Mixed",
  weeklyOffPattern: "Sunday Only",
  customWeeklyOffPattern: "",
  holidayPunchAllowed: "Yes",
  weeklyOffPunchAllowed: "Yes",
  holidayWorkedStatus: "Holiday Worked",
  weeklyOffWorkedStatus: "Weekly Off Worked",
  compOffEnabled: "Yes",
  compOffValidityDays: "60",
};

function createNewPolicyDraft(): HolidayPolicyState {
  return {
    ...initialState,
    policyName: "",
    policyCode: "",
    defaultCompanyPolicy: "No",
  };
}

export default function HolidayWeeklyOffPolicyPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);
  const [savedPolicies, setSavedPolicies] = useState<HolidayPolicyState[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function update<K extends keyof HolidayPolicyState>(key: K, value: HolidayPolicyState[K]) {
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

  async function loadHolidayBridge() {
    const token = await accessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/company/policies/holiday-bridge", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = (await response.json().catch(() => ({}))) as Partial<HolidayPolicyState> & { error?: string };
    if (!response.ok) {
      notify(result.error || "Unable to load holiday policy.");
      setLoading(false);
      return;
    }

    const nextPolicy = { ...initialState, ...result };
    setDraft(nextPolicy);
    const policiesResponse = await fetch("/api/company/policies?policy_type=holiday_weekoff", {
      headers: { authorization: `Bearer ${token}` },
    });
    const policiesResult = (await policiesResponse.json().catch(() => ({}))) as {
      policies?: Array<{ id: string; policyName: string; policyCode: string; effectiveFrom: string; nextReviewDate: string; status: string; isDefault: boolean; configJson?: Record<string, unknown> }>;
    };
    const loadedPolicies =
      Array.isArray(policiesResult.policies) && policiesResult.policies.length > 0
        ? policiesResult.policies.map((policy) => {
            const config = (policy.configJson || {}) as Partial<HolidayPolicyState>;
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
            } satisfies HolidayPolicyState;
          })
        : [nextPolicy];
    setSavedPolicies(loadedPolicies);
    setIsCreatingNew(false);
    setLoading(false);
  }

  useEffect(() => {
    void loadHolidayBridge();
  }, []);

  function openNewForm() {
    setDraft(createNewPolicyDraft());
    setShowForm(true);
    setIsCreatingNew(true);
    notify("New holiday policy form opened.");
  }

  async function saveHolidayPolicy() {
    const token = await accessToken();
    if (!token) return notify("Company session not found. Please login again.");

    const creating = !draft.policyId;
    setSaving(true);
    const response = await fetch("/api/company/policies/holiday-bridge", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(draft),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; policyId?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return notify(result.error || "Unable to save holiday policy.");
    }
    const nextPolicy = {
      ...draft,
      policyId: result.policyId || draft.policyId,
    };
    setDraft(nextPolicy);
    setSavedPolicies((current) => {
      const next = current.filter((policy) => policy.policyId !== nextPolicy.policyId);
      return [nextPolicy, ...next];
    });
    setIsCreatingNew(false);
    setShowForm(false);
    showSuccess(creating ? "New Policy Created Successfully" : "Policy Updated Successfully");
  }

  return (
    <PolicyPage
      badge="Holiday / Weekly Off Policy"
      title="Holiday / Weekly Off Policy"
      description="Maintain company holiday and weekly off policy records and define non-working day rules, punch handling, worked-day treatment, and comp off governance."
    >
      <PolicySuccessOverlay message={successMessage} />
      {toast ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
          {toast}
        </div>
      ) : null}

      <PolicyRegisterSection
        description="Maintain approved holiday and weekly off policies with effective governance dates, ownership, and default company applicability."
        onCreate={openNewForm}
        onEdit={(rowId) => {
          const selected = savedPolicies.find((policy) => policy.policyId === rowId);
          if (!selected) return notify("Selected holiday policy was not found.");
          setDraft(selected);
          setShowForm(true);
          setIsCreatingNew(false);
          notify("Current holiday policy opened for editing.");
        }}
        rows={(savedPolicies.length > 0 ? savedPolicies : [draft]).map((policy) => ({
          id: policy.policyId || `${policy.policyName}-${policy.policyCode}`,
          name: policy.policyName,
          assignedWorkforce: "24 Employees",
          policyCode: policy.policyCode,
          effectiveFrom: policy.effectiveFrom,
          reviewDueOn: policy.nextReviewDate,
          status: policy.status,
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:15 AM",
          defaultPolicy: policy.defaultCompanyPolicy,
        }))}
      />

      {loading ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading holiday policy...</div> : null}

      {!loading && showForm ? (
        <>
          {isCreatingNew ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              New holiday / weekly off policy draft. Fill the form and save to create a separate policy.
            </div>
          ) : null}
          <PolicySection
            title={isCreatingNew ? "New Policy Details" : "Policy Details"}
            description="Define the administrative identity, governance dates, and company-level applicability of this holiday and weekly off policy."
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
                <Select value={draft.status} onChange={(e) => update("status", e.target.value as HolidayPolicyState["status"])}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </Select>
              </Field>
              <Field label="Default Company Policy">
                <Select
                  value={draft.defaultCompanyPolicy}
                  onChange={(e) => update("defaultCompanyPolicy", e.target.value as HolidayPolicyState["defaultCompanyPolicy"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Holiday Calendar & Weekly Off Rules"
            description="Define the source of company holidays and the standard weekly off pattern applicable under this policy."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Holiday Source">
                <Select value={draft.holidaySource} onChange={(e) => update("holidaySource", e.target.value as HolidayPolicyState["holidaySource"])}>
                  <option value="Company">Company Holidays</option>
                  <option value="Government">Government Holidays</option>
                  <option value="Mixed">Company + Government</option>
                </Select>
              </Field>
              <Field label="Weekly Off Pattern">
                <Select
                  value={draft.weeklyOffPattern}
                  onChange={(e) => update("weeklyOffPattern", e.target.value as HolidayPolicyState["weeklyOffPattern"])}
                >
                  <option value="Sunday Only">Sunday Only</option>
                  <option value="Saturday + Sunday">Saturday + Sunday</option>
                  <option value="Alternate Saturday + Sunday">Alternate Saturday + Sunday</option>
                  <option value="Custom">Custom</option>
                </Select>
              </Field>
              {draft.weeklyOffPattern === "Custom" ? (
                <Field label="Custom Weekly Off Pattern">
                  <TextInput
                    value={draft.customWeeklyOffPattern}
                    onChange={(e) => update("customWeeklyOffPattern", e.target.value)}
                    placeholder="Example: 2nd and 4th Saturday, Sunday"
                  />
                </Field>
              ) : null}
            </div>
          </PolicySection>

          <PolicySection
            title="Worked On Non-Working Day Rules"
            description="Define whether punches are allowed on holidays and weekly offs, and how worked non-working days should be recorded."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Holiday Punch Allowed">
                <Select
                  value={draft.holidayPunchAllowed}
                  onChange={(e) => update("holidayPunchAllowed", e.target.value as HolidayPolicyState["holidayPunchAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Weekly Off Punch Allowed">
                <Select
                  value={draft.weeklyOffPunchAllowed}
                  onChange={(e) => update("weeklyOffPunchAllowed", e.target.value as HolidayPolicyState["weeklyOffPunchAllowed"])}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="If Punched On Holiday">
                <Select
                  value={draft.holidayWorkedStatus}
                  onChange={(e) => update("holidayWorkedStatus", e.target.value as HolidayPolicyState["holidayWorkedStatus"])}
                >
                  <option value="Holiday Worked">Holiday Worked</option>
                  <option value="Present">Present</option>
                  <option value="OT Only">OT Only</option>
                </Select>
              </Field>
              <Field label="If Punched On Weekly Off">
                <Select
                  value={draft.weeklyOffWorkedStatus}
                  onChange={(e) => update("weeklyOffWorkedStatus", e.target.value as HolidayPolicyState["weeklyOffWorkedStatus"])}
                >
                  <option value="Weekly Off Worked">Weekly Off Worked</option>
                  <option value="Present">Present</option>
                  <option value="OT Only">OT Only</option>
                </Select>
              </Field>
            </div>
          </PolicySection>

          <PolicySection
            title="Comp Off Rules"
            description="Define whether compensatory off should be issued for worked non-working days and how long the comp off balance remains valid."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Comp Off Enabled">
                <Select value={draft.compOffEnabled} onChange={(e) => update("compOffEnabled", e.target.value as HolidayPolicyState["compOffEnabled"])}>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </Select>
              </Field>
              <Field label="Comp Off Validity (Days)">
                <TextInput value={draft.compOffValidityDays} onChange={(e) => update("compOffValidityDays", e.target.value)} />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveHolidayPolicy()}
                disabled={saving}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "Submitting..." : "Submit"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  notify("Holiday policy form closed.");
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
