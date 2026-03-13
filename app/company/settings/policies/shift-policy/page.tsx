"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AsideCard,
  Field,
  InfoTile,
  PolicyActions,
  PolicyPage,
  PolicySection,
  Select,
  SnapshotRow,
  TextInput,
} from "@/components/company/policy-ui";

type Mode = "draft" | "published";
type ShiftPolicyState = {
  policyName: string;
  version: string;
  effectiveDate: string;
  defaultShiftName: string;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: string;
  earlyInMinutes: string;
  minWorkBeforeOutMinutes: string;
  loginAccessRule: "any_time" | "shift_time_only";
  weeklyOffPattern: "sunday_only" | "saturday_sunday" | "alternate_saturday";
  shiftRotation: "fixed" | "rotational";
};

const initialState: ShiftPolicyState = {
  policyName: "Standard Shift Policy",
  version: "v1.0",
  effectiveDate: "2026-03-13",
  defaultShiftName: "General Shift",
  shiftStart: "09:00",
  shiftEnd: "18:00",
  graceMinutes: "10",
  earlyInMinutes: "15",
  minWorkBeforeOutMinutes: "60",
  loginAccessRule: "any_time",
  weeklyOffPattern: "sunday_only",
  shiftRotation: "fixed",
};

export default function NewShiftPolicyPage() {
  const [mode, setMode] = useState<Mode>("draft");
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialState);

  function update<K extends keyof ShiftPolicyState>(key: K, value: ShiftPolicyState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  return (
    <PolicyPage
      badge="Shift Policy"
      title="Shift Policy"
      description="Create a standalone shift policy page for shift timing, punch window access, weekly off pattern, and operational day structure."
      actions={<PolicyActions onDraft={() => { setMode("draft"); notify("Shift policy draft saved locally."); }} onPublish={() => { setMode("published"); notify("Shift policy marked ready for backend wiring."); }} />}
      aside={
        <>
          <AsideCard title="Policy Snapshot" description="Quick view of the shift policy this page is setting up.">
            <SnapshotRow label="Default Shift" value={`${draft.defaultShiftName}: ${draft.shiftStart} to ${draft.shiftEnd}`} />
            <SnapshotRow label="Login Access" value={draft.loginAccessRule === "any_time" ? "Punch allowed any time" : "Punch allowed only during shift time"} />
            <SnapshotRow label="Grace Rule" value={`${draft.graceMinutes} minutes after shift start`} />
            <SnapshotRow label="Weekly Off" value={draft.weeklyOffPattern === "sunday_only" ? "Sunday only" : draft.weeklyOffPattern === "saturday_sunday" ? "Saturday and Sunday" : "Alternate Saturday + Sunday"} />
          </AsideCard>
          <AsideCard title="Next Policies" description="Shift policy should align with attendance and holiday rules.">
            <Link href="/company/settings/policies/attendance-policy" className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Open Attendance Policy
            </Link>
          </AsideCard>
        </>
      }
    >
      {toast ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">{toast}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Status" value={mode === "published" ? "Published UI" : "Draft UI"} tone="sky" />
        <InfoTile label="Version" value={draft.version} />
        <InfoTile label="Effective Date" value={draft.effectiveDate} />
        <InfoTile label="Pattern" value={draft.shiftRotation === "fixed" ? "Fixed Shift" : "Rotational Shift"} tone="emerald" />
      </div>

      <PolicySection title="Core Shift Rules" description="Define default shift timings and base punch windows." tone="slate">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Policy Name"><TextInput value={draft.policyName} onChange={(e) => update("policyName", e.target.value)} /></Field>
          <Field label="Effective Date"><TextInput type="date" value={draft.effectiveDate} onChange={(e) => update("effectiveDate", e.target.value)} /></Field>
          <Field label="Default Shift Name"><TextInput value={draft.defaultShiftName} onChange={(e) => update("defaultShiftName", e.target.value)} /></Field>
          <Field label="Login Access Rule">
            <Select value={draft.loginAccessRule} onChange={(e) => update("loginAccessRule", e.target.value as ShiftPolicyState["loginAccessRule"])}>
              <option value="any_time">Allow Login Any Time</option>
              <option value="shift_time_only">Allow Login Only During Shift Time</option>
            </Select>
          </Field>
          <Field label="Shift Start"><TextInput type="time" value={draft.shiftStart} onChange={(e) => update("shiftStart", e.target.value)} /></Field>
          <Field label="Shift End"><TextInput type="time" value={draft.shiftEnd} onChange={(e) => update("shiftEnd", e.target.value)} /></Field>
          <Field label="Grace Period (mins)"><TextInput value={draft.graceMinutes} onChange={(e) => update("graceMinutes", e.target.value)} /></Field>
          <Field label="Early In Allowed (mins)"><TextInput value={draft.earlyInMinutes} onChange={(e) => update("earlyInMinutes", e.target.value)} /></Field>
          <Field label="Minimum Work Before Punch Out (mins)"><TextInput value={draft.minWorkBeforeOutMinutes} onChange={(e) => update("minWorkBeforeOutMinutes", e.target.value)} /></Field>
          <Field label="Shift Rotation">
            <Select value={draft.shiftRotation} onChange={(e) => update("shiftRotation", e.target.value as ShiftPolicyState["shiftRotation"])}>
              <option value="fixed">Fixed Shift</option>
              <option value="rotational">Rotational Shift</option>
            </Select>
          </Field>
        </div>
      </PolicySection>

      <PolicySection title="Weekly Off Mapping" description="Define the default non-working pattern used by attendance and holiday pages.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Weekly Off Pattern">
            <Select value={draft.weeklyOffPattern} onChange={(e) => update("weeklyOffPattern", e.target.value as ShiftPolicyState["weeklyOffPattern"])}>
              <option value="sunday_only">Sunday Only</option>
              <option value="saturday_sunday">Saturday + Sunday</option>
              <option value="alternate_saturday">Alternate Saturday + Sunday</option>
            </Select>
          </Field>
        </div>
      </PolicySection>
    </PolicyPage>
  );
}
