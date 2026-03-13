"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AsideCard,
  Field,
  InfoTile,
  PolicyActions,
  PolicyPage,
  PolicyRegisterSection,
  PolicySection,
  Select,
  SnapshotRow,
  TextArea,
  TextInput,
} from "@/components/company/policy-ui";

type Mode = "draft" | "published";
type LeaveState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  casualLeaveDays: string;
  sickLeaveDays: string;
  earnedLeaveDays: string;
  carryForwardEnabled: "yes" | "no";
  maxCarryForwardDays: string;
  halfDayLeaveAllowed: "yes" | "no";
  sandwichLeaveEnabled: "yes" | "no";
  approvalFlow: "manager" | "manager_hr";
  notes: string;
};

const initialState: LeaveState = {
  policyName: "Standard Leave Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  casualLeaveDays: "12",
  sickLeaveDays: "12",
  earnedLeaveDays: "18",
  carryForwardEnabled: "yes",
  maxCarryForwardDays: "10",
  halfDayLeaveAllowed: "yes",
  sandwichLeaveEnabled: "no",
  approvalFlow: "manager",
  notes: "Approved leave should override absent days, and half-day leave should combine correctly with attendance policy.",
};

export default function NewLeavePolicyPage() {
  const [mode, setMode] = useState<Mode>("draft");
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);

  function update<K extends keyof LeaveState>(key: K, value: LeaveState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  return (
    <PolicyPage
      badge="Leave Policy"
      title="Leave Policy"
      description="Create a new standalone leave policy page for leave balances, half-day leave, carry forward, and approval flow."
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              setDraft(initialState);
              setMode("draft");
              notify("New leave policy draft started.");
            }}
            className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100 xl:min-w-[150px]"
          >
            Create New Policy
          </button>
          <PolicyActions onDraft={() => { setMode("draft"); notify("Leave policy draft saved locally."); }} onPublish={() => { setMode("published"); notify("Leave policy marked ready for backend wiring."); }} />
        </>
      }
      aside={
        <>
          <AsideCard title="Policy Snapshot" description="High-level view of leave entitlements and approval flow.">
            <SnapshotRow label="Casual Leave" value={`${draft.casualLeaveDays} days`} />
            <SnapshotRow label="Sick Leave" value={`${draft.sickLeaveDays} days`} />
            <SnapshotRow label="Earned Leave" value={`${draft.earnedLeaveDays} days`} />
            <SnapshotRow label="Carry Forward" value={draft.carryForwardEnabled === "yes" ? `Enabled up to ${draft.maxCarryForwardDays} days` : "Disabled"} />
          </AsideCard>
          <AsideCard title="Next Policies" description="Leave rules must align with holiday and attendance override rules.">
            <Link href="/company/settings/policies/holiday-weekly-off-policy" className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Open Holiday Policy
            </Link>
          </AsideCard>
        </>
      }
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}
      <PolicyRegisterSection
        description="Maintain leave policy records with enforcement dates, periodic review checkpoints, and company-wide default assignment."
        onCreate={() => {
          setDraft(initialState);
          setMode("draft");
          notify("New leave policy draft started.");
        }}
        onEdit={() => notify("Current leave policy opened for editing.")}
        row={{
          name: draft.policyName,
          policyCode: "LEV-001",
          effectiveFrom: draft.effectiveDate,
          reviewDueOn: "2027-03-13",
          status: mode === "published" ? "Active" : "Draft",
          createdBy: "Company Admin",
          createdOn: "2026-03-13 08:10 AM",
          defaultPolicy: "Yes",
        }}
      />
      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} tone="sky" />
        <InfoTile label="Version" value={draft.version} />
        <InfoTile label="Effective Date" value={draft.effectiveDate} />
        <InfoTile label="Approval" value={draft.approvalFlow === "manager" ? "Manager" : "Manager + HR"} tone="emerald" />
      </div>

      <PolicySection title="Leave Balances" description="Define annual leave allocation and carry-forward rules." tone="slate">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Policy Name"><TextInput value={draft.policyName} onChange={(e) => update("policyName", e.target.value)} /></Field>
          <Field label="Effective Date"><TextInput type="date" value={draft.effectiveDate} onChange={(e) => update("effectiveDate", e.target.value)} /></Field>
          <Field label="Casual Leave Days"><TextInput value={draft.casualLeaveDays} onChange={(e) => update("casualLeaveDays", e.target.value)} /></Field>
          <Field label="Sick Leave Days"><TextInput value={draft.sickLeaveDays} onChange={(e) => update("sickLeaveDays", e.target.value)} /></Field>
          <Field label="Earned Leave Days"><TextInput value={draft.earnedLeaveDays} onChange={(e) => update("earnedLeaveDays", e.target.value)} /></Field>
          <Field label="Carry Forward Enabled">
            <Select value={draft.carryForwardEnabled} onChange={(e) => update("carryForwardEnabled", e.target.value as LeaveState["carryForwardEnabled"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Maximum Carry Forward Days"><TextInput value={draft.maxCarryForwardDays} onChange={(e) => update("maxCarryForwardDays", e.target.value)} /></Field>
          <Field label="Half Day Leave Allowed">
            <Select value={draft.halfDayLeaveAllowed} onChange={(e) => update("halfDayLeaveAllowed", e.target.value as LeaveState["halfDayLeaveAllowed"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>
      </PolicySection>

      <PolicySection title="Override and Approval Rules" description="Define how leave interacts with attendance and who approves it.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sandwich Leave Enabled">
            <Select value={draft.sandwichLeaveEnabled} onChange={(e) => update("sandwichLeaveEnabled", e.target.value as LeaveState["sandwichLeaveEnabled"])}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Approval Flow">
            <Select value={draft.approvalFlow} onChange={(e) => update("approvalFlow", e.target.value as LeaveState["approvalFlow"])}>
              <option value="manager">Manager Approval</option>
              <option value="manager_hr">Manager + HR Approval</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Policy Notes">
            <TextArea rows={5} value={draft.notes} onChange={(e) => update("notes", e.target.value)} />
          </Field>
        </div>
      </PolicySection>
    </PolicyPage>
  );
}
