"use client";

import { useMemo, useState } from "react";
import {
  AsideCard,
  Field,
  InfoTile,
  PolicyActions,
  PolicyPage,
  PolicySection,
  Select,
  SnapshotRow,
  TextArea,
  TextInput,
} from "@/components/company/policy-ui";

type Mode = "draft" | "published";
type CorrectionState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  correctionWindowDays: string;
  allowMissingPunchCorrection: "yes" | "no";
  allowBackdatedRequests: "yes" | "no";
  managerApprovalRequired: "yes" | "no";
  hrApprovalRequired: "yes" | "no";
  maxRequestsPerMonth: string;
  reasonMandatory: "yes" | "no";
  attachmentRequired: "yes" | "no";
  regularizationAffectsAttendance: "yes" | "no";
  notes: string;
};

const initialState: CorrectionState = {
  policyName: "Standard Correction Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  correctionWindowDays: "7",
  allowMissingPunchCorrection: "yes",
  allowBackdatedRequests: "yes",
  managerApprovalRequired: "yes",
  hrApprovalRequired: "no",
  maxRequestsPerMonth: "3",
  reasonMandatory: "yes",
  attachmentRequired: "no",
  regularizationAffectsAttendance: "yes",
  notes: "Approved regularization should fix incomplete punch and final attendance status only when policy conditions are met.",
};

export default function NewCorrectionPolicyPage() {
  const [mode, setMode] = useState<Mode>("draft");
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);

  function update<K extends keyof CorrectionState>(key: K, value: CorrectionState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  const approvalFlow = useMemo(() => {
    if (draft.managerApprovalRequired === "yes" && draft.hrApprovalRequired === "yes") return "Manager + HR approval";
    if (draft.managerApprovalRequired === "yes") return "Manager approval";
    if (draft.hrApprovalRequired === "yes") return "HR approval";
    return "No approval";
  }, [draft.managerApprovalRequired, draft.hrApprovalRequired]);

  return (
    <PolicyPage
      badge="Correction Policy"
      title="Correction / Regularization Policy"
      description="Create a new standalone page for missing punch correction, backdated regularization, approval flow, and attendance update rules."
      actions={<PolicyActions onDraft={() => { setMode("draft"); notify("Correction policy draft saved locally."); }} onPublish={() => { setMode("published"); notify("Correction policy marked ready for backend wiring."); }} />}
      aside={
        <AsideCard title="Policy Snapshot" description="Preview of regularization limits and approval rules.">
          <SnapshotRow label="Window" value={`${draft.correctionWindowDays} days from attendance date`} />
          <SnapshotRow label="Missing Punch" value={draft.allowMissingPunchCorrection === "yes" ? "Correction allowed" : "Correction blocked"} />
          <SnapshotRow label="Approval Flow" value={approvalFlow} />
          <SnapshotRow label="Attendance Impact" value={draft.regularizationAffectsAttendance === "yes" ? "Approved requests update attendance" : "Approved requests stay audit-only"} />
        </AsideCard>
      }
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} tone="sky" />
        <InfoTile label="Version" value={draft.version} />
        <InfoTile label="Effective Date" value={draft.effectiveDate} />
        <InfoTile label="Window" value={`${draft.correctionWindowDays} Days`} tone="emerald" />
      </div>

      <PolicySection title="Request Rules" description="Define when and how employees can raise attendance corrections." tone="slate">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Policy Name"><TextInput value={draft.policyName} onChange={(e) => update("policyName", e.target.value)} /></Field>
          <Field label="Effective Date"><TextInput type="date" value={draft.effectiveDate} onChange={(e) => update("effectiveDate", e.target.value)} /></Field>
          <Field label="Correction Window (days)"><TextInput value={draft.correctionWindowDays} onChange={(e) => update("correctionWindowDays", e.target.value)} /></Field>
          <Field label="Maximum Requests Per Month"><TextInput value={draft.maxRequestsPerMonth} onChange={(e) => update("maxRequestsPerMonth", e.target.value)} /></Field>
          <Field label="Allow Missing Punch Correction">
            <Select value={draft.allowMissingPunchCorrection} onChange={(e) => update("allowMissingPunchCorrection", e.target.value as CorrectionState["allowMissingPunchCorrection"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Allow Backdated Requests">
            <Select value={draft.allowBackdatedRequests} onChange={(e) => update("allowBackdatedRequests", e.target.value as CorrectionState["allowBackdatedRequests"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Reason Mandatory">
            <Select value={draft.reasonMandatory} onChange={(e) => update("reasonMandatory", e.target.value as CorrectionState["reasonMandatory"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Attachment Required">
            <Select value={draft.attachmentRequired} onChange={(e) => update("attachmentRequired", e.target.value as CorrectionState["attachmentRequired"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </div>
      </PolicySection>

      <PolicySection title="Approval and Attendance Impact" description="Define who approves corrections and whether approval changes final attendance.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Manager Approval Required">
            <Select value={draft.managerApprovalRequired} onChange={(e) => update("managerApprovalRequired", e.target.value as CorrectionState["managerApprovalRequired"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="HR Approval Required">
            <Select value={draft.hrApprovalRequired} onChange={(e) => update("hrApprovalRequired", e.target.value as CorrectionState["hrApprovalRequired"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Approved Regularization Updates Attendance">
            <Select value={draft.regularizationAffectsAttendance} onChange={(e) => update("regularizationAffectsAttendance", e.target.value as CorrectionState["regularizationAffectsAttendance"])}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
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
